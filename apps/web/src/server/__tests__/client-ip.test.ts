import { describe, expect, it } from 'vitest';
import { rateLimitKey, resolveClientIp } from '../client-ip.server';

describe('resolveClientIp', () => {
  it('ignores X-Forwarded-For unless proxies are trusted', () => {
    expect(resolveClientIp('203.0.113.7', '198.51.100.1', 0)).toBe('203.0.113.7');
    expect(resolveClientIp(undefined, '198.51.100.1', 0)).toBe('unknown');
  });

  it('takes the entry the last trusted proxy added, counting from the right', () => {
    expect(resolveClientIp('10.0.0.2', '198.51.100.1', 1)).toBe('198.51.100.1');
    expect(resolveClientIp('10.0.0.2', '198.51.100.1, 172.16.0.9', 2)).toBe('198.51.100.1');
  });

  it('never reads the entries a client wrote itself', () => {
    expect(resolveClientIp('10.0.0.2', '1.1.1.1, 2.2.2.2,198.51.100.1', 1)).toBe('198.51.100.1');
  });

  it.each([
    ['no header', undefined],
    ['too few entries', '198.51.100.1'],
    ['an entry that isn’t an address', 'unknown, nonsense'],
    ['an address with a port', '198.51.100.1:443, 198.51.100.2:443'],
  ])('falls back to the peer with %s', (_, header) => {
    expect(resolveClientIp('10.0.0.2', header, 2)).toBe('10.0.0.2');
  });

  it('normalizes what it returns', () => {
    expect(resolveClientIp('::ffff:10.0.0.2', undefined, 0)).toBe('10.0.0.2');
    expect(resolveClientIp('10.0.0.2', '2001:db8:1:2::1', 1)).toBe('2001:db8:1:2::/64');
  });
});

describe('rateLimitKey', () => {
  it('reads an IPv4-mapped address as IPv4', () => {
    expect(rateLimitKey('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(rateLimitKey('::FFFF:1.2.3.4')).toBe('1.2.3.4');
    expect(rateLimitKey('1.2.3.4')).toBe('1.2.3.4');
  });

  it('counts IPv6 per /64, however the address is written', () => {
    const key = rateLimitKey('2001:db8:1:2::1');
    expect(key).toBe('2001:db8:1:2::/64');
    expect(rateLimitKey('2001:db8:1:2:ffff::9')).toBe(key);
    expect(rateLimitKey('2001:0DB8:0001:0002:0000:0000:0000:0042')).toBe(key);
    expect(rateLimitKey('2001:db8:1:3::1')).not.toBe(key);
    expect(rateLimitKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(rateLimitKey('::1')).toBe('0:0:0:0::/64');
    expect(rateLimitKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(rateLimitKey('64:ff9b::192.0.2.1')).toBe('64:ff9b:0:0::/64');
  });

  it('leaves anything else alone', () => {
    expect(rateLimitKey('unknown')).toBe('unknown');
  });
});
