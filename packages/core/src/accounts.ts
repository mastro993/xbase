import { z } from 'zod';

// Shared by the shell, the settings page and the server: no server imports.

/** A linked X account as the UI sees it: never its tokens. */
export type AccountDto = {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  /** X refused this account's access: it must sign in again before any read. */
  reconnectRequired: boolean;
};

/** The accounts, oldest first, and the one this browser works as. */
export type AccountsDto = { current: AccountDto; accounts: AccountDto[] };

export const AccountIdInput = z.object({ id: z.string().min(1).max(100) });
