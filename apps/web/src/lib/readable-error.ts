// Server-function errors reach the browser as a plain Error with only a message. Validation
// errors carry zod's pretty format ("✖ problem\n  → at field"): keep the problems, drop the paths.
// serverFnGuard's 401 arrives as the Response itself.

const FALLBACK = 'Something went wrong. Try again.';
const SIGNED_OUT = 'Your session ended. Reload the page to sign in again.';

/** A short sentence for an inline Callout. */
export function readableError(error: unknown): string {
  if (error instanceof Response) return error.status === 401 ? SIGNED_OUT : FALLBACK;
  const message = error instanceof Error ? error.message : '';
  const problems = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('→'))
    .map((line) => line.replace(/^✖\s*/, ''));
  return problems.join(' ') || FALLBACK;
}
