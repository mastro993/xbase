import { z } from 'zod';
import { isLoopbackHost } from '../lib/loopback';

const DEV_APP_URL = 'http://localhost:5173';

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

const EnvSchema = z.object({
  APP_PASSWORD: z
    .string({ error: 'APP_PASSWORD is required' })
    .min(12, 'APP_PASSWORD must be at least 12 characters'),
  APP_URL: AppUrl,
  DATABASE_PATH: z.string().min(1).default('./data/xbase.db'),
  // How many reverse proxies in front of XBase add to X-Forwarded-For (see client-ip.server.ts).
  TRUST_PROXY_HOPS: z.coerce
    .number({ error: HOPS_ERROR })
    .int(HOPS_ERROR)
    .min(0, HOPS_ERROR)
    .max(5, HOPS_ERROR)
    .default(0),
});

type Env = z.infer<typeof EnvSchema>;

/** Validates an environment; throws one readable error listing every problem. */
export function parseEnv(source: Record<string, string | undefined>, production: boolean): Env {
  // Empty values from a copied .env.example count as unset.
  const input = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
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
