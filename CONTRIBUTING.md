# Contributing to XBase

This guide covers what is shared across the monorepo: the tooling, the checks, styling with BoardUI and pull requests. Each app has its own guide for running and testing it:

- [Website](apps/web/README.md): set up `apps/web/.env`, then run `pnpm dev` in `apps/web` (see [Work on the website](#work-on-the-website)).
- [Extension](apps/extension/CONTRIBUTING.md): development builds, the dev browser profile, manual tests and releases.

## Set up your environment

You need Node.js 24+ and pnpm: the website stores its data with Node's built-in SQLite module, `node:sqlite`. `.nvmrc` pins Node 24, which CI uses too, and the `packageManager` field in `package.json` pins pnpm. With [Corepack](https://nodejs.org/api/corepack.html) enabled, `pnpm` runs that version:

```sh
corepack enable
pnpm install
```

Node 25 and later don't include Corepack: install it first with `npm install -g corepack`, or use Node 24 (`nvm use` reads `.nvmrc`).

`pnpm install` also installs the git hooks (see [Git hooks](#git-hooks)).

## How the repository is organized

```text
apps/
  web/                 @xbase/web: XBase, the self-hosted web app (TanStack Start on a Node server, SQLite)
  extension/           @xbase/extension: x-companion, the WXT Chromium extension
packages/
  ai/                  @xbase/ai: AI provider calls and prompts, shared by both apps
  ui/                  @xbase/ui: BoardUI components and styles, and each app's palette
  core/                @xbase/core: the website's browser-safe schemas, DTOs and helpers
  db/                  @xbase/db: the website's database schema, migrations and connection
  server/              @xbase/server: the website's services (accounts, posts, AI, sign-in…)
  mcp/                 @xbase/mcp: the website's MCP tools and OAuth authorization server
pnpm-workspace.yaml    workspace folders, shared dependency versions (catalog)
.oxlintrc.json         lint rules for the whole repository
.oxfmtrc.json          format settings for the whole repository
lefthook.yml           git hooks
.github/workflows/     CI and the extension release
.agents/skills/        agent skills for TanStack Start, Chrome extensions and MCP (see below)
.claude/skills/        links to them for Claude Code, plus BoardUI's own skill
```

### Agent skills

`.agents/skills/` holds [agent skills](https://skills.sh/) that teach coding agents TanStack Start (`start-core` and the skills it links to), Chrome extensions (`chrome-extensions`) and MCP servers (`mcp-builder`). Codex reads them there; `.claude/skills/` links them for Claude Code. `skills-lock.json` records each skill's source and hash. They come from the `skills` CLI, so don't edit them by hand, and lint and formatting skip them. To pull the latest versions:

```sh
npx skills update --project
```

`.claude/skills/boardui/` is BoardUI's own skill for Claude Code: its design rules, a catalog of every component with usage examples, and its theming, layout and motion recipes. Read it before you build UI (see [Style the UI](#style-the-ui)). The `skills` CLI doesn't manage it, so `npx skills update` leaves it alone.

### Shared packages

`packages/` holds the logic; `apps/web` holds presentation and wiring. The website's own files are its pages, components and hooks, and the glue that ties packages to TanStack Start: server functions, middleware, cookies and server routes. Anything else, a rule, a service or a check, goes in a package, with its tests. The extension still keeps its logic in `src/lib/`, until it moves to calling the website's API. A package has no build step: it ships its TypeScript or CSS source, and an app imports it by subpath, such as `import { generateText } from '@xbase/ai/llm'` or `@import '@xbase/ui/styles/globals.css'`. The app's bundler and `tsc` then treat that source like the app's own code:

- **Declare each subpath**: an app can import only the paths listed in the package's `exports` in its `package.json`. Add a new module there before you import it. `@xbase/ui` is the exception for its TypeScript: BoardUI imports files as `@xbase/ui/<folder>/<file>` without an extension, which `exports` can't map, so `tsconfig.json` `paths` resolve it (in `packages/ui` and in each app), and Vite, WXT and Vitest follow them with `resolve.tsconfigPaths`. Its stylesheets still go through `exports`.
- **Pass both apps' type checks**: each app checks the package source with its own `tsconfig.json`. Each package's `tsconfig.json` combines the strictest options of both, so `pnpm --filter @xbase/ai typecheck` (or `@xbase/ui`) catches most problems first.
- **Depend on a package** with `"@xbase/ai": "workspace:*"` in the app's `package.json`, then run `pnpm install`.

The website's logic is layered: each package may import only the ones before it.

1. `@xbase/core`: what the browser may load. Input schemas (zod), the DTOs server functions return, the service errors, X's weighted length and the date helpers. No Node or server imports.
2. `@xbase/db`: the Drizzle schema, the SQL migrations in `packages/db/drizzle/`, and `connectDb` and `getDb`. The web app's `src/server.ts` opens the database at startup; `@xbase/db/testing` gives tests an in-memory one.
3. `@xbase/server`: the services the UI, the REST API and the MCP tools share, plus the environment (`getEnv`), session storage and X's side of signing in. Plain functions and `Request`/`Response`: nothing from TanStack Start.
4. `@xbase/mcp`: the `/mcp` endpoint, its tools, and the OAuth authorization server that guards it.

`@xbase/db`, `@xbase/server` and `@xbase/mcp` are server-only. The website's `vite.config.ts` adds them to TanStack Start's import protection, so a build fails if browser code imports one; server functions and server routes may, since the compiler strips them from the client bundle. Each package's tests run with `pnpm --filter @xbase/<name> test`.

`@xbase/ai` holds the AI code: the provider list, the HTTP calls to each provider (`generateText`, and `listModels`, which also validates a key), the prompts, and `scrubSecrets`, which both apps run on provider error text before showing it. It calls providers with plain `fetch`, so it runs in the extension's service worker and on the website's server alike. Its tests run with `pnpm --filter @xbase/ai test`.

### Shared dependency versions

Versions that every package must agree on, such as React, React Aria Components, Remix Icon, Tailwind CSS, Vite, Vitest and TypeScript, live in the `catalog` in `pnpm-workspace.yaml`. A package references them as `"catalog:"` in its `package.json`. Change the version there, then run `pnpm install`.

pnpm doesn't run dependencies' install scripts unless `allowBuilds` in `pnpm-workspace.yaml` lists them, and `strictDepBuilds` makes the install fail when a new dependency needs one. Review the package's script before you allow it.

## Work on the website

`apps/web` is a Node server, not a static site: TanStack Start renders every page on request, behind the sign-in, and [Nitro](https://nitro.build)'s `node-server` preset builds it into `apps/web/.output`. Nothing is prerendered.

- **Give it a `.env` first**: the server doesn't start without `X_CLIENT_ID` and `X_CLIENT_SECRET`, the OAuth 2.0 credentials of an X app of yours with `http://127.0.0.1:5173/auth/x/callback` as a callback URL (add the port `pnpm dev` prints when 5173 is taken, and set `APP_URL` to it, to sign in there). Copy `apps/web/.env.example` to `apps/web/.env` (git ignores it) and fill them in, then open the dev server at the address it prints (`localhost` redirects to `127.0.0.1`). [apps/web/README.md](apps/web/README.md#set-up-your-x-app) explains the X app and lists every variable.
- **Put server logic in a package**: services in `@xbase/server`, MCP and OAuth in `@xbase/mcp`, schemas and DTOs the UI shares in `@xbase/core` (see [Shared packages](#shared-packages)). The UI reaches the server through `createServerFn` wrappers in each feature's `*.functions.ts`. The app's own server-only glue, such as reading the session cookie, goes in `*.server.ts` files: TanStack Start fails the build when browser code imports one, or one of the server-only packages.

### Change the database schema

The tables live in `packages/db/src/schema.ts`, and the SQL migrations that create them in `packages/db/drizzle/`. The server applies pending migrations when it starts.

1. Edit `schema.ts`.
2. Write a migration, named after the change:

   ```sh
   pnpm --filter @xbase/web db:generate --name <slug>   # e.g. --name add-post-media
   ```

3. Commit the new folder in `packages/db/drizzle/` with your change.

Never edit a migration that is already on `main`: databases that ran it won't run it again, so add a new one instead. `pnpm test` fails when `schema.ts` has a change without its migration: a test in `@xbase/db` runs `drizzle-kit generate` against a copy of `packages/db/drizzle/` and expects it to write nothing.

## Style the UI

Both apps are built from [BoardUI](https://www.boardui.com) components: React and Tailwind CSS v4 source files on [React Aria Components](https://react-spectrum.adobe.com/react-aria/react-aria-components.html), with icons from [Remix Icon](https://remixicon.com) (`@remixicon/react`). BoardUI isn't an npm package: its CLI copies each component's source into `packages/ui` (`@xbase/ui`), and both apps import it from there by path, such as `import { Button } from '@xbase/ui/components/base/buttons/button'`. Each component file opens with a doc comment that lists its variants and sizes.

```text
packages/ui/
  boardui.json             where the BoardUI CLI writes files, and the import paths it uses
  components/base/         buttons, inputs, select, tabs, tooltip, chips…
  components/application/  the sidebar and the sign-in card, trimmed for the website
  components/foundations/  icons and the reading direction that other components use
  components/xbase/        XBase's own components, for what BoardUI lacks
  styles/                  BoardUI's tokens (theme.css), type scale (typography.css) and Tailwind entry (globals.css)
  palettes/                one palette per app: petrol.css (website), x.css (extension)
  lib/color-scheme.js      the dark-mode script
```

- **Use a BoardUI component** whenever one fits, and never hand-build a lookalike of one. Look them up with `npx boardui@latest list` or in the skill's [component catalog](.claude/skills/boardui/references/components.md). Only the free components are available: BoardUI Pro items need a license.
- **Add a component with the BoardUI CLI**, run from `packages/ui`. `boardui.json` sends its files to that package, rewrites their imports to `@xbase/ui/...`, and the CLI installs the npm packages they need there. With `-y` it skips files that already exist, so it never overwrites XBase's changes. It also adds `@tailwindcss/postcss`, which only Next.js projects use, so remove that again:

  ```sh
  cd packages/ui
  npx boardui@latest add <name> -y
  pnpm remove @tailwindcss/postcss
  ```

  A new folder of TypeScript files also goes in the `include` of `packages/ui/tsconfig.json`: Vite resolves `@xbase/ui` imports only in the files it lists.

- **Change an installed component in place**, rather than wrapping it, and delete a component once nothing uses it. Mark each change with an `XBase:` comment that says why, so a later refresh from the registry (`add <name> --overwrite`) doesn't drop it unnoticed; `packages/ui/components/__tests__/xbase-edits.test.ts` fails if the accent-text, placeholder or focus-ring edits are reverted. Keep BoardUI's `styles/` whole, though: `globals.css` holds the styles of every BoardUI component, installed or not, so a component you add later works. Its one `XBase:` edit gives every ring offset the page colour, so a focus ring keeps a 2px gap from its control in both modes.
- **Write your own component only when BoardUI has no alternative.** It goes in `packages/ui/components/xbase/`, as a thin composition of `react-aria-components` styled with BoardUI's tokens, type scale and motion, with a doc comment that says why BoardUI's components don't cover it. Today there are four: `Modal` (dialogs and alert dialogs), `Callout` (an inline status note), `Combobox` (a searchable select) and `Spinner` (a busy state). The sidebar's mobile drawer, `SidebarDrawer` in `dashboard-sidebar.tsx`, is the same kind of addition. Compositions of BoardUI parts that only one app needs stay in that app, such as the website's layouts in `apps/web/src/features/shell/`.
- **Follow BoardUI's design rules**. The skill has them in full; in short:
  - Colour only with semantic tokens, such as `text-text-secondary`, `bg-background-primary-default` or `border-border-button-default`, never raw palette classes, hex or OKLCH values. Accent text and links use `text-text-accent`.
  - Set type only with the composite utilities, such as `text-body-regular` or `text-title-3-semibold`, never `text-sm font-medium`.
  - Cards are `rounded-3xl border border-border-button-default bg-background-primary-default`. Space things with `gap`, not margins.
  - Pass icons as components, such as `leadingIcon={RiAddLine}`, and merge classes with `cx()` from `@xbase/ui/utils/cx`.
  - Build fields from BoardUI's React Aria inputs, never a raw `<input>` or `<select>`.
  - Focus shows as `outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring`, plus `focus-visible:ring-offset-2` on an accent fill, so the ring doesn't merge into it. Animations reuse the skill's motion recipes.
- **Mind BoardUI's plain buttons**: `Button`, `IconButton` and `CloseButton` are HTML buttons, not React Aria ones. Use `onClick` and `disabled`, wrap them in React Aria's `<Focusable>` inside a `TooltipTrigger`, and in `<Pressable>` inside a `DialogTrigger`. On the website, their link versions become TanStack Router links in `apps/web/src/features/shell/router-links.ts` (`ButtonRouterLink` and friends), and React Aria's own links navigate through the `RouterProvider` in `apps/web/src/routes/__root.tsx`.
- **Mind React Aria's native validation**: BoardUI's fields are React Aria fields, and they use the browser's validation unless told otherwise. Pass `validationBehavior="aria"` when you set `isInvalid` yourself on a field inside a `<form>`, or when its type has built-in validity rules (`url`, `email`) that the app doesn't enforce. Otherwise the browser silently blocks the form's submit, or marks the field invalid with no message. XBase's forms report their own errors.
- **Keep each app's palette in `packages/ui/palettes/`**. A palette overrides BoardUI's tokens for one app: the website uses `petrol.css`, XBase's own petrol-blue palette with the Inter font, and the extension uses `x.css`, X's greys and blue with X's Chirp-first font stack, so the side panel blends with x.com. Each app's entry stylesheet (`apps/web/src/styles.css`, `apps/extension/src/assets/tailwind.css`) imports `@xbase/ui/styles/globals.css`, then its palette.
- **Change a colour in its palette file**, never in an app or a component, for light mode (`:root:not(.dark)`) and dark mode (`.dark`). `pnpm --filter @xbase/ui test` checks WCAG AA for every token pair the components draw, in both modes and both palettes, and fails when one drops below it. When a new component draws a new pair, add it to `packages/ui/palettes/__tests__/contrast.test.ts`.
- **Dark mode follows the operating system** through BoardUI's `dark` class on `<html>`. `packages/ui/lib/color-scheme.js` sets it from `prefers-color-scheme` and follows changes. It has to run before the first paint, so it is a blocking script in `<head>`: the website inlines it (`apps/web/src/routes/__root.tsx`), and the extension's side panel loads it as a file (`apps/extension/public/color-scheme.js` links to it), because Manifest V3 forbids inline scripts. There is no theme switch. Don't write `dark:` colour overrides: pick another token.
- **Keep the `@source` lines in each app's entry stylesheet**: Tailwind doesn't scan files outside the app, so they point it at `packages/ui/components`. Without them, components render unstyled and nothing reports an error. The extension skips `components/application/`, which only the website uses.

## Run the checks

Run these from the repository root before you open a pull request. CI runs the same checks on every pull request and every push to `main`:

```sh
pnpm format:check   # oxfmt, formatting
pnpm lint           # oxlint, with type-aware rules; warnings fail
pnpm typecheck      # tsc in each app and package
pnpm test           # Vitest in each app and package that has tests
pnpm build          # each app's production build
```

`pnpm format` and `pnpm lint:fix` fix most formatting and lint problems for you. When a lint rule is wrong for one line, disable it there with a reason: `// oxlint-disable-next-line <rule> -- <why>`.

The website's build and its dev server regenerate `apps/web/src/routeTree.gen.ts` from the files in `src/routes/`. Commit it: CI type checks before it builds, and fails if the build changes a committed file.

### Git hooks

[Lefthook](https://github.com/evilmartians/lefthook) runs a pre-commit hook that lints the files you stage with oxlint and checks their formatting with oxfmt. A lint error or an unformatted file stops the commit; lint warnings don't, but CI fails on them. The hook only checks: run `pnpm format` or `pnpm lint:fix`, stage the result and commit again. To skip the hooks once, run `LEFTHOOK=0 git commit ...`.

If the hooks don't run, reinstall them with `pnpm exec lefthook install`.

### Editor setup

For VS Code, install the recommended [Oxc extension](https://marketplace.visualstudio.com/items?itemName=oxc.oxc-vscode). The workspace settings make it format on save and show lint problems as you type.

## Open a pull request

Branch from `main` and keep each pull request to one change:

- **Title**: [Conventional Commits](https://www.conventionalcommits.org/), scoped to the app or area, for example `feat(web): add a pricing page` or `fix(extension): detect the inline reply box`. Squash merge, so the title becomes the commit on `main`. Release notes list the titles too, so write titles that read well in a changelog.
- **Checks**: everything in [Run the checks](#run-the-checks) passes.
- **Description**: fill in the template: what changed, why, and how you tested it. For UI changes, add before and after screenshots with no API keys or personal data in them.
