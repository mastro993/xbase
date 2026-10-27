import { isLoopbackHost } from '@xbase/core/loopback';
import { z } from 'zod';

// X refuses `localhost` callback URLs for OAuth, but takes 127.0.0.1 (vite.config.ts prefers that
// port; when it's taken, signing in on the port Vite picks needs APP_URL and X's callback there).
const DEV_APP_URL = 'http://127.0.0.1:5173';

// An origin only: OAuth issuer, absolute links and the cookie's Secure flag come from it, never
// from request.url or Host / X-Forwarded-* headers, which a proxy or a client controls.
const AppUrl = z
  .url({
    protocol: /^https?$/,
    error: (issue) =>
      issue.input === undefined
        ? 'APP_URL is required in production'
        : 'APP_URL must be an http(s) URL',
  })
  .transform((value, ctx) => {
    const url = new URL(value);
    if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
      ctx.addIssue({ code: 'custom', message: 'APP_URL must be an origin, without a path' });
    }
    if (url.username || url.password) {
      ctx.addIssue({ code: 'custom', message: 'APP_URL must not contain credentials' });
    }
    return url.origin;
  });

const HOPS_ERROR = 'TRUST_PROXY_HOPS must be a whole number from 0 to 5';

const required = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .trim()
    .min(1);
// An AI provider's key is optional: without one, that provider can't be picked in Settings.
const optionalKey = z.string().trim().min(1).optional();

const EnvSchema = z.object({
  APP_URL: AppUrl,
  // The OAuth 2.0 client of the owner's X app: signing in and every X API call go through it.
  X_CLIENT_ID: required('X_CLIENT_ID'),
  X_CLIENT_SECRET: required('X_CLIENT_SECRET'),
  // Optional: the only X account that may claim an empty XBase. Unset, the first to sign in does.
  X_OWNER_USERNAME: z
    .string()
    .trim()
    .regex(/^@?\w{1,15}$/, 'X_OWNER_USERNAME must be an X username, like @you')
    .transform((value) => value.replace(/^@/, '').toLowerCase())
    .optional(),
  OPENAI_API_KEY: optionalKey,
  ANTHROPIC_API_KEY: optionalKey,
  XAI_API_KEY: optionalKey,
  OPENROUTER_API_KEY: optionalKey,
  TYPESAFE_API_KEY: optionalKey,
  DATABASE_PATH: z.string().min(1).default('./data/xbase.db'),
  // How many reverse proxies in front of XBase add to X-Forwarded-For (see client-ip.ts).
  TRUST_PROXY_HOPS: z.coerce
    .number({ error: HOPS_ERROR })
    .int(HOPS_ERROR)
    .min(0, HOPS_ERROR)
    .max(5, HOPS_ERROR)
    .default(0),
});

export type Env = z.infer<typeof EnvSchema>;

/** Validates an environment; throws one readable error listing every problem. */
export function parseEnv(source: Record<string, string | undefined>, production: boolean): Env {
  // Empty (or blank) values from a copied .env.example count as unset.
  const input = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value === undefined || value.trim() !== ''),
  );
  if (!production) input.APP_URL ??= DEV_APP_URL;
  const parsed = EnvSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

let env: Env | undefined;

/** The server's environment, validated once. */
export function getEnv(): Env {
  // The literal process.env.NODE_ENV is replaced at build time, so a production build is
  // strict even when the server starts without NODE_ENV set.
  return (env ??= parseEnv(process.env, process.env.NODE_ENV === 'production'));
}

/** MCP clients only connect to an HTTPS authorization server, apart from loopback. */
export function needsHttpsWarning({ APP_URL }: Env): boolean {
  const url = new URL(APP_URL);
  return url.protocol === 'http:' && !isLoopbackHost(url.hostname);
}
