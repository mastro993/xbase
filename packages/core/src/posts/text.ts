// How a post reads in a list row.

/** The first line with text in a post or thread, trimmed; '' when every part is empty. */
export function firstLine(parts: readonly string[]): string {
  for (const part of parts) {
    const line = part.split('\n').find((text) => text.trim() !== '');
    if (line !== undefined) return line.trim();
  }
  return '';
}

/** "Thread · 3 posts" for a thread, null for a single post. */
export function threadLabel(parts: readonly string[]): string | null {
  return parts.length > 1 ? `Thread · ${parts.length} posts` : null;
}
