import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import {
  DEFAULT_X_API_SETTINGS,
  estimateHomeTimelineCostMicros,
  estimateHomeTimelinePageMicros,
  estimateReadCostMicros,
  formatUsdMicros,
  parseXApiSection,
  readXApiSettings,
  SaveXApiSettingsInput,
  usdToMicros,
  X_SEARCH_RESULTS_PER_CALL,
} from '../x-api';

describe('cost estimation', () => {
  it('prices own reads at $0.001 and others at $0.005', () => {
    expect(estimateReadCostMicros({ ownItems: 1 })).toBe(1_000);
    expect(estimateReadCostMicros({ otherItems: 1 })).toBe(5_000);
    expect(estimateReadCostMicros({ ownItems: 2, otherItems: 3 })).toBe(17_000);
    expect(estimateReadCostMicros({ ownItems: 0, otherItems: 0 })).toBe(0);
  });

  it('ignores blank and negative counts rather than subtracting spend', () => {
    expect(estimateReadCostMicros({ ownItems: 1.9, otherItems: -4 })).toBe(1_000);
  });

  it('estimates a home-timeline page as the tier’s 25 posts by others', () => {
    expect(X_SEARCH_RESULTS_PER_CALL).toBe(25);
    expect(estimateHomeTimelinePageMicros()).toBe(125_000);
    expect(estimateHomeTimelineCostMicros(1)).toBe(125_000);
    expect(estimateHomeTimelineCostMicros(4)).toBe(500_000);
    expect(estimateHomeTimelineCostMicros(0)).toBe(0);
  });

  it('converts and formats micro-dollars without float drift', () => {
    expect(usdToMicros(0.005)).toBe(5_000);
    expect(usdToMicros(5)).toBe(5_000_000);
    expect(formatUsdMicros(5_000)).toBe('$0.005');
    expect(formatUsdMicros(125_000)).toBe('$0.125');
    expect(formatUsdMicros(1_500_000)).toBe('$1.50');
  });
});

describe('settings', () => {
  it('starts with no caps, an hour of cache and one timeline page', () => {
    expect(readXApiSettings(null)).toEqual(DEFAULT_X_API_SETTINGS);
    expect(DEFAULT_X_API_SETTINGS.sources.homeTimelinePages).toBe(1);
    expect(DEFAULT_X_API_SETTINGS.cache.windowMinutes).toBe(60);
  });

  it('keeps saved fields and fills new ones from the defaults', () => {
    expect(readXApiSettings({ cache: { windowMinutes: 15 } })).toEqual({
      ...DEFAULT_X_API_SETTINGS,
      cache: { windowMinutes: 15 },
    });
    expect(
      readXApiSettings({ budget: { dailyCapUsd: 2 }, sources: { homeTimelinePages: 3 } }),
    ).toEqual({
      budget: { dailyCapUsd: 2, monthlyCapUsd: null },
      cache: DEFAULT_X_API_SETTINGS.cache,
      sources: { homeTimelinePages: 3 },
    });
  });

  it('falls back to a section’s defaults when the stored value no longer reads', () => {
    const settings = readXApiSettings({
      budget: { dailyCapUsd: 'lots' },
      cache: { windowMinutes: 15 },
    });
    expect(settings.budget).toEqual(DEFAULT_X_API_SETTINGS.budget);
    expect(settings.cache).toEqual({ windowMinutes: 15 });
  });

  it('validates each section on its own', () => {
    expect(parseXApiSection('budget', { dailyCapUsd: null, monthlyCapUsd: 10 })).toEqual({
      dailyCapUsd: null,
      monthlyCapUsd: 10,
    });
    expect(() => parseXApiSection('sources', { homeTimelinePages: 0 })).toThrow(ValidationError);
    expect(() => parseXApiSection('sources', { homeTimelinePages: 11 })).toThrow(ValidationError);
    expect(() => parseXApiSection('cache', { windowMinutes: -1 })).toThrow(ValidationError);
    expect(() => parseXApiSection('budget', { dailyCapUsd: -0.01, monthlyCapUsd: null })).toThrow(
      ValidationError,
    );
  });

  it('accepts the Settings form’s one-shot shape', () => {
    const parsed = SaveXApiSettingsInput.parse({
      budget: { dailyCapUsd: 1, monthlyCapUsd: null },
      cache: { windowMinutes: 60 },
      sources: { homeTimelinePages: 2 },
    });
    expect(parsed.sources.homeTimelinePages).toBe(2);
  });
});
