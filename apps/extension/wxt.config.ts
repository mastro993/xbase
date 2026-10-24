import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// package.json's name is the workspace name (@xbase/extension): keep it out of the manifest and
// the zip file name.
const NAME = 'x-companion';

// Public half of a throwaway key; the private half was discarded. Unpacked builds derive their ID
// from their path, so this pins the dev build's to mogjdmpkbfcfdgedklmkjoploiamddcf. Storage (API
// keys, style guide) then carries over between checkouts that share a browser profile.
const DEV_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs8PjsusxDMaps3b67cJqeh/vvTm4ktbqtqfZsqHEryupi2tGZ67DVZHup7Celnx3/3bNSxIOVNdfN1RsvYSGCE1e7lEzKUXYwr/U4QWybgvGnYM+4867HELwiW87bFkkjGZemHuJVQOIijy07bBIuLU0nHtSWHNRBXacouxXVil35DBNWYPA1+SPlbSzdutLxx0TAmpc88RKVk8VThTeiEL+XkxjZ8oqSbrliaAwJs88hHcTbs0AmndDP+eePoYPaJYIKhvTHI2o6ZkmCu3eBRvC3JImNGZ19TQxr+T4pqMKFc6OK/C8wZ1Hg6ssd17dDGB9YGohex3GFajqgG/m9wIDAQAB';

export default defineConfig({
  srcDir: 'src',
  imports: false,
  modules: ['@wxt-dev/module-react'],
  // tsconfigPaths resolves @xbase/ui's BoardUI sources, which import each other by that alias.
  vite: () => ({ plugins: [tailwindcss()], resolve: { tsconfigPaths: true } }),
  manifest: {
    name: NAME,
    // storage.local.setAccessLevel for all areas.
    minimum_chrome_version: '140',
    // Required for sidePanel.setPanelBehavior({ openPanelOnActionClick }).
    action: { default_title: NAME },
    permissions: ['storage', 'sidePanel'],
    host_permissions: [
      // Also makes tab.url visible on x.com tabs, so no `tabs` permission.
      'https://x.com/*',
      'https://api.openai.com/*',
      'https://api.anthropic.com/*',
      'https://api.x.ai/*',
      'https://api.deepseek.com/*',
      'https://openrouter.ai/*',
    ],
  },
  // .output/x-companion-<version>-chrome.zip
  zip: { name: NAME },
  hooks: {
    // Tab-specific panels only: a manifest default_path registers a GLOBAL panel that
    // stays visible on every tab, even after setOptions({ tabId, enabled: false }).
    'build:manifestGenerated': (wxt, manifest) => {
      delete manifest.side_panel;
      // Dev only: the Chrome Web Store rejects uploads whose manifest has a key.
      if (wxt.config.command === 'serve') manifest.key = DEV_KEY;
    },
    // web-ext needs the profile dir (default or a local web-ext.config.ts override) to exist.
    'server:created': (wxt) => {
      const profile = wxt.config.webExt.config?.chromiumProfile;
      if (profile) mkdirSync(profile, { recursive: true });
    },
  },
  // Persistent dev profile keeps the x.com login between `pnpm dev` runs. Anchored to this file so
  // running WXT from the repo root doesn't create a second profile there. A scalar (not
  // chromiumArgs, which merge) so a local web-ext.config.ts can point another browser elsewhere.
  webExt: {
    chromiumProfile: resolve(import.meta.dirname, '.wxt/chrome-data'),
    keepProfileChanges: true,
    startUrls: ['https://x.com/home'],
  },
});
