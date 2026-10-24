import { and, eq, lt, notExists, or } from 'drizzle-orm';
import { getDb } from './db/client.server';
import { oauthClients, oauthCodes, oauthGrants, oauthTokens, sessions } from './db/schema';

const DAY = 24 * 60 * 60 * 1000;

type HousekeepingResult = {
  sessions: number;
  codes: number;
  tokens: number;
  grants: number;
  clients: number;
};

/** Deletes rows nothing can use any more. Safe to run at any time. */
export function runHousekeeping(now: Date): HousekeepingResult {
  const db = getDb();
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  return db.transaction((tx) => ({
    sessions: count(tx.delete(sessions).where(lt(sessions.expiresAt, now)).run()),
    // Used codes stay a day, so replaying one still revokes its grant.
    codes: count(
      tx
        .delete(oauthCodes)
        .where(or(lt(oauthCodes.expiresAt, ago(1)), lt(oauthCodes.usedAt, ago(1))))
        .run(),
    ),
    tokens: count(tx.delete(oauthTokens).where(lt(oauthTokens.expiresAt, now)).run()),
    // Deleting a grant deletes its tokens (ON DELETE CASCADE).
    grants: count(
      tx
        .delete(oauthGrants)
        .where(lt(oauthGrants.revokedAt, ago(30)))
        .run(),
    ),
    // Clients that registered themselves but were never approved. CIMD clients are only a cache
    // of a public document, so they stay.
    clients: count(
      tx
        .delete(oauthClients)
        .where(
          and(
            eq(oauthClients.kind, 'dcr'),
            lt(oauthClients.createdAt, ago(7)),
            notExists(
              tx
                .select({ id: oauthGrants.id })
                .from(oauthGrants)
                .where(eq(oauthGrants.clientId, oauthClients.clientId)),
            ),
          ),
        )
        .run(),
    ),
  }));
}

const count = ({ changes }: { changes: number | bigint }) => Number(changes);
