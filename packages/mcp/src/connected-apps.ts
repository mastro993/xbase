import type { ConnectedAppDto } from '@xbase/core/mcp';
import { getDb } from '@xbase/db/client';
import { oauthClients, oauthGrants, oauthTokens } from '@xbase/db/schema';
import { and, desc, eq, exists, gt, isNull } from 'drizzle-orm';
import { revokeGrant } from './oauth/store';

/**
 * Apps that can still reach /mcp: an unrevoked grant with a live refresh token. A grant whose
 * refresh token expired would need the owner's consent again, so it isn't listed. Newest first.
 */
export function listConnectedApps(now = new Date()): ConnectedAppDto[] {
  const db = getDb();
  const liveRefreshToken = db
    .select({ grantId: oauthTokens.grantId })
    .from(oauthTokens)
    .where(
      and(
        eq(oauthTokens.grantId, oauthGrants.id),
        eq(oauthTokens.kind, 'refresh'),
        isNull(oauthTokens.rotatedAt),
        gt(oauthTokens.expiresAt, now),
      ),
    );
  return db
    .select({
      grantId: oauthGrants.id,
      clientId: oauthClients.clientId,
      clientName: oauthClients.clientName,
      kind: oauthClients.kind,
      createdAt: oauthGrants.createdAt,
      lastUsedAt: oauthGrants.lastUsedAt,
    })
    .from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthClients.clientId, oauthGrants.clientId))
    .where(and(isNull(oauthGrants.revokedAt), exists(liveRefreshToken)))
    .orderBy(desc(oauthGrants.createdAt), desc(oauthGrants.id))
    .all()
    .map(({ grantId, clientId, clientName, kind, createdAt, lastUsedAt }) => ({
      grantId,
      clientId,
      clientName,
      kind,
      verifiedHost: kind === 'cimd' ? new URL(clientId).host : null,
      createdAt: createdAt.toISOString(),
      lastUsedAt: lastUsedAt?.toISOString() ?? null,
    }));
}

/** Disconnects an app: its tokens stop working at once. An unknown id is fine. */
export function revokeConnectedApp(grantId: string, now = new Date()): void {
  revokeGrant(grantId, now);
}
