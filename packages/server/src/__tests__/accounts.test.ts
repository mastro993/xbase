import { InvalidStateError, NotFoundError, ValidationError } from '@xbase/core/errors';
import { posts, sessions } from '@xbase/db/schema';
import { createTestDb, seedAccount } from '@xbase/db/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAccounts,
  listAccounts,
  removeAccount,
  resolveAccountId,
  switchAccount,
} from '../accounts';
import { createDraft } from '../posts';

let db: ReturnType<typeof createTestDb>;
let owner: string;
beforeEach(() => {
  db = createTestDb();
  owner = seedAccount({ id: '1001', username: 'Owner' });
});

/** A session row working as `accountId`, as issueSession stores it. */
function sessionAs(accountId: string, id = 'session-hash') {
  const now = new Date();
  db.insert(sessions)
    .values({
      id,
      accountId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      lastSeenAt: now,
    })
    .run();
  return { id, accountId };
}

const sessionAccount = () =>
  db.select({ accountId: sessions.accountId }).from(sessions).get()?.accountId;

describe('accounts', () => {
  it('lists the oldest first, with the current one, and never the tokens', () => {
    const brand = seedAccount({ id: '2002', username: 'brand' });
    const data = getAccounts(sessionAs(brand));
    expect(data.current.id).toBe(brand);
    expect(data.accounts.map(({ id }) => id)).toEqual([owner, brand]);
    expect(JSON.stringify(data)).not.toContain('access-');
  });

  it('switches only to a linked account', () => {
    const brand = seedAccount({ id: '2002' });
    const session = sessionAs(owner);
    switchAccount(session, brand);
    expect(sessionAccount()).toBe(brand);
    expect(() => switchAccount(session, '9999')).toThrow(NotFoundError);
  });

  it('removes an account with its posts, signing out the other browsers that used it', () => {
    const brand = seedAccount({ id: '2002' });
    createDraft({ accountId: brand, parts: ['brand post'], origin: 'web' });
    createDraft({ accountId: owner, parts: ['owner post'], origin: 'web' });
    sessionAs(brand, 'other-browser');
    removeAccount(sessionAs(brand), brand);
    expect(listAccounts().map(({ id }) => id)).toEqual([owner]);
    expect(db.select({ accountId: posts.accountId }).from(posts).all()).toEqual([
      { accountId: owner },
    ]);
    // The browser that removed it moves to another account.
    expect(
      db.select({ id: sessions.id, accountId: sessions.accountId }).from(sessions).all(),
    ).toEqual([{ id: 'session-hash', accountId: owner }]);
  });

  it('keeps the last account: without one, the next X account would claim XBase', () => {
    expect(() => removeAccount(sessionAs(owner), owner)).toThrow(InvalidStateError);
    expect(listAccounts()).toHaveLength(1);
  });
});

describe('resolveAccountId', () => {
  it('defaults to the only linked account', () => {
    expect(resolveAccountId()).toBe(owner);
  });

  it('asks which account once several are linked', () => {
    seedAccount({ id: '2002', username: 'brand' });
    expect(() => resolveAccountId()).toThrow(
      new ValidationError('Say which account: @Owner, @brand.'),
    );
  });

  it.each(['Owner', '@owner', 'OWNER'])('finds %s whatever the case or @', (username) => {
    seedAccount({ id: '2002', username: 'brand' });
    expect(resolveAccountId(username)).toBe(owner);
  });

  it('names the linked accounts for an unknown one', () => {
    expect(() => resolveAccountId('@nobody')).toThrow(
      '@nobody isn’t linked to XBase. Linked accounts: @Owner.',
    );
  });
});
