# AGENTS.md

Orientation for AI coding assistants (and humans) working in this project.
This file is auto-loaded by Claude Code, Cursor, and similar tools — keep it short
and true. For the full SDK reference (db, Bot API, fetch), see
[docs/tgcloud-sdk.md](docs/tgcloud-sdk.md).

## What this project is

A **Telegram Mini App bot** running on Telegram's serverless platform. You write
JavaScript modules (database schema, shared library code, update handlers); the
platform runs them in a V8 isolate. The `tgcloud` CLI syncs this local project
with the bot's cloud environment — think `wrangler`/`vercel` + `drizzle-kit`.

There is no server to run locally and no `node_modules` to import from at runtime:
the only things available inside a module are the platform SDK and other modules
in this project.

## Layout

Everything the platform runs lives in the **`tgcloud/`** folder. The rest of the
project root is yours (a mini-app front-end, config, docs).

| Path                  | What it is                                                        |
|-----------------------|-------------------------------------------------------------------|
| `tgcloud/schema.js`   | Database schema — tables as **named exports**. One file.          |
| `tgcloud/lib/`        | Shared modules. Subdirectories allowed (`lib/internal/util.js`).  |
| `tgcloud/handlers/`   | Update handlers, **one level only**. Names match Telegram Bot API update types (`message`, `callback_query`, …). |
| `tgcloud/endpoints/`  | Functions the Mini App calls (`POST /api/<name>`), **one level only**. |
| `tgcloud.jsonc`       | Project config. Its `"static"` block names the build folder hosted as the Mini App. |
| `docs/`               | Reference docs (this project's, for you). Not deployed.           |
| `.tgcloud/`           | CLI state (credentials, snapshot, cached layout). **Never edit or read from here** — it's gitignored machine state. |

Only `.js` files under `tgcloud/` (`schema.js`, `lib/`, `handlers/`, `endpoints/`) are deployed
as code, plus — when `tgcloud.jsonc` names one — the front-end's build folder as
the Mini App's static files. Everything else (Markdown, config, `.tgcloud/`, the
front-end's sources) is local-only. Module names are relative to `tgcloud/`: the
file `tgcloud/handlers/message.js` is the module `handlers/message`.

## Mini App front-end

If the project root holds a front-end (Vite, React, Vue, …), its **build output**
is deployed next to the bot and served as the Mini App at
`https://app<app_id>.tgcloud.ai/` — `push` prints the exact URL.

- `tgcloud.jsonc` → `{ "static": { "source": "dist" } }` — `source` names the
  build folder; the other keys of the `static` object are the serving config
  (e.g. `"spa": true` serves `index.html` for unknown extension-less paths —
  client-side routing; `immutable`, `headers`, `redirects`). `tgcloud init` writes
  the file when it recognizes the front-end; after that it's a normal project
  file. JSON with comments and trailing commas (a project may use a strict-JSON
  `tgcloud.json` instead — never both). `"static": "dist"` is accepted as a
  shorthand for `{ "source": "dist" }`.
  `"static": false` removes the deployed site on the next push.
- **Build before you push.** `push` uploads the folder as it is on disk; it never
  runs the build. `npm run deploy` (build + push) is the safe default.
- The front-end is ordinary browser code with npm packages — none of the
  `tgcloud/` module rules apply to it, and `tgcloud/` modules can't import it.
  It talks to the bot's code only through **endpoints** (below).
- The site is served from the host root, so the bundler's default `base` (`/`)
  is right. Don't add `X-Frame-Options` or a restrictive `frame-ancestors`:
  Telegram Web opens Mini Apps in an iframe.

## Endpoints — the Mini App's server side

`tgcloud/endpoints/<name>.js` is called by the Mini App as `POST /api/<name>` on
the same host as the static site. Use it for anything the front-end can't do
itself: the database, the Bot API, secrets.

- `export default async function (input, ctx)` — `input` is the JSON body (an
  object); the return value goes back as JSON.
- `ctx.initData` is the Mini App's init data **verified by the platform** (same
  shape as `Telegram.WebApp.initDataUnsafe`): `ctx.initData.user` is the caller.
  There is no `ctx.user`. Invalid init data → `401`, the endpoint never runs.
- Refuse with `throw new EndpointError('Out of stock', { code: 'OUT_OF_STOCK' })`
  (`import { EndpointError } from 'sdk'`) → `400`, the Mini App gets
  `description` + `parameters`. Any other exception → generic `500`; never
  rely on its message reaching the client.
- Front-end call: `Telegram.WebApp.Serverless.call('<name>', input, (err, result) => …)`
  from the official `telegram-web-app.js` — it sends the init data; `err` has
  `message` (description), `type` (`'ENDPOINT_ERROR'` for your `EndpointError`)
  and `parameters`. Don't hand-roll `fetch` + init data.
- Names: letters, digits, `_`, not starting with a digit (`getProfile`).
  Scaffold with `npx tgcloud add endpoints/<name>`; test with
  `npx tgcloud run endpoints/<name> '{}' --ctx '{ initData: { user: { id: 1 } } }'`.

## Module system — the rules that bite

- **Import project modules by relative path WITH the `.js` extension; import
  the SDK by name.** (from `tgcloud/handlers/message.js`:)
  - ✅ `import { users } from '../schema.js'`
  - ✅ `import { addItem } from '../lib/cart.js'`
  - ✅ `import { db, api, fetch } from 'sdk'` / `import { eq, sql } from 'sdk/db'`
  - ❌ `import { users } from '../schema'` → a relative import must end in `.js`
  - ❌ `import x from '../../src/x.js'` → nothing outside `tgcloud/` is reachable
  - A module's *name* is its path inside `tgcloud/` without `.js` (`lib/cart`);
    `tgcloud run` takes it, and `from 'lib/cart'` (no extension) also resolves —
    but write relative imports.
