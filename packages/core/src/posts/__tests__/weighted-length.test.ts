import { describe, expect, it } from 'vitest';
import { MAX_WEIGHTED_LENGTH, weightedLength } from '../weighted-length';

describe('weightedLength', () => {
  it('counts ASCII, Latin, Cyrillic, Arabic and Devanagari as 1 per code point', () => {
    expect(weightedLength('')).toBe(0);
    expect(weightedLength('Hello, world!')).toBe(13);
    expect(weightedLength('Ciao à tutti, ça va?')).toBe(20);
    expect(weightedLength('Привет')).toBe(6);
    expect(weightedLength('مرحبا')).toBe(5);
    expect(weightedLength('नमस्ते')).toBe(6);
    expect(weightedLength('line\nbreak\r\n')).toBe(12);
  });

  it('counts CJK, kana and Hangul as 2', () => {
    expect(weightedLength('你好')).toBe(4);
    expect(weightedLength('こんにちは')).toBe(10);
    expect(weightedLength('안녕하세요')).toBe(10);
    expect(weightedLength('XBase 好')).toBe(8);
  });

  it('counts the light punctuation ranges as 1 and other symbols as 2', () => {
    expect(weightedLength(' ‍')).toBe(2); // en space, zero-width joiner
    expect(weightedLength('— ‘’ “”')).toBe(7);
    expect(weightedLength('′″‴')).toBe(3);
    expect(weightedLength('…')).toBe(2);
    expect(weightedLength('•')).toBe(2);
    expect(weightedLength('€')).toBe(2);
    expect(weightedLength('\u{20000}')).toBe(2); // CJK outside the BMP: one code point, not two
  });

  it('counts every emoji as 2, however many code points it has', () => {
    expect(weightedLength('\u{1F600}')).toBe(2);
    expect(weightedLength('\u{1F44D}\u{1F3FD}')).toBe(2); // thumbs up + skin tone
    expect(weightedLength('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}')).toBe(2); // ZWJ family
    expect(weightedLength('\u{1F3F3}\uFE0F\u200D\u{1F308}')).toBe(2); // rainbow flag
    expect(weightedLength('\u{1F1EE}\u{1F1F9}')).toBe(2); // flag of Italy
    expect(weightedLength('1\uFE0F\u20E3')).toBe(2); // keycap
    expect(weightedLength('\u2764\uFE0F')).toBe(2); // red heart, emoji presentation
    expect(weightedLength('\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}')).toBe(
      2,
    ); // Scotland
    expect(weightedLength('ok \u{1F44D}\u{1F3FD}\u{1F44D}\u{1F3FD}')).toBe(7);
  });

  it('counts the composed form, like X', () => {
    expect(weightedLength('é')).toBe(1);
    expect(weightedLength('é')).toBe(1);
  });

  describe('links', () => {
    it('counts any http(s) link as 23', () => {
      expect(
        weightedLength('https://example.com/a/very/long/path/that/goes/on?and=on#and-on'),
      ).toBe(23);
      expect(weightedLength('http://x.co')).toBe(23);
      expect(weightedLength('HTTPS://EXAMPLE.COM')).toBe(23);
      expect(weightedLength('https://foo.museum/x')).toBe(23);
      expect(weightedLength('https://example.com:8080/x')).toBe(23);
      expect(weightedLength('https://example.com/caffè')).toBe(23);
      expect(weightedLength('https://ru.wikipedia.org/wiki/Привет')).toBe(23);
      expect(weightedLength('https://example.com/#/route')).toBe(23);
    });

    // Matches twitter-text 3.1: a link stops at CJK, kana, Hangul or Greek, even with no space.
    it('ends a link at a script its paths don’t take', () => {
      expect(weightedLength('https://例え.jp/パス')).toBe(23 + 4);
      expect(weightedLength('看这个https://example.com很好')).toBe(6 + 23 + 4);
      expect(weightedLength('안녕 https://example.com/a한국어')).toBe(5 + 23 + 6);
      expect(weightedLength('Ελληνικά https://example.com/αβγ')).toBe(9 + 23 + 3);
      expect(weightedLength('https://example.com/path?q=日本')).toBe(23 + 4);
      expect(
        weightedLength(`${'字'.repeat(120)}https://example.com/abcをご覧ください、よろしく`),
      ).toBe(240 + 23 + 24);
    });

    it('needs a dot and a last label in an http(s) host', () => {
      expect(weightedLength('https://localhost:3000')).toBe(22);
      expect(weightedLength('https://exa')).toBe(11);
    });

    it('counts bare domains on known TLDs as links', () => {
      expect(weightedLength('example.com')).toBe(23);
      expect(weightedLength('www.example.co.uk/path?q=1')).toBe(23);
      expect(weightedLength('mastro993.github.io')).toBe(23);
      expect(weightedLength('Try xbase.dev today')).toBe(4 + 23 + 6);
    });

    it('leaves words that only look like domains alone', () => {
      expect(weightedLength('Node.js')).toBe(7);
      expect(weightedLength('e.g. this')).toBe(9);
      expect(weightedLength('v1.2.3')).toBe(6);
      expect(weightedLength('file.tsx')).toBe(8);
    });

    it('skips emails, mentions, cashtags, hashtags and domains glued to a word', () => {
      expect(weightedLength('me@example.com')).toBe(14);
      expect(weightedLength('#example.com')).toBe(12);
      expect(weightedLength('$example.com')).toBe(12);
      expect(weightedLength('xhttps://example.com/abc')).toBe(24);
      expect(weightedLength('path/example.com')).toBe(16);
    });

    it('stops a link at trailing punctuation and an unbalanced bracket', () => {
      expect(weightedLength('See https://example.com.')).toBe(4 + 23 + 1);
      expect(weightedLength('(see example.com/a)')).toBe(5 + 23 + 1);
      expect(weightedLength('https://en.wikipedia.org/wiki/Mercury_(planet)')).toBe(23);
      expect(weightedLength('https://example.com, ok?')).toBe(23 + 5);
      expect(weightedLength('https://example.com😀')).toBe(25);
    });

    it('counts each link separately', () => {
      expect(weightedLength('a.com b.com')).toBe(23 + 1 + 23);
      expect(weightedLength('https://a.com\nhttps://b.com')).toBe(47);
    });
  });

  describe('the 280 limit', () => {
    it('is reached at 280 light or 140 heavy characters', () => {
      expect(MAX_WEIGHTED_LENGTH).toBe(280);
      expect(weightedLength('a'.repeat(280))).toBe(280);
      expect(weightedLength('a'.repeat(281))).toBe(281);
      expect(weightedLength('字'.repeat(140))).toBe(280);
      expect(weightedLength(`${'字'.repeat(139)}ab`)).toBe(280);
      expect(weightedLength(`${'字'.repeat(139)}abc`)).toBe(281);
      expect(weightedLength('😀'.repeat(140))).toBe(280);
    });

    it('counts a link as 23 towards it, however long', () => {
      const link = `https://example.com/${'x'.repeat(500)}`;
      expect(weightedLength(`${'a'.repeat(256)} ${link}`)).toBe(280);
      expect(weightedLength(`${'a'.repeat(257)} ${link}`)).toBe(281);
    });
  });
});
