// How X counts a post's length (twitter-text v3 rules), for the composer's counters. An own
// implementation: the twitter-text package drags in core-js 2 with an install script.

/** A standard account's limit; Premium accounts may post longer. */
export const MAX_WEIGHTED_LENGTH = 280;

// Every link counts as a t.co link, whatever its length.
const URL_WEIGHT = 23;

// Code points that count 1: Latin, Greek, Cyrillic, Hebrew, Arabic, Indic scripts… and some
// spaces, dashes, quotes and primes. Everything else (CJK, most symbols, emoji) counts 2.
const LIGHT: readonly (readonly [number, number])[] = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];

// One emoji counts 2 however many code points it has: skin tones, ZWJ families, flags, keycaps.
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️|\p{Regional_Indicator}|⃣/u;

// X links a bare domain only on a known TLD. These are every two-letter country code and the
// common generic TLDs; twitter-text knows about 1,500, so a bare domain on a rare one counts as
// text. With http(s)://, any host with a dot and an ASCII last label counts, so rare TLDs do too,
// but not `localhost` or a host still being typed.
const GENERIC_TLDS =
  'academy agency app art bio biz blog bot build business cafe capital chat city cloud club codes ' +
  'com community company consulting cool day design dev digital directory download earth eco ' +
  'edu email energy engineering events expert farm finance fit foundation fun fund fyi gallery ' +
  'game games global gold gov group guide guru health help host icu inc info ink int ' +
  'international jobs land life link live llc lol love ltd market marketing media meme mil mobi ' +
  'money mov name net network new news ninja one online org page photo photography photos pics ' +
  'place plus press pro rocks run school science services shop site social software solutions ' +
  'space store studio support systems team tech technology today tools top training travel ' +
  'university video vip watch website wiki win work works world wtf xyz zip zone';
const COUNTRY_TLDS =
  'ac ad ae af ag ai al am an ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo ' +
  'bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm ' +
  'do dz ec ee eg eh er es et eu fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs ' +
  'gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp ' +
  'kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms ' +
  'mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps ' +
  'pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st su sv sx sy sz ' +
  'tc td tf tg th tj tk tl tm tn to tp tr tt tv tw tz ua ug uk um us uy uz va vc ve vg vi vn vu ' +
  'wf ws ye yt za zm zw';
const TLD = `(?:${`${GENERIC_TLDS} ${COUNTRY_TLDS}`.split(' ').join('|')})(?![a-z0-9@+-])`;

// twitter-text's path and query characters: a path takes ASCII, Latin accents and Cyrillic, a
// query only ASCII. So CJK, kana, Hangul or Greek right after a link ends it ("看https://x.com很好").
// The path keeps ( and ), which trimUrl balances.
const PATH_CHAR = String.raw`[a-z0-9\u0400-\u04FF\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF!*';:=+,.$/%#\[\]\-\u2013_~@|&()]`;
const QUERY_CHAR = String.raw`[a-z0-9!?*'@();:&=+$/%#\[\]\-_.,~|]`;
const REST = String.raw`(?:/${PATH_CHAR}*)?(?:\?${QUERY_CHAR}*)?(?:#${PATH_CHAR}*)?`;
// Not glued to a word, a mention, a cashtag or a hashtag. A bare domain also can't follow - _ . /
const URL = new RegExp(
  String.raw`(?<![a-z0-9@＠$#＃])(?:https?://(?:[\p{L}\p{M}\p{N}-]+\.)+[a-z0-9-]+(?::\d{1,5})?${REST}|(?<![-_./])(?:[a-z0-9-]+\.)+${TLD}(?::\d{1,5})?${REST})`,
  'giu',
);

// Sentence punctuation after a link isn't part of it; neither is a ")" without its "(".
const TRAILING = new Set(".,:;!?'*~[]");
const count = (text: string, char: string) => text.split(char).length - 1;
function trimUrl(url: string): string {
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1] ?? '';
    const unbalanced =
      last === ')' && count(url.slice(0, end), '(') < count(url.slice(0, end), ')');
    if (!TRAILING.has(last) && !unbalanced) break;
    end--;
  }
  return url.slice(0, end);
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function textWeight(text: string): number {
  let weight = 0;
  for (const { segment } of graphemes.segment(text)) {
    if (EMOJI.test(segment)) {
      weight += 2;
      continue;
    }
    for (const char of segment) {
      const codePoint = char.codePointAt(0) ?? 0;
      weight += LIGHT.some(([start, end]) => codePoint >= start && codePoint <= end) ? 1 : 2;
    }
  }
  return weight;
}

/** The length X shows for `text`, to compare with MAX_WEIGHTED_LENGTH. */
export function weightedLength(text: string): number {
  // X counts the composed form: "e" + a combining accent is one character, like "é".
  const normalized = text.normalize('NFC');
  let weight = 0;
  let from = 0;
  for (const match of normalized.matchAll(URL)) {
    const url = trimUrl(match[0]);
    weight += textWeight(normalized.slice(from, match.index)) + URL_WEIGHT;
    from = match.index + url.length;
  }
  return weight + textWeight(normalized.slice(from));
}
