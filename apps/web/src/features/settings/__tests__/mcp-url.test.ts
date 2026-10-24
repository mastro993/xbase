import { describe, expect, it } from 'vitest';
import { claudeCodeCommand, mcpReach } from '../mcp-url';

describe('mcpReach', () => {
  it.each([
    ['https://xbase.example.com/mcp', 'public'],
    ['https://192.168.1.20/mcp', 'public'],
    ['http://localhost:3000/mcp', 'local'],
    ['https://localhost/mcp', 'local'],
    ['http://127.0.0.1:3000/mcp', 'local'],
    ['http://[::1]:3000/mcp', 'local'],
    ['http://192.168.1.20:3000/mcp', 'insecure'],
    ['http://xbase.lan/mcp', 'insecure'],
    ['http://127.0.0.1.example.com/mcp', 'insecure'],
    // Like the server's boot warning: Node-based clients don't resolve these to this computer.
    ['http://xbase.localhost:5173/mcp', 'insecure'],
    ['http://127.10.0.2/mcp', 'insecure'],
  ])('%s is %s', (url, reach) => {
    expect(mcpReach(url)).toBe(reach);
  });
});

describe('claudeCodeCommand', () => {
  it('adds an http server named xbase', () => {
    expect(claudeCodeCommand('https://xbase.example.com/mcp')).toBe(
      'claude mcp add --transport http xbase https://xbase.example.com/mcp',
    );
  });
});
