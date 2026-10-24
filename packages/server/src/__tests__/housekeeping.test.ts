import { oauthClients, oauthCodes, oauthGrants, oauthTokens, sessions } from '@xbase/db/schema';
import { createTestDb, seedAccount } from '@xbase/db/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { runHousekeeping } from '../housekeeping';

const NOW = new Date('2026-10-23T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

let db: ReturnType<typeof createTestDb>;
beforeEach(() => {
  db = createTestDb();
});

// A set, so row order doesn't matter.
const ids = <T>(rows: T[], key: keyof T) => new Set(rows.map((row) => row[key]));

describe('runHousekeeping', () => {
  it('deletes expired sessions', () => {
    const accountId = seedAccount();
    db.insert(sessions)
      .values([
        { id: 'expired', accountId, expiresAt: at(-1), lastSeenAt: at(-2) },
        { id: 'valid', accountId, expiresAt: at(1), lastSeenAt: at(0) },
      ])
      .run();
    expect(runHousekeeping(NOW).sessions).toBe(1);
    expect(ids(db.select().from(sessions).all(), 'id')).toEqual(new Set(['valid']));
  });

  it('keeps OAuth codes for a day after they expire or are used', () => {
    const code = {
      clientId: 'c',
      redirectUri: 'http://127.0.0.1/cb',
      codeChallenge: 'x',
      scope: 'mcp',
      resource: 'https://xbase.test/mcp',
    };
    db.insert(oauthCodes)
      .values([
        { ...code, codeHash: 'old', expiresAt: at(-2) },
        { ...code, codeHash: 'used-long-ago', expiresAt: at(1), usedAt: at(-2) },
        { ...code, codeHash: 'recent', expiresAt: at(-0.5), usedAt: at(-0.5) },
        { ...code, codeHash: 'live', expiresAt: at(0.01) },
      ])
      .run();
    expect(runHousekeeping(NOW).codes).toBe(2);
    expect(ids(db.select().from(oauthCodes).all(), 'codeHash')).toEqual(
      new Set(['live', 'recent']),
    );
  });

  it('deletes expired tokens, long-revoked grants with their tokens, and unused DCR clients', () => {
    db.insert(oauthClients)
      .values([
        {
          clientId: 'dcr_unused',
          kind: 'dcr',
          clientName: 'a',
          redirectUris: [],
          createdAt: at(-8),
        },
        { clientId: 'dcr_new', kind: 'dcr', clientName: 'b', redirectUris: [], createdAt: at(-1) },
        {
          clientId: 'dcr_used',
          kind: 'dcr',
          clientName: 'c',
          redirectUris: [],
          createdAt: at(-60),
        },
        {
          clientId: 'https://app.example/client.json',
          kind: 'cimd',
          clientName: 'd',
          redirectUris: [],
          createdAt: at(-60),
        },
        {
          clientId: 'dcr_revoked',
          kind: 'dcr',
          clientName: 'e',
          redirectUris: [],
          createdAt: at(-60),
        },
      ])
      .run();
    const grant = { scope: 'mcp', resource: 'https://xbase.test/mcp' };
    db.insert(oauthGrants)
      .values([
        { ...grant, id: 'active', clientId: 'dcr_used' },
        { ...grant, id: 'revoked-recently', clientId: 'dcr_used', revokedAt: at(-29) },
        { ...grant, id: 'revoked-long-ago', clientId: 'dcr_revoked', revokedAt: at(-31) },
      ])
      .run();
    db.insert(oauthTokens)
      .values([
        { tokenHash: 'expired', kind: 'access', grantId: 'active', expiresAt: at(-0.01) },
        { tokenHash: 'live', kind: 'refresh', grantId: 'active', expiresAt: at(60) },
        { tokenHash: 'orphaned', kind: 'refresh', grantId: 'revoked-long-ago', expiresAt: at(60) },
      ])
      .run();

    expect(runHousekeeping(NOW)).toEqual({
      sessions: 0,
      codes: 0,
      tokens: 1,
      grants: 1,
      clients: 2,
    });
    expect(ids(db.select().from(oauthTokens).all(), 'tokenHash')).toEqual(new Set(['live']));
    expect(ids(db.select().from(oauthGrants).all(), 'id')).toEqual(
      new Set(['active', 'revoked-recently']),
    );
    expect(ids(db.select().from(oauthClients).all(), 'clientId')).toEqual(
      new Set(['dcr_new', 'dcr_used', 'https://app.example/client.json']),
    );
  });
});
