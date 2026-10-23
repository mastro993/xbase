# XBase

XBase is a pnpm monorepo for tools that help you write on X in your own voice.

| Path             | Package            | What it is                                                                                                                |
| ---------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`       | `@xbase/web`       | The website: Vite + [TanStack Start](https://tanstack.com/start), prerendered to static HTML                              |
| `apps/extension` | `@xbase/extension` | [x-companion](apps/extension/README.md), a Chromium extension that drafts replies on X, built with [WXT](https://wxt.dev) |
| `packages/ui`    | `@xbase/ui`        | The shared theme: design tokens, their Tailwind mapping and the dark-mode rule, as one CSS file                           |

Both apps are React 19 apps styled with Tailwind CSS v4 and built from [PanelUI web](https://panelui.dev/docs/web) components.

## Get started

You need Node.js 22.12+ (`.nvmrc` pins 24) and pnpm 10, which [Corepack](https://nodejs.org/api/corepack.html) installs at the version in `package.json`:

```sh
corepack enable   # on Node 25+, first: npm install -g corepack
pnpm install
```

The install also sets up the git hooks and generates the extension's TypeScript config.

Start an app's dev server:

```sh
pnpm --filter @xbase/web dev         # http://localhost:5173
pnpm --filter @xbase/extension dev   # opens Chrome with the extension loaded
```

## Commands

Run these from the repository root. `typecheck`, `test` and `build` run in every app that has the script.

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `pnpm build`        | Builds every app                                |
| `pnpm typecheck`    | Type checks every app with `tsc`                |
| `pnpm test`         | Runs every app's unit tests                     |
| `pnpm lint`         | Lints the repository with oxlint, warnings fail |
| `pnpm lint:fix`     | Applies oxlint's safe fixes                     |
| `pnpm format`       | Formats the repository with oxfmt               |
| `pnpm format:check` | Checks formatting without writing               |

To work on one app, filter by its package name, for example `pnpm --filter @xbase/extension test`, or run the script from the app's folder.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the tooling, the checks and how to open a pull request.
