import { getDb } from '@xbase/db/client';
import {
  type OAuthClient,
  type OAuthCode,
  type OAuthTokenKind,
  oauthClients,
  oauthCodes,
  oauthGrants,
  oauthTokens,
} from '@xbase/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

// The authorization server's SQL. Claims are single UPDATE … WHERE … IS NULL statements, so two
// requests racing with the same code or refresh token can't both win.

export type TokenPair = {
  accessHash: string;
  refreshHash: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
};

export function getClient(clientId: string): OAuthClient | undefined {
  return getDb().select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).get();
}

/** Inserts a client, or refreshes a CIMD client's cached metadata. */
export function saveClient(client: typeof oauthClients.$inferInsert): OAuthClient {
  const { kind, clientName, redirectUris, fetchedAt } = client;
  return getDb()
    .insert(oauthClients)
    .values(client)
    .onConflictDoUpdate({
      target: oauthClients.clientId,
      set: { kind, clientName, redirectUris, fetchedAt },
    })
    .returning()
    .get();
}

export function insertCode(code: typeof oauthCodes.$inferInsert): void {
  getDb().insert(oauthCodes).values(code).run();
}

/** Marks a code used and returns it; undefined when it's unknown or was used before. */
export function claimCode(codeHash: string, now: Date): OAuthCode | undefined {
  return getDb()
    .update(oauthCodes)
    .set({ usedAt: now })
    .where(and(eq(oauthCodes.codeHash, codeHash), isNull(oauthCodes.usedAt)))
    .returning()
    .get();
}

/** The grant a used code was exchanged for, if any. */
export function grantOfCode(codeHash: string): string | null {
  const row = getDb()
    .select({ grantId: oauthCodes.grantId })
    .from(oauthCodes)
    .where(eq(oauthCodes.codeHash, codeHash))
    .get();
  return row?.grantId ?? null;
}

/** Revoking a grant kills its tokens: every lookup requires an unrevoked grant. */
export function revokeGrant(grantId: string, now: Date): void {
  getDb()
    .update(oauthGrants)
    .set({ revokedAt: now })
    .where(and(eq(oauthGrants.id, grantId), isNull(oauthGrants.revokedAt)))
    .run();
}

export function touchGrant(grantId: string, now: Date): void {
  getDb().update(oauthGrants).set({ lastUsedAt: now }).where(eq(oauthGrants.id, grantId)).run();
}

/** Records the consent a code was exchanged for and issues its first tokens, in one transaction. */
export function createGrant(code: OAuthCode, tokens: TokenPair, now: Date): string {
  return getDb().transaction((tx) => {
    const { id } = tx
      .insert(oauthGrants)
      .values({
        clientId: code.clientId,
        scope: code.scope,
        resource: code.resource,
        createdAt: now,
        lastUsedAt: now,
      })
      .returning({ id: oauthGrants.id })
      .get();
    tx.update(oauthCodes).set({ grantId: id }).where(eq(oauthCodes.codeHash, code.codeHash)).run();
    tx.insert(oauthTokens)
      .values(tokenRows(id, tokens, now))
      .run();
    return id;
  });
}

/**
 * Swaps a refresh token for a new pair. False when the old one was already used: a replay, which
 * the caller answers by revoking the grant.
 */
export function rotateRefreshToken(
  refreshHash: string,
  grantId: string,
  tokens: TokenPair,
  now: Date,
): boolean {
  return getDb().transaction((tx) => {
    const { changes } = tx
      .update(oauthTokens)
      .set({ rotatedAt: now })
      .where(
        and(
          eq(oauthTokens.tokenHash, refreshHash),
          eq(oauthTokens.kind, 'refresh'),
          isNull(oauthTokens.rotatedAt),
        ),
      )
      .run();
    if (Number(changes) !== 1) return false;
    tx.insert(oauthTokens)
      .values(tokenRows(grantId, tokens, now))
      .run();
    tx.update(oauthGrants).set({ lastUsedAt: now }).where(eq(oauthGrants.id, grantId)).run();
    return true;
  });
}

/** A token with the grant it belongs to; `kind` narrows the lookup. */
export function findToken(tokenHash: string, kind?: OAuthTokenKind) {
  return getDb()
    .select({
      tokenHash: oauthTokens.tokenHash,
      grantId: oauthTokens.grantId,
      expiresAt: oauthTokens.expiresAt,
      rotatedAt: oauthTokens.rotatedAt,
      clientId: oauthGrants.clientId,
      scope: oauthGrants.scope,
      resource: oauthGrants.resource,
      revokedAt: oauthGrants.revokedAt,
      lastUsedAt: oauthGrants.lastUsedAt,
    })
    .from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grantId))
    .where(and(eq(oauthTokens.tokenHash, tokenHash), kind ? eq(oauthTokens.kind, kind) : undefined))
    .get();
}

function tokenRows(grantId: string, tokens: TokenPair, now: Date) {
  return [
    {
      tokenHash: tokens.accessHash,
      kind: 'access' as const,
      grantId,
      expiresAt: tokens.accessExpiresAt,
      createdAt: now,
    },
    {
      tokenHash: tokens.refreshHash,
      kind: 'refresh' as const,
      grantId,
      expiresAt: tokens.refreshExpiresAt,
      createdAt: now,
    },
  ];
}
