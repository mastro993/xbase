// Key shapes (sk-, sk-ant-, sk-or-, xai-), OpenAI org- and proj_ IDs, and UUIDs such as xAI team IDs.
const SECRET_LIKE =
  /\b(?:sk|xai|org|proj)[-_][\w*.-]+|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi;

/**
 * Provider error text fit to show: without the key, anything key- or ID-shaped, and at most `max`
 * characters. Provider errors can echo the key back.
 */
export function scrubSecrets(message: string, apiKey: string, max: number): string {
  const clean = (apiKey ? message.replaceAll(apiKey, '…') : message).replace(SECRET_LIKE, '…');
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
