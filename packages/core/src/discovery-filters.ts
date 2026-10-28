import type { DiscoverySettings, ExclusionFilter } from './discovery';

// What keeps a candidate out of the Discover lists: the owner's blocklist, posts with nothing to
// reply to, long threads, five keyword lists and the niches. Pure, so the server applies the same
// rules to a run's pages and to stored candidates when the settings change, and the page can name
// the reasons. Keyword rules are plain matching, not a classifier: an LLM may join them later.

/**
 * Why a stored candidate is left out, in the order the rules run: cheap, certain checks first.
 * Stored in a CHECK constraint, so a new reason means a migration that rebuilds the table.
 */
export const EXCLUSION_REASONS = [
  'blocked_author',
  'image_only',
  'thread_too_long',
  'bait',
  'giveaway',
  'promo',
  'politics',
  'crypto',
  'off_topic',
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

/** How a run's summary names each reason, followed by its count: "bait 2, off-topic 1". */
export const EXCLUSION_REASON_LABELS: Record<ExclusionReason, string> = {
  blocked_author: 'blocked authors',
  image_only: 'image-only',
  thread_too_long: 'long threads',
  bait: 'bait',
  giveaway: 'giveaways',
  promo: 'promotions',
  politics: 'politics',
  crypto: 'crypto',
  off_topic: 'off-topic',
};

/** The keyword switches in Settings, and the reason each one stores. */
const KEYWORD_RULES: [ExclusionFilter, ExclusionReason][] = [
  ['bait', 'bait'],
  ['giveaways', 'giveaway'],
  ['promos', 'promo'],
  ['politics', 'politics'],
  ['crypto', 'crypto'],
];

/**
 * What the owner decided about a post, kept for good: a post shown in a batch, skipped or
 * replied to is never suggested again. A later status only replaces a weaker one.
 */
export const MEMORY_STATUSES = ['shown', 'skipped', 'replied'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

/** What the rules read from a candidate. */
export type FilterablePost = {
  /** Where the run found it: a saved search already matched the owner's own query. */
  source: 'home' | 'search';
  text: string;
  quotedText: string | null;
  hasMedia: boolean;
  authorId: string | null;
  authorHandle: string | null;
  quotedAuthorId: string | null;
  quotedAuthorHandle: string | null;
};

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>' };

/**
 * X's HTML escapes decoded, styled and full-width letters folded to plain ones, invisible
 * characters and curly quotes evened out; the case stays.
 */
const unify = (text: string): string =>
  text
    .replace(/&(?:amp|lt|gt);/g, (entity) => ENTITIES[entity] ?? entity)
    // NFKC turns "NFT™" into "nfttm", which no keyword would match.
    .replace(/[™℠]/gu, ' ')
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/[‘’ʼ′`´]/gu, "'")
    .replace(/[“”„″]/gu, '"');

/**
 * Text as every rule reads it, posts and keywords alike: unified, in lower case, and with links
 * dropped (a t.co id is random letters).
 */
export function fold(text: string): string {
  return (
    unify(text)
      .toLowerCase()
      // "İ" lowercases to "i" plus a combining dot.
      .replace(/i̇/gu, 'i')
      .replace(/https?:\/\/\S+/gu, ' ')
  );
}

// Scripts written without spaces between words: their letters never end a word, so a Japanese
// keyword matches inside running text, and "AIエージェント" still contains "ai".
const UNSPACED = String.raw`\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Thai}`;
const WORD = String.raw`(?![${UNSPACED}])[\p{L}\p{N}\p{M}_]`;
const STARTS_WORD = new RegExp(`^${WORD}`, 'u');
const ENDS_WORD = new RegExp(`${WORD}$`, 'u');
/** Between a phrase's words: a space, a hyphen, an underscore or nothing ("#BuildInPublic"). */
const SEPARATOR = String.raw`[\s\p{Pd}_]*`;
/** Only regex syntax: escaping "-" too would throw under the u flag. */
const SYNTAX = /[\\^$.*+?()[\]{}|/]/g;

/** A keyword's pattern, and whether each end needs a word boundary; null for a blank keyword. */
function keywordPattern(keyword: string): { body: string; start: boolean; end: boolean } | null {
  // Underscores at the ends belong to the keyword ("__init__"); inside, they separate words.
  const [, lead = '', inner = '', trail = ''] =
    /^(_*)(.*?)(_*)$/su.exec(fold(keyword).trim()) ?? [];
  const words = inner.split(/[\s\p{Pd}_]+/u).filter(Boolean);
  const first = words[0];
  const last = words.at(-1);
  if (first === undefined || last === undefined) return null;
  const start = STARTS_WORD.test(lead || first);
  const end = ENDS_WORD.test(trail || last);
  // "nfts" and "giveaways", but not "defies" for "defi", nor "ais" for a word under three letters.
  const plural =
    trail || !end || !/^\p{L}{3,}$/u.test(last)
      ? ''
      : /(?:s|x|z|ch|sh)$/.test(last)
        ? '(?:es)?'
        : 's?';
  return {
    body: lead + words.map((word) => word.replace(SYNTAX, '\\$&')).join(SEPARATOR) + plural + trail,
    start,
    end,
  };
}

/**
 * One regex for a list, or null for an empty one. Keywords are grouped by which ends need a
 * boundary, so the list costs at most four lookaround pairs to build, not two per keyword.
 */
export function compileKeywords(keywords: readonly string[]): RegExp | null {
  const groups = new Map<string, string[]>();
  for (const keyword of keywords) {
    const pattern = keywordPattern(keyword);
    if (!pattern) continue;
    const key = `${pattern.start ? '1' : '0'}${pattern.end ? '1' : '0'}`;
    groups.set(key, [...(groups.get(key) ?? []), pattern.body]);
  }
  if (groups.size === 0) return null;
  const alternatives = [...groups].map(
    ([key, bodies]) =>
      `${key[0] === '1' ? `(?<!${WORD})` : ''}(?:${bodies.join('|')})${key[1] === '1' ? `(?!${WORD})` : ''}`,
  );
  return new RegExp(alternatives.join('|'), 'u');
}

const MENTION = /(?<![\p{L}\p{N}_])@[a-z0-9_]{1,15}/gu;
const HASHTAG = /(?<![\p{L}\p{N}_])#[\p{L}\p{N}\p{M}_]+/gu;

/** Whether folded text says anything once mentions and hashtags are gone. */
const hasWords = (folded: string): boolean =>
  /[\p{L}\p{N}]/u.test(folded.replace(MENTION, ' ').replace(HASHTAG, ' '));

// "1/12", "(1/12)", "1 / 12": not "21/30" (a day counter), "1/2.5" or "1/10th".
const THREAD_MARKER =
  /(?<![\p{N}/.,])([([]?)1 ?[/⁄∕] ?(\d{1,3})([)\]]?)(?![\p{N}\p{L}]|[/.,:-]\p{N})/gu;
const DECORATION = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{FE0F}\p{P}\p{S}\s]/gu;
const THREAD_EMOJI = '\u{1F9F5}';

/**
 * How many posts a thread opener announces, or null when the post doesn't announce one. The
 * marker counts on the first or last line: anywhere when a 🧵 is in the post, at either end of
 * its line when bracketed ("… (1/12)"), or alone on its line. "Rated 1/10 would not recommend"
 * and "Beta opens Monday (1/15). Who wants in?" are no threads.
 */
export function threadLength(folded: string): number | null {
  const lines = folded
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const emoji = folded.includes(THREAD_EMOJI);
  for (const line of new Set([lines[0], lines.at(-1)])) {
    if (line === undefined) continue;
    const markers = [...line.matchAll(THREAD_MARKER)];
    const [first] = markers;
    if (!first) continue;
    if (emoji) return Number(first[2]);
    // Only the first and last marker can sit at an end of the line: checking those keeps a
    // 25,000-character post linear.
    for (const marker of new Set([first, markers.at(-1) ?? first])) {
      const before = line.slice(0, marker.index).replace(DECORATION, '');
      const after = line.slice(marker.index + marker[0].length).replace(DECORATION, '');
      const bracketed = marker[1] !== '' && marker[3] !== '';
      if (before === '' && after === '') return Number(marker[2]);
      if (bracketed && (before === '' || after === '')) return Number(marker[2]);
    }
  }
  return null;
}

// "Comment "AI" for the guide", "Reply YES and I'll DM you": a keyword can't stand for any word,
// so the bait switch also knows this formula, when the word is quoted or in capitals.
const COMMENT_TO_GET =
  /(?<![\p{L}\p{N}_])(?:comment|reply(?: with)?)\s+(["']?)([\p{L}\p{N}]{2,20})\1\s+(?:for|to get|and i'?ll (?:send|dm))(?![\p{L}\p{N}_])/giu;

const asksForComment = (text: string): boolean => {
  for (const match of unify(text).matchAll(COMMENT_TO_GET)) {
    const word = match[2] ?? '';
    if (match[1] !== '' || (word === word.toUpperCase() && /\p{Lu}/u.test(word))) return true;
  }
  return false;
};

/** The settings the rules read. */
export type FilterSettings = Pick<DiscoverySettings, 'niches' | 'watch' | 'exclusions'>;

/**
 * The rules for one set of settings, built once: a run applies them to every post it reads.
 * Returns the first reason that applies, or null when the post is kept. `hiddenAuthorIds` are the
 * X user ids the owner muted or blocked on X: matched by id, they stay hidden when they rename.
 *
 * - A post deep inside a thread is a reply, which a run never keeps; `thread_too_long` is for
 *   the opener of a thread longer than the setting, where a reply lands under all its parts.
 * - The niches apply to the home timeline: a saved search already matched the owner's query.
 */
export function compileExclusions(
  settings: FilterSettings,
  hiddenAuthorIds: ReadonlySet<string>,
): (post: FilterablePost) => ExclusionReason | null {
  const blocked = new Set(settings.watch.blocked);
  const { exclusions } = settings;
  const keywordRules = KEYWORD_RULES.flatMap(([filter, reason]) => {
    const rule = exclusions[filter];
    const pattern = rule.enabled ? compileKeywords(rule.keywords) : null;
    return pattern ? [{ reason, pattern }] : [];
  });
  const niches = compileKeywords(settings.niches.keywords);

  return (post) => {
    const isBlocked = (id: string | null, handle: string | null) =>
      (id !== null && hiddenAuthorIds.has(id)) ||
      (handle !== null && blocked.has(handle.toLowerCase()));
    if (
      isBlocked(post.authorId, post.authorHandle) ||
      isBlocked(post.quotedAuthorId, post.quotedAuthorHandle)
    ) {
      return 'blocked_author';
    }

    const texts = [post.text, post.quotedText].flatMap((text) => (text ? [fold(text)] : []));
    const [own = ''] = texts;
    // The quoted post is context too: an image quoting a launch post has something to reply to.
    if (exclusions.imageOnly && post.hasMedia && !texts.some(hasWords)) return 'image_only';

    if (exclusions.longThreads) {
      const length = threadLength(own);
      if (length !== null && length > exclusions.maxThreadPosts) return 'thread_too_long';
    }

    if (
      exclusions.bait.enabled &&
      [post.text, post.quotedText].some((text) => text && asksForComment(text))
    ) {
      return 'bait';
    }
    // Each text on its own, so a phrase can't run from the post into the post it quotes.
    for (const { reason, pattern } of keywordRules) {
      if (texts.some((text) => pattern.test(text))) return reason;
    }

    if (niches && post.source === 'home' && !texts.some((text) => niches.test(text))) {
      return 'off_topic';
    }
    return null;
  };
}
