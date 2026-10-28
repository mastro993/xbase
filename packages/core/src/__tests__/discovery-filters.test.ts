import { describe, expect, it } from 'vitest';
import { DEFAULT_DISCOVERY_SETTINGS, type DiscoverySettings } from '../discovery';
import {
  compileExclusions,
  compileKeywords,
  type FilterablePost,
  type FilterSettings,
  fold,
  threadLength,
} from '../discovery-filters';

const post = (overrides: Partial<FilterablePost> = {}): FilterablePost => ({
  source: 'home',
  text: 'Shipped the new onboarding today, signups doubled.',
  quotedText: null,
  hasMedia: false,
  authorHandle: 'Alice',
  quotedAuthorHandle: null,
  ...overrides,
});

const settings = (
  changes: {
    niches?: string[];
    blocked?: string[];
    exclusions?: Partial<DiscoverySettings['exclusions']>;
  } = {},
): FilterSettings => ({
  niches: { keywords: changes.niches ?? [] },
  watch: { accounts: [], blocked: changes.blocked ?? [] },
  exclusions: { ...DEFAULT_DISCOVERY_SETTINGS.exclusions, ...changes.exclusions },
});

const reasonOf = (overrides: Partial<FilterablePost>, changes?: Parameters<typeof settings>[0]) =>
  compileExclusions(settings(changes))(post(overrides));

describe('the default keyword lists', () => {
  const defaults = compileExclusions(DEFAULT_DISCOVERY_SETTINGS);
  const reason = (text: string, quotedText: string | null = null) =>
    defaults(post({ text, quotedText }));

  it.each([
    ['Like &amp; RT if you agree', 'bait'],
    ['Like and repost if this helped', 'bait'],
    ['Tag your friends who need this', 'bait'],
    ['follow-for-follow anyone?', 'bait'],
    ['#followforfollow', 'bait'],
    ['Comment "AI" and I’ll DM you the guide', 'bait'],
    ['RT this if you agree', 'bait'],
    ['Comment "PROMPT" for the full template', 'bait'],
    ['Comment ROADMAP to get the Notion doc', 'bait'],
    ['Reply YES and I’ll DM you the link', 'bait'],
    ['𝐆𝐈𝐕𝐄𝐀𝐖𝐀𝐘 time', 'giveaway'],
    ['ＧＩＶＥＡＷＡＹ', 'giveaway'],
    ['gift​card for the first 10', 'giveaway'],
    ['#GiftCard for 10 people', 'giveaway'],
    ['RT to win a MacBook', 'giveaway'],
    ['50% off everything this week', 'promo'],
    ['50%OFF today only', 'promo'],
    ['Link in bio 🔗', 'promo'],
    ['Loving this serum #ad', 'promo'],
    ['vice-president says hi', 'politics'],
    ['Q&amp;A with the senator', 'politics'],
    ['Democrats unveil plan', 'politics'],
    ['Election results tonight', 'politics'],
    ['The presidential debate tonight', 'politics'],
    ['#NFT drop tonight', 'crypto'],
    ['Minting NFTs again', 'crypto'],
    ['The NFT’s floor', 'crypto'],
    ['NFT™ collection live', 'crypto'],
    ['Massive pre-sale opens tomorrow', 'crypto'],
    ['Presale live', 'crypto'],
    ['New memecoin', 'crypto'],
    ['#altcoins season', 'crypto'],
    ['$BTC to 200k', 'crypto'],
    ['Free airdrop for holders', 'crypto'],
    ['Claim your airdrop now', 'crypto'],
    ['Coupon code SAVE20 for 20% discount', 'promo'],
    ['We’re giving away 3 MacBooks! Follow + RT to enter', 'giveaway'],
  ])('drops %j as %s', (text, expected) => {
    expect(reason(text)).toBe(expected);
  });

  it.each([
    'Save 30% offline',
    'definitely the best',
    'She defies every expectation',
    'win amazing prizes',
    '@defi_dad shipped',
    'https://t.co/nft',
    'thanks for the pre-order',
    'Builds are 100x faster',
    'How to win a hackathon',
    'It feels like if React and Vue had a baby',
    'Use code splitting to cut your bundle',
    'Never give away equity',
    'Please vote for us on Product Hunt',
    'Studying at ETH Zurich',
    'Add it to your $PATH',
    'crypto.randomUUID() is all you need',
    'Would you pay for something like this if it existed?',
    'Happy to share if anyone is interested',
    'Implemented leader election with etcd today',
    'AirDrop is broken again on iOS 18',
    'Hiring a pre-sales engineer for our SaaS',
    'Feel free to use my code, it is MIT licensed',
    'Comment anything for feedback on the draft',
    'Reply to this for context',
    'Reply with care for the people you disagree with',
  ])('keeps %j', (text) => {
    expect(reason(text)).toBeNull();
  });

  it('reads the quoted post too, but never across the two', () => {
    expect(reason('Wow', 'Huge airdrop incoming')).toBe('crypto');
    expect(reason('I would like', 'if you agree, this is the way')).toBeNull();
  });
});

