# XBase

XBase is a pnpm monorepo for tools that help you write on X in your own voice.

| Path             | Package            | What it is                                                                                                                                                  |
| ---------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`       | `@xbase/web`       | [XBase](apps/web/README.md), a self-hosted, single-user X workspace: a Node app built with [TanStack Start](https://tanstack.com/start), with SQLite        |
| `apps/extension` | `@xbase/extension` | [x-companion](apps/extension/README.md), a Chromium extension that drafts replies on X, built with [WXT](https://wxt.dev)                                   |
| `packages/ai`    | `@xbase/ai`        | The AI provider, LLM and prompt code shared by both apps                                                                                                    |
| `packages/ui`    | `@xbase/ui`        | The shared [BoardUI](https://www.boardui.com) package: its components and styles, XBase's few own components, and one colour palette per app in `palettes/` |

Both apps are React 19 apps built from [BoardUI](https://www.boardui.com) components on Tailwind CSS v4: the website in XBase's own palette, the extension in X's, so it blends with x.com.

## Get started

You need Node.js 24+ (`.nvmrc` pins 24) and pnpm 10, which [Corepack](https://nodejs.org/api/corepack.html) installs at the version in `package.json`:

```sh
corepack enable   # on Node 25+, first: npm install -g corepack
pnpm install
```

The install also sets up the git hooks and generates the extension's TypeScript config.

The web app needs a password before it starts. Copy its example environment file and set `APP_PASSWORD` (12 characters or more):

```sh
cp apps/web/.env.example apps/web/.env
```

Start an app's dev server:

```sh
pnpm --filter @xbase/web dev         # http://localhost:5173
pnpm --filter @xbase/extension dev   # opens Chrome with the extension loaded
```

To run XBase on a server, with Docker or Node, see [apps/web/README.md](apps/web/README.md).

## Commands

Run these from the repository root. `typecheck`, `test` and `build` run in every app and package that has the script.

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `pnpm build`        | Builds every app                                |
| `pnpm typecheck`    | Type checks every package with `tsc`            |
| `pnpm test`         | Runs every package's unit tests                 |
| `pnpm lint`         | Lints the repository with oxlint, warnings fail |
| `pnpm lint:fix`     | Applies oxlint's safe fixes                     |
| `pnpm format`       | Formats the repository with oxfmt               |
| `pnpm format:check` | Checks formatting without writing               |

To work on one app, filter by its package name, for example `pnpm --filter @xbase/extension test`, or run the script from the app's folder.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the tooling, the checks and how to open a pull request.

## License

[MIT](LICENSE)
