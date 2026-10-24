import { describe, expect, it } from 'vitest';
import { firstLine, threadLabel } from '../text';

describe('firstLine', () => {
  it('takes the first line with text across the thread', () => {
    expect(firstLine(['  Hello\nworld'])).toBe('Hello');
    expect(firstLine(['\n\n  second line  \nthird'])).toBe('second line');
    expect(firstLine(['', '  ', 'From part three'])).toBe('From part three');
  });

  it('is empty when every part is', () => {
    expect(firstLine([''])).toBe('');
    expect(firstLine(['  \n ', ''])).toBe('');
  });
});

describe('threadLabel', () => {
  it('labels threads only', () => {
    expect(threadLabel(['one'])).toBeNull();
    expect(threadLabel(['one', 'two', 'three'])).toBe('Thread · 3 posts');
  });
});