describe('compileKeywords', () => {
  const matches = (keywords: string[], text: string) =>
    compileKeywords(keywords)?.test(fold(text)) ?? false;

  it('is null for a list with nothing to match', () => {
    expect(compileKeywords([])).toBeNull();
    expect(compileKeywords([' ', '-'])).toBeNull();
  });

  it('accepts keywords with regex syntax, hyphens and slashes', () => {
    expect(matches(['c++', 'a/b test', 'follow-for-follow'], 'I love C++')).toBe(true);
    expect(matches(['a/b test'], 'our A/B test results')).toBe(true);
    expect(matches(['(beta)'], 'now in (beta)')).toBe(true);
  });

  it('matches whole words, and the plain plural of longer ones', () => {
    expect(matches(['ai'], 'AI agents are here')).toBe(true);
    expect(matches(['ai'], 'said nothing')).toBe(false);
    expect(matches(['ai'], 'AIs everywhere')).toBe(false);
    expect(matches(['agent'], 'agents everywhere')).toBe(true);
    expect(matches(['box'], 'boxes everywhere')).toBe(true);
    expect(matches(['café'], 'a Café crawl')).toBe(true);
  });

  it('matches a phrase written with or without its separators', () => {
    for (const text of [
      'build in public',
      '#BuildInPublic',
      'build-in-public',
      'build_in public',
    ]) {
      expect(matches(['build in public'], text)).toBe(true);
    }
    expect(matches(['go to'], 'go\nto market')).toBe(true);
  });

  it('matches inside text written without spaces', () => {
    expect(matches(['エージェント'], 'AIエージェントを作った')).toBe(true);
    expect(matches(['ai'], 'AIエージェントを作った')).toBe(true);
    expect(matches(['인공지능'], '오늘 인공지능 공부')).toBe(true);
  });

  it('keeps underscores at a keyword’s ends', () => {
    expect(matches(['__init__'], 'logic in __init__ only')).toBe(true);
    expect(matches(['__init__'], 'initialize it')).toBe(false);
    expect(matches(['snake_'], 'a snake_ variable')).toBe(true);
  });

  it('folds Turkish capitals like the keyword', () => {
    expect(matches(['seçim'], 'SEÇİM sonuçları')).toBe(true);
  });
});

describe('threadLength', () => {
  const length = (text: string) => threadLength(fold(text));

  it.each([
    ['1/12 🧵 How we got to 10k MRR', 12],
    ['How we got to 10k MRR 🧵 1/12', 12],
    ['How we got to 10k MRR\n\n(1/12)', 12],
    ['How we got to 10k MRR [1/9]', 9],
    ['The story of our launch\n1/ 20 👇', 20],
    ['1 / 15', 15],
  ])('reads %j as %i posts', (text, expected) => {
    expect(length(text)).toBe(expected);
  });

  it.each([
    'Rated 1/10 would not recommend',
    'Day 21/30 of building in public',
    'Mix 1/2 cup of flour',
    'Reduced latency to 1/10th',
    'Revenue up 1/2.5x',
    'A thread 🧵',
    '1/ How we got here',
    'Nothing here',
    // A bare marker beside a title reads like a rating: missing a thread beats dropping a post.
    '1/12 How we got to 10k MRR',
    // Bracketed inside a sentence, it's a date.
    'Public beta opens Monday (1/15). Who wants in?',
    'Webinar on Thursday (1/16), sign up below',
  ])('finds no thread length in %j', (text) => {
    expect(length(text)).toBeNull();
  });
});

