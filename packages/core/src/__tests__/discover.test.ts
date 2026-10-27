import { describe, expect, it } from 'vitest';
import { MAX_SEARCH_QUERY, SEARCH_FILTER_SUFFIX, searchQueryForX } from '../discover';

// A saved search is sent with X's reply and repost filters, unless the saved query is so long
// that adding them would break X's 512-character limit. The local filters are the backstop.

describe('searchQueryForX', () => {
  it('trims the saved query and adds the filters', () => {
    expect(searchQueryForX('  buildinpublic lang:en  ')).toBe(
      'buildinpublic lang:en -is:reply -is:retweet',
    );
  });

  it('keeps the filters while they fit under X’s limit', () => {
    const room = MAX_SEARCH_QUERY - SEARCH_FILTER_SUFFIX.length;
    expect(searchQueryForX('q'.repeat(room))).toBe('q'.repeat(room) + SEARCH_FILTER_SUFFIX);
  });

  it('sends a query that would overflow the limit as the owner saved it', () => {
    const long = 'q'.repeat(MAX_SEARCH_QUERY);
    expect(searchQueryForX(long)).toBe(long);
  });
});
