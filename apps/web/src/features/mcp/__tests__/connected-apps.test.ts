import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectedClient } from '@/features/oauth/__tests__/fixtures';
import { saveClient } from '@/features/oauth/store.server';
import { verifyAccessToken } from '@/features/oauth/token.server';
import { oauthGrants, oauthTokens } from '@/server/db/schema';
import { createTestDb } from '@/test/db';
import { listConnectedApps, revokeConnectedApp } from '../connected-apps.server';

vi.mock('@/server/env.server', () => ({
  getEnv: () => ({
    APP_URL: 'https://xbase.test',
    X_CLIENT_ID: 'test-client-id',
    X_CLIENT_SECRET: 'test-client-secret',
  }),
}));

const NOW = new Date('2026-10-23T12:00:00.000Z');

let db: ReturnType<typeof createTestDb>;
beforeEach(() => {
  db = createTestDb();
});

describe('connected apps', () => {
  it('lists approved apps, newest first, with what is known about them', async () => {
    const { client } = await connectedClient(NOW);
    const [app] = listConnectedApps(NOW);
    expect(app).toEqual({
      grantId: expect.any(String),
      clientId: client.clientId,
      clientName: 'Cursor',
      kind: 'dcr',
      verifiedHost: null,
      createdAt: NOW.toISOString(),
      lastUsedAt: NOW.toISOString(),
    });

    // A CIMD client: its name is vouched for by the host of its metadata URL.
    const claude = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
    saveClient({ clientId: claude, kind: 'cimd', clientName: 'Claude', redirectUris: [] });
    const later = new Date(NOW.getTime() + 1000);
    db.update(oauthGrants).set({ clientId: claude, createdAt: later }).run();
    const second = await connectedClient(NOW);
    const apps = listConnectedApps(NOW);
    expect(apps.map((item) => item.clientName)).toEqual(['Claude', 'Cursor']);
    expect(apps[0]?.verifiedHost).toBe('claude.ai');
    expect(apps[1]?.clientId).toBe(second.client.clientId);
  });

  it('drops revoked apps, and revoking stops their tokens', async () => {
    const { tokens } = await connectedClient(NOW);
    const [app] = listConnectedApps(NOW);
    revokeConnectedApp(app?.grantId ?? '', NOW);
    expect(listConnectedApps(NOW)).toEqual([]);
    expect(verifyAccessToken(tokens.access_token, NOW)).toBeNull();
    // Unknown ids are fine.
    expect(() => revokeConnectedApp('nope')).not.toThrow();
  });

  it('drops apps whose refresh token expired: they would need consent again', async () => {
    await connectedClient(NOW);
    db.update(oauthTokens).set({ expiresAt: NOW }).run();
    expect(listConnectedApps(NOW)).toEqual([]);
  });
});
