# Contributing to XBase

This guide covers what is shared across the monorepo: the tooling, the checks, styling with PanelUI and pull requests. Each app has its own guide for running and testing it:

- [Website](apps/web): run `pnpm dev` in `apps/web`.
- [Extension](apps/extension/CONTRIBUTING.md): development builds, the dev browser profile, manual tests and releases.

## Set up your environment

You need Node.js 22.12+ and pnpm. `.nvmrc` pins Node 24, which CI uses too, and the `packageManager` field in `package.json` pins pnpm. With [Corepack](https://nodejs.org/api/corepack.html) enabled, `pnpm` runs that version:

```sh
corepack enable
pnpm install
```

Node 25 and later don't include Corepack: install it first with `npm install -g corepack`, or use Node 24 (`nvm use` reads `.nvmrc`).

`pnpm install` also installs the git hooks (see [Git hooks](#git-hooks)).

## How the repository is organized

```text
apps/
  web/                 @xbase/web: Vite + TanStack Start website
  extension/           @xbase/extension: x-companion, the WXT Chromium extension
packages/
  ui/                  @xbase/ui: theme.css, the shared design tokens
pnpm-workspace.yaml    workspace folders, shared dependency versions (catalog)
.oxlintrc.json         lint rules for the whole repository
.oxfmtrc.json          format settings for the whole repository
lefthook.yml           git hooks
.github/workflows/     CI and the extension release
.agents/skills/        agent skills for PanelUI and TanStack Start (see below)
```

### Agent skills

`.agents/skills/` holds [agent skills](https://skills.sh/) that teach coding agents PanelUI web (`panelui-web`) and TanStack Start (`start-core` and the skills it links to). Codex reads them there; `.claude/skills/` links them for Claude Code. `skills-lock.json` records each skill's source and hash. They come from the `skills` CLI, so don't edit them by hand, and lint and formatting skip them. To pull the latest versions:

```sh
npx skills update --project
```

### Shared dependency versions

Versions that every app must agree on, such as React, Tailwind CSS, Vite, TypeScript and `panelui-web`, live in the `catalog` in `pnpm-workspace.yaml`. An app references them as `"catalog:"` in its `package.json`. Change the version there, then run `pnpm install`.

pnpm doesn't run dependencies' install scripts unless `allowBuilds` in `pnpm-workspace.yaml` lists them, and `strictDepBuilds` makes the install fail when a new dependency needs one. Review the package's script before you allow it.

## Style the UI

Both apps use [PanelUI web](https://panelui.dev/docs/web) components, from the `panelui-web` package, styled with Tailwind CSS v4 on the shared theme:

- **Import each component from its own path**: `import { Button } from 'panelui-web/button'`. A component that PanelUI lacks can come from shadcn/ui, as in the extension's `src/components/ui/`.
- **Keep the tokens in `packages/ui/theme.css`**: it defines the colours, radius and font that PanelUI reads, in X's palette, and makes `dark:` follow the operating system's theme. Each app imports it from its Tailwind entry stylesheet (`apps/web/src/styles.css`, `apps/extension/src/assets/tailwind.css`). Change a colour there, not in an app.
- **Keep the `@source` line in each app's entry stylesheet**: Tailwind doesn't scan `node_modules`, so that line points it at `panelui-web`'s classes. Without it, PanelUI components render unstyled and nothing reports an error.
- **Upgrade `panelui-web` on purpose**: it is pre-1.0 and changes often, so the catalog pins an exact version. Read the changes before you bump it.

To copy a component's source into an app instead, so you can change it, use the shadcn CLI with the PanelUI registry, which each app's `components.json` registers. It writes to `src/components/panelui/`:

```sh
pnpm dlx shadcn@latest add @panelui/alert --cwd apps/web
```

For components that use colour tokens, such as alert, the CLI also edits the app's stylesheet: it adds `@custom-variant dark (&:is(.dark *));`, `:root` and `.dark` token blocks and an `@theme inline` block. Revert all of it. The shared theme already defines these tokens, and the custom variant would switch every `dark:` class to a `.dark` class that never exists, turning dark mode off.

## Run the checks

Run these from the repository root before you open a pull request. CI runs the same checks on every pull request and every push to `main`:

```sh
pnpm format:check   # oxfmt, formatting
pnpm lint           # oxlint, with type-aware rules; warnings fail
pnpm typecheck      # tsc in each app
pnpm test           # Vitest in each app that has tests
pnpm build          # each app's production build
```

`pnpm format` and `pnpm lint:fix` fix most formatting and lint problems for you. When a lint rule is wrong for one line, disable it there with a reason: `// oxlint-disable-next-line <rule> -- <why>`.

The website's build regenerates `apps/web/src/routeTree.gen.ts` from the files in `src/routes/`. Commit it: CI type checks before it builds, and fails if the build changes a committed file.

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