it('reads a long one-line post in linear time', () => {
  const started = performance.now();
  expect(threadLength(fold('1/2 '.repeat(6_250)))).toBeNull();
  expect(performance.now() - started).toBeLessThan(200);
});

describe('compileExclusions', () => {
  it('keeps an ordinary post', () => {
    expect(reasonOf({})).toBeNull();
  });

  it('drops a blocked author, or a post quoting one, ignoring case', () => {
    expect(reasonOf({ authorHandle: 'Alice' }, { blocked: ['alice'] })).toBe('blocked_author');
    expect(
      reasonOf({ quotedAuthorHandle: 'ALICE', authorHandle: 'bob' }, { blocked: ['alice'] }),
    ).toBe('blocked_author');
    expect(reasonOf({ authorHandle: null }, { blocked: ['alice'] })).toBeNull();
  });

  it('drops an image with no words, unless the post it quotes has some', () => {
    const image = { hasMedia: true, text: '🔥 @bob #design https://t.co/abc' };
    expect(reasonOf(image)).toBe('image_only');
    expect(reasonOf({ ...image, hasMedia: false })).toBeNull();
    expect(reasonOf({ ...image, text: 'lol https://t.co/abc' })).toBeNull();
    expect(reasonOf({ ...image, text: '草 https://t.co/abc' })).toBeNull();
    expect(reasonOf({ ...image, quotedText: 'We just launched' })).toBeNull();
    expect(reasonOf(image, { exclusions: { imageOnly: false } })).toBeNull();
  });

  it('drops a thread opener longer than the setting', () => {
    expect(reasonOf({ text: 'How we did it 🧵 1/9' })).toBe('thread_too_long');
    expect(reasonOf({ text: 'How we did it 🧵 1/8' })).toBeNull();
    expect(
      reasonOf({ text: 'How we did it 🧵 1/9' }, { exclusions: { maxThreadPosts: 9 } }),
    ).toBeNull();
    expect(
      reasonOf({ text: 'How we did it 🧵 1/9' }, { exclusions: { longThreads: false } }),
    ).toBeNull();
  });

  it('runs each keyword switch only while it is on, with the owner’s words', () => {
    const exclusions = DEFAULT_DISCOVERY_SETTINGS.exclusions;
    expect(reasonOf({ text: 'GIVEAWAY!' })).toBe('giveaway');
    expect(
      reasonOf(
        { text: 'GIVEAWAY!' },
        { exclusions: { giveaways: { ...exclusions.giveaways, enabled: false } } },
      ),
    ).toBeNull();
    expect(
      reasonOf(
        { text: 'Tabs or spaces?' },
        { exclusions: { bait: { enabled: true, keywords: ['tabs or spaces'] } } },
      ),
    ).toBe('bait');
    expect(
      reasonOf({ text: 'A post' }, { exclusions: { bait: { enabled: true, keywords: [] } } }),
    ).toBeNull();
  });

  it('catches the comment-to-get formula only while bait is on', () => {
    const text = 'Comment "GUIDE" for the template';
    expect(reasonOf({ text })).toBe('bait');
    expect(reasonOf({ text: 'Wow', quotedText: text })).toBe('bait');
    expect(
      reasonOf({ text }, { exclusions: { bait: { enabled: false, keywords: [] } } }),
    ).toBeNull();
  });

  it('checks the rules in order, so the first reason wins', () => {
    expect(reasonOf({ text: 'NFT giveaway' })).toBe('giveaway');
    expect(reasonOf({ text: 'NFT giveaway', authorHandle: 'bob' }, { blocked: ['bob'] })).toBe(
      'blocked_author',
    );
  });

  it('drops home posts outside the niches, matching the quoted post too', () => {
    const niches = ['build in public', 'saas'];
    expect(reasonOf({ text: 'My cat sleeps' }, { niches })).toBe('off_topic');
    expect(reasonOf({ text: 'Day 3 #buildinpublic' }, { niches })).toBeNull();
    expect(reasonOf({ text: 'This 👇', quotedText: 'Our SaaS hit $1k' }, { niches })).toBeNull();
    expect(reasonOf({ text: 'My cat sleeps' })).toBeNull();
  });

  it('leaves saved-search posts to their own query', () => {
    expect(reasonOf({ text: 'My cat sleeps', source: 'search' }, { niches: ['saas'] })).toBeNull();
  });
});