- **No filesystem, no npm packages** at runtime. Only `sdk` (and its submodules
  like `sdk/db`) and your own project modules exist.
- A handler module's `export default` is what the platform invokes, with the
  update's **payload** as the first argument — for `handlers/message` that's the
  `Message` (i.e. `update.message`), for `handlers/callback_query` the
  `CallbackQuery`, and so on. The full `Update` (with `update_id`) is on the
  second argument: `ctx.update`. An endpoint's `export default` gets
  `(input, ctx)` — see *Endpoints* above.

## Platform SDK (`import … from 'sdk'`)

- **`db`** — the database (query builder + schema DSL). Full API: [docs/tgcloud-sdk.md](docs/tgcloud-sdk.md).
- **`api`** — the Telegram Bot API. `api.<method>({...})` (e.g. `api.sendMessage`,
  `api.getMe`) returns the **unwrapped** result and **throws `BotApiError`** on
  failure (`import { BotApiError } from 'sdk'`; it has `.code`/`.description`/`.parameters`).
- **`fetch`** — outbound HTTP, web-`fetch`-like (`res.status/ok`, `res.json()`,
  `res.text()`, streaming via `for await`, redirects followed).
- **`EndpointError`** — the one way an endpoint refuses a call (see *Endpoints*).

## Database — the rules that bite

Full API in [docs/tgcloud-sdk.md](docs/tgcloud-sdk.md). The non-obvious parts:

- **Every DB call is async — always `await`.** `.all()`, `.get()`, `.values()`,
  `.run()`, `db.$count()` and the raw `db.run/all/get` all return Promises.
- **No foreign keys.** `.references()` and `foreignKey()` **throw at declaration**
  — the runtime runs with FKs off, so they'd be silently inert. Enforce integrity
  in application code (delete children before parents, etc.).
- **Drops happen only via `.deprecated('reason')`** on a column/table/index.
  Deleting the declaration does *not* drop anything.
- **Type changes aren't automatic** — do them by hand with `db.run(...)`.

## Deploy & migrate workflow

**Deploying never touches the database.** Schema sync is a separate, explicit step.

The CLI is a local dev-dependency, so run it with `npx tgcloud <command>` (or use
the `npm run` scripts in package.json — e.g. `npm run deploy`):

```
npx tgcloud status     # what changed locally vs the cloud
npx tgcloud push       # deploy modules (and the static build) to the cloud
npx tgcloud migrate    # apply tgcloud/schema.js changes to the database (interactive)
npx tgcloud run <module> [args]   # execute a handler or endpoint server-side
npx tgcloud pull       # bring the local project in line with the cloud
npx tgcloud login      # link this project to a bot
npx tgcloud webhook    # show the bot's webhook and whether it matches your handlers
```

After you change `tgcloud/schema.js`, `push` reports what the DB *would* change but applies
nothing — run `npx tgcloud migrate` to actually apply it.

The platform manages the bot's webhook for you, derived from your deployed
`handlers/*`, and refreshes it on `push`. If it ever drifts — e.g. someone called
`setWebhook` with the raw bot token — `npx tgcloud webhook` shows the mismatch and
`npx tgcloud webhook sync` repairs it.

## Project Git, Test & Auto-Deploy Workflow

After every task/change in this repository (`kicker-picker`), the assistant MUST automatically, without waiting for an extra prompt:

- **Zero-bugs-to-prod gate (STRICT)**: NEVER commit, push, or deploy if ANY check (`lint`, `typecheck`, `test`, `build`, or `test:e2e`) fails. Fix all failures and re-run verification until 100% green before committing or pushing.

1. Run full local verification:
   ```
   npm run lint && npm run typecheck && npm test && npm run build
   ```
   Whenever UI or runtime files (`src/`, `tgcloud/`, `e2e/`, `index.html`) changed, you MUST ALSO run Playwright E2E tests and confirm they pass 100%:
   ```
   npm run test:e2e
   ```
2. Run `unslop-ui` check on changed UI files (`src/`, `index.html`) in **full-list (`--surface`, U1–U20 + unslop), warning-only mode**:
   - Follow [.agents/skills/unslop-ui/SKILL.md](.agents/skills/unslop-ui/SKILL.md) and run `python3 .agents/skills/unslop-ui/scripts/count_tells.py --surface <changed_ui_files>` (the Git `pre-commit` hook in `.githooks/pre-commit` also runs this automatically on every commit).
   - Never block a commit on `unslop-ui` warnings; report any found tells (including reading-only rules U3, U4, U5, U7, U8, U14) to the user as warnings.
3. Stage, commit, and push to GitHub (`origin/main`):
   - **Commit messages MUST be strictly in Russian** (Conventional Commits prefix like `feat:`, `fix:`, `chore:`, `docs:` is allowed, description and body in Russian: what changed, why, and verification results).
   - Never force-push or amend published commits; always create a new commit and run `git push origin main`.
4. Deploy to `tgcloud` when runtime files (`src/`, `tgcloud/`, `support-bot/`) changed:
   - Pushing to `origin/main` automatically triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (using `TGCLOUD_B64` and `SUPPORT_TGCLOUD_B64` GitHub Secrets) to build and deploy both the main bot/Mini App and `support-bot`.
   - After `git push origin main`, check the GitHub Actions deploy run status with `gh run list --workflow=deploy.yml --limit 3` and `gh run watch` (or `gh run view --log-failed` if it fails) to confirm prod deployment succeeded.
   - If running locally with `.tgcloud/` credentials instead of CI, run `npx tgcloud push` (and `npx tgcloud migrate --yes` if `tgcloud/schema.js` changed).
