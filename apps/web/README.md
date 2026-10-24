# XBase web

XBase is a personal workspace for X (Twitter) that you host yourself: it helps you write and schedule your posts and, once connected to the X API, will find posts worth replying to and show how yours perform. It has one user, you, and signs in with a password from its environment. Your data stays in one SQLite file on your server.

It is a Node server built with [TanStack Start](https://tanstack.com/start) and [Nitro](https://nitro.build), with the UI built from [BoardUI](https://www.boardui.com) components in XBase's own palette. It follows your system's light or dark mode and fits a phone screen.

## What it does

- **Drafts**: write a post or a thread of up to 25 posts. Each post shows X's weighted character count (a link counts 23, an emoji or a CJK character 2) against the 280 limit. Save with ⌘S or Ctrl+S. **Refine with AI** rewrites a post in your voice, using your own AI provider key.
- **Queue**: schedule a draft at a time in your browser's time zone. The queue lists scheduled posts by day; reschedule them, edit them or move them back to the drafts.
- **Discover**: keep the X searches you'd run by hand, in X's search syntax, and open any of them on x.com.
- **Stats**: a placeholder for now: engagement rate, the best times to post and follower growth arrive with the X API.
- **Settings**: the AI provider, model and key; your voice for the AI; API keys; MCP; sessions.
- **For other apps**: a [REST API](#rest-api) for drafts, with API keys, and an [MCP server](#mcp) with OAuth, so assistants such as Claude can write and schedule.

It signs in with one password, keeps sessions on the server so signing out ends them, migrates its SQLite database at startup, and ships with a health check and a Docker image.

## Status: not connected to X yet

XBase will work through **your own X developer app**, with the official X API only. That connection isn't built yet, so for now:

- **Scheduled posts aren't published.** They wait in the queue, and the Queue page says so.
- **Discover lists no posts** and **Stats shows no numbers**. Both pages say what will appear.

Two facts about the X API shape what comes next (as of October 2026; check X's developer docs for current terms):

- **It's pay-per-use**, with no free tier: you buy credits. Creating a post costs $0.015, or $0.20 with a link; reading someone else's post $0.005; reading your own posts and followers $0.001 each.
- **Apps can't reply to other people's posts.** Since February 2026 the API accepts a reply only when the post's author mentioned or quoted you. Replying from Discover will therefore open the post on x.com.

## Environment

| Variable                  | Required      | Default                                        | What it does                                                                                                                                                           |
| ------------------------- | ------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_PASSWORD`            | Yes           | none                                           | The password that signs you in, at least 12 characters. The server doesn't start without it.                                                                           |
| `APP_URL`                 | In production | `http://localhost:5173` in `pnpm dev`          | The address you open XBase at, as an origin: `https://xbase.example.com`, no path. With `https`, cookies are `Secure`. MCP clients only connect over HTTPS.            |
| `DATABASE_PATH`           | No            | `./data/xbase.db` (`/data/xbase.db` in Docker) | The SQLite file. Its folder is created if missing.                                                                                                                     |
| `PORT`, `HOST`            | No            | `3000`, all interfaces                         | Where the production server listens. `pnpm dev` always uses port 5173.                                                                                                 |
| `MIGRATIONS_DIR`          | No            | `./drizzle` (`/app/drizzle` in Docker)         | The migrations folder, if the server runs from another working directory.                                                                                              |
| `TRUST_PROXY_HOPS`        | No            | `0`                                            | How many reverse proxies in front of XBase add the visitor's address to `X-Forwarded-For`, for the rate limits. See [behind a reverse proxy](#behind-a-reverse-proxy). |
| `SERVER_SHUTDOWN_TIMEOUT` | No            | `5` (`25` in Docker)                           | Seconds the production server waits for requests to finish when it stops.                                                                                              |

`pnpm dev` and `pnpm start` read `apps/web/.env`; start from [`.env.example`](.env.example). A production server never reads `.env` by itself: `pnpm start` passes it to Node, and Docker takes the variables from the container environment.

A wrong or missing value stops the server at startup with a message that names it.

## Develop

From the repository root, after `pnpm install`:

```sh
cp apps/web/.env.example apps/web/.env   # then set APP_PASSWORD
pnpm --filter @xbase/web dev             # http://localhost:5173
```

Sign in with `APP_PASSWORD`. The database is created in `apps/web/data/`, which git ignores.

In `apps/web`:

| Command                          | What it does                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm test`                      | Runs the unit tests (Vitest)                                                            |
| `pnpm typecheck`                 | Type checks with `tsc`                                                                  |
| `pnpm db:generate --name <name>` | Writes a migration to `drizzle/` after a change to `src/server/db/schema.ts`; commit it |
| `pnpm db:migrate`                | Applies migrations to `DATABASE_PATH` (the server also does this when it starts)        |
| `pnpm db:studio`                 | Opens Drizzle Studio on the database                                                    |

Server code that must never reach the browser lives in `*.server.ts` files; TanStack Start fails the build if client code imports one.

The code in `src/`:

| Folder                | What's in it                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `routes/`             | Pages and HTTP endpoints, one file per route; `routeTree.gen.ts` is generated from them                                              |
| `features/<feature>/` | One folder per feature: `*.server.ts` services, `*.functions.ts` server functions for the UI, `*.schema.ts` shared types, components |
| `server/`             | The database, environment, scheduler and housekeeping                                                                                |
| `lib/`                | Small helpers shared by several features                                                                                             |

The UI is built from the BoardUI components in `packages/ui` (`@xbase/ui`); `features/shell/` composes them into the app shell, the list and workbench layout, section cards and empty states. See [Style the UI](../../CONTRIBUTING.md#style-the-ui) for the rules. Each page loads its data in its route's `loader` through server functions, and a change calls its server function, then `router.invalidate()` to reload.

## Run in production with Node

You need Node.js 24 or later.

```sh
pnpm --filter @xbase/web build   # writes apps/web/.output
cd apps/web
pnpm start                       # node --env-file-if-exists=.env .output/server/index.mjs
```

Set `APP_URL` in `.env` first, for example `APP_URL=http://localhost:3000`. `.output/` is self-contained: copy it with the `drizzle/` folder to run it elsewhere, and set `MIGRATIONS_DIR` if you start it from another folder.

The extension's dev server also uses port 3000; set `PORT` if both run on one machine.

## Run with Docker

Build from the repository root, then run with a volume for the database:

```sh
docker build -f apps/web/Dockerfile -t xbase .
docker run -d --name xbase -p 3000:3000 \
  -e APP_PASSWORD='a long random password' \
  -e APP_URL=https://xbase.example.com \
  -v xbase-data:/data \
  --stop-timeout 30 \
  xbase
```

Or with Docker Compose, from `apps/web`, using [`compose.yaml`](compose.yaml):

```sh
cp .env.example .env   # set APP_PASSWORD and APP_URL
docker compose up -d --build
```

The image runs as the `node` user (uid 1000), so a bind-mounted `/data` folder must be writable by it. A health check calls `/api/health`. On shutdown the server waits up to `SERVER_SHUTDOWN_TIMEOUT` seconds for requests to finish: 25 in the image, so it closes them before Docker's stop timeout, which the examples raise from 10 to 30 seconds.

### Behind a reverse proxy

Behind a reverse proxy that terminates HTTPS, such as Caddy, nginx or a Cloudflare Tunnel, set `APP_URL` to the public `https://` address. XBase builds every absolute URL from `APP_URL`, never from `X-Forwarded-*` headers.

Then set `TRUST_PROXY_HOPS` to the number of proxies in front of XBase that add the visitor's address to `X-Forwarded-For`: `1` for Caddy, nginx (with `$proxy_add_x_forwarded_for`) or `cloudflared`. With more than one, each must pass on the header it received (Caddy: `trusted_proxies`). The rate limits then count each visitor on their own: 10 wrong passwords per 15 minutes for sign-in, and the limits on the MCP endpoints below. They count IPv6 visitors per /64 network, which one machine usually owns.

**Without it, every request seems to come from the proxy**, so all visitors share one counter: anyone who can reach the sign-in page can pause sign-in for everyone, you included, with 10 wrong passwords every 15 minutes, and block MCP apps by flooding the token endpoint. Sessions already signed in keep working. Leave it at `0` when nothing sits in front of XBase: a visitor could then write any address into the header.

## Data and backups

Everything lives in the SQLite file at `DATABASE_PATH`, next to its `-wal` and `-shm` files while the server runs:

- sessions, drafts, scheduled posts and saved searches;
- settings, **including your AI provider's API key, in plain text**;
- hashes of XBase API keys and MCP tokens (never the keys themselves).

Treat the file like a password store: keep it on a disk only you can read, and encrypt its backups. XBase creates a new database, and its folder, readable only by the user the server runs as. Keep it on a local disk too; SQLite's write-ahead log doesn't work reliably on network shares.

To back it up while the server runs, write a consistent copy with `VACUUM INTO`, then store the copy:

```sh
node -e "new (require('node:sqlite').DatabaseSync)('data/xbase.db').exec(\"VACUUM INTO 'data/backup.db'\")"
# Docker:
docker exec xbase node -e "new (require('node:sqlite').DatabaseSync)('/data/xbase.db').exec(\"VACUUM INTO '/data/backup.db'\")"
```

To restore, stop the server and replace `xbase.db` with the copy, deleting any `xbase.db-wal` and `xbase.db-shm` beside it.

Changing `APP_PASSWORD` doesn't end sessions that are already signed in. Sign out everywhere from Settings, or delete the rows in the `sessions` table.

## REST API

Scripts and other apps reach your drafts through a small JSON API under `/api/v1`; the XBase browser extension will use it too.

### Authentication

Create a key in **Settings → API keys**. XBase shows it once, when you create it, and stores only its hash; revoking it deletes it. Send it on every request:

```http
Authorization: Bearer xbase_ak_…
```

A missing, malformed or revoked key gets `401` with `WWW-Authenticate: Bearer`. Keys can't be passed in the URL, and the API sends no CORS headers: call it from a server, a script or an extension with host permissions, not from a web page.

### Endpoints

| Method and path               | Body              | Answer                                                                                               |
| ----------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /api/v1/me`              |                   | `200 { "app": "xbase", "version": 1 }`, to check a key                                               |
| `GET /api/v1/drafts?limit=50` |                   | `200 { "items": [Post…] }`: drafts and failed posts, last edited first; `limit` is 1–200, default 50 |
| `POST /api/v1/drafts`         | `{ "parts": [] }` | `201` with the new draft                                                                             |
| `GET /api/v1/drafts/:id`      |                   | `200` with the post                                                                                  |
| `PATCH /api/v1/drafts/:id`    | `{ "parts": [] }` | `200` with the post; replaces its texts                                                              |
| `DELETE /api/v1/drafts/:id`   |                   | `204`, no body                                                                                       |

`parts` holds one string per post: more than one makes a thread. A draft has 1 to 25 parts, each with some text and at most 25,000 characters. XBase doesn't enforce X's 280-character limit, which depends on your account.

A post looks like this. Times are ISO 8601 in UTC; `origin` says where it was created (`web`, `api` or `mcp`):

```json
{
  "id": "87ff4888-9e37-48f8-9da2-1b1d35b45c1f",
  "status": "draft",
  "parts": ["Hello from the API", "A second post makes it a thread"],
  "publishAt": null,
  "publishedAt": null,
  "xPostId": null,
  "error": null,
  "origin": "api",
  "createdAt": "2026-10-23T15:52:01.550Z",
  "updatedAt": "2026-10-23T15:52:01.550Z"
}
```

`status` is `draft`, `scheduled`, `publishing`, `published` or `failed`. A scheduled post can be edited (it keeps its time) or deleted; a post being published or already on X can't.

### Examples

```sh
export XBASE_URL=https://xbase.example.com XBASE_KEY=xbase_ak_…

curl -H "Authorization: Bearer $XBASE_KEY" "$XBASE_URL/api/v1/me"

curl -H "Authorization: Bearer $XBASE_KEY" -H 'Content-Type: application/json' \
  -d '{"parts":["Shipped a thing today.","Here is how it works."]}' \
  "$XBASE_URL/api/v1/drafts"

curl -X PATCH -H "Authorization: Bearer $XBASE_KEY" -H 'Content-Type: application/json' \
  -d '{"parts":["Shipped a thing today!"]}' "$XBASE_URL/api/v1/drafts/<id>"

curl -X DELETE -H "Authorization: Bearer $XBASE_KEY" "$XBASE_URL/api/v1/drafts/<id>"
```

### Errors

Every error is JSON with a stable `error` code and, usually, a `message` you can show:

```json
{ "error": "invalid_request", "message": "✖ Write some text in every post\n  → at parts[1]" }
```

| Status | `error`              | When                                                    |
| ------ | -------------------- | ------------------------------------------------------- |
| 400    | `invalid_request`    | The body isn't JSON, or a field is missing or invalid   |
| 401    | `unauthorized`       | No API key, or one XBase doesn't know                   |
| 404    | `not_found`          | No post with that id, or an unknown `/api` path         |
| 405    | `method_not_allowed` | The path exists, but not with that method (see `Allow`) |
| 409    | `invalid_state`      | The post is being published or is already on X          |
| 500    | `internal_error`     | A bug; the server log has the details                   |

## MCP

AI assistants such as Claude, Claude Code and Cursor can work with your drafts and queue through XBase's [MCP](https://modelcontextprotocol.io) server. It speaks the 2026-07-28 protocol and still serves clients on the 2025 versions.

The server URL is `APP_URL` followed by `/mcp`, for example `https://xbase.example.com/mcp`. **Settings → MCP** shows it.

### Before you connect

- **Use a public HTTPS address.** Claude connects from Anthropic's servers, not from your computer, so it needs to reach XBase on the internet over HTTPS: put it behind a reverse proxy with a certificate, a Cloudflare Tunnel or Tailscale Funnel.
- **Set `APP_URL` to exactly that address.** Every token is bound to `APP_URL/mcp`, and the sign-in links are built from it. Paste the same URL into every client, local ones included. If you change `APP_URL` later, connected apps must connect again.
- A plain `http://` address only works for clients on the same machine, with `APP_URL=http://localhost:<port>`.

### Connect a client

Each client opens your browser the first time. Sign in to XBase if asked, then check the consent page and choose **Approve**:

- the app's name, with a **Verified** tag and the site (for example claude.ai) when its identity comes from a metadata document on that site, or **Name not verified** when the app named itself;
- **Returns to**: where XBase sends the answer. Deny if you don't recognize it;
- a warning when the answer goes to an app on your computer: only continue if you just started the connection there yourself.

| Client                        | How                                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude (web, desktop, mobile) | **Settings → Connectors → Add custom connector**, paste the URL, leave the OAuth client ID and secret empty, then **Connect**.                  |
| Claude Code                   | `claude mcp add --transport http xbase https://xbase.example.com/mcp`, then run `/mcp` in Claude Code and pick `xbase` to sign in.              |
| Cursor, VS Code and others    | Add a remote MCP server of type Streamable HTTP (sometimes called `http`) with the URL. The client registers itself and opens the sign-in page. |

### Tools

| Tool                  | What it does                                                                |
| --------------------- | --------------------------------------------------------------------------- |
| `list_drafts`         | Drafts and failed posts, last edited first (`limit` 1–200, default 50)      |
| `get_draft`           | One post by id, in any status                                               |
| `create_draft`        | Saves a new post or thread as a draft                                       |
| `update_draft`        | Replaces the texts of a draft, scheduled or failed post                     |
| `delete_draft`        | Deletes a draft, scheduled or failed post                                   |
| `schedule_post`       | Queues a post at an ISO 8601 time with a time zone, at least a minute ahead |
| `unschedule_post`     | Takes a post out of the queue, back to the drafts                           |
| `list_scheduled`      | The queue, soonest first, optionally between `from` and `to`                |
| `list_saved_searches` | Your saved X searches from Discover                                         |

Posts take the same shape as in the REST API, with `origin` set to `mcp`. No tool publishes to X: an assistant can write and schedule, and publishing stays with XBase's scheduler (not connected to X yet).

### Disconnect an app

**Settings → MCP → Connected apps** lists every app you approved, with when it last used XBase. **Disconnect** stops its tokens at once; it has to ask for your consent again to come back. An app that disconnects itself, or stops using XBase for 60 days, drops off the list too.

### How it is secured

XBase is its own OAuth 2.1 authorization server, signed in with your password:

- Discovery: `/.well-known/oauth-protected-resource/mcp` (also at `/.well-known/oauth-protected-resource`) and `/.well-known/oauth-authorization-server`. A request to `/mcp` without a valid token gets `401` with a `WWW-Authenticate` header that points at them.
- Clients register by [Client ID Metadata Document](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/) (Claude, ChatGPT, VS Code) or by Dynamic Client Registration at `/oauth/register` (Cursor, MCP Inspector). All are public clients: no secrets, PKCE with S256 only, and redirect URIs that are HTTPS or on `localhost`. Registrations never approved are deleted after 7 days.
- XBase fetches a metadata document only while you are signed in, from public internet addresses only, without following redirects, within 5 seconds and 64 KB.
- The consent page can't be framed, its form only works from XBase itself and for the browser session that opened it, and each request can be answered once within 10 minutes. Every answer to an app carries `iss`.
- Tokens are random and stored as hashes. Access tokens last an hour; refresh tokens 60 days and change on every use. A code or refresh token used twice revokes the whole connection, since it means a copy leaked. Apps can revoke their own tokens at `/oauth/revoke`.
- `/mcp` accepts only tokens issued for it, refuses requests from web pages on other sites, and sends no CORS headers.
- Registration and the token endpoint are rate-limited per client (20 registrations an hour, 120 token requests a minute). Behind a reverse proxy, set `TRUST_PROXY_HOPS`, or every client shares those limits (see [behind a reverse proxy](#behind-a-reverse-proxy)).
- Server functions, the calls the web pages make, refuse request bodies over 8 MB before reading them.

If a client keeps asking you to sign in, check that the URL you pasted starts with `APP_URL` exactly, including `https`.
