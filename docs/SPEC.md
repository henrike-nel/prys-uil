# PrysUil – Spec

Oct 26, 2026 · @Henrike

## Overview

PrysUil is a personal price tracker: paste product links into a wishlist-style web app, and get a WhatsApp alert when a price drops. It runs entirely on free GitHub services in one public repo, with no server and no paid accounts.

**Goals**

- Track multiple products across multiple shops from one list.
- Alert only on meaningful drops: below a per-item target price, or a minimum percentage drop.
- Cost R0 to run: GitHub Pages, GitHub Actions and a free WhatsApp gateway.
- Lightest implementation that works: minimal dependencies, no framework beyond Svelte.

**Non-goals (v1)**

- Multiple users, sharing lists, or logins beyond the owner's GitHub token.
- Real-time alerts. A check every few hours is enough.
- Price comparison across shops for the same product.
- Adding products via WhatsApp or other chat apps.
- Native mobile apps. The web app is an installable PWA instead.

## Architecture

&#91;embedded content: PrysUil architecture · 2 apps, 2 data files, 2 alert channels\]

The web app writes only `products.json`; the scraper reads it, fetches each shop page, writes only `prices/`, and sends alerts. Adding a product pushes a commit, which triggers a check within minutes; otherwise the scraper runs every 4 hours. There is no server: GitHub Pages serves the app, GitHub Actions runs the scraper, and the repo is the database.

## Tech stack and repo layout

TypeScript everywhere, in a pnpm workspace monorepo. The repo is public and named `prys-uil`.

| Part | Choice |
| --- | --- |
| Front end | Vite + Svelte 5 (runes) + TypeScript, no SvelteKit; plain CSS; `vite-plugin-pwa` |
| Scraper | Node 24 LTS, TypeScript run directly with `tsx`; Cheerio; Playwright as opt-in fallback |
| Shared | Zod schemas and pure helpers (price parsing, alert rules) |
| GitHub API | `@octokit/rest` in the web app and the scraper |
| Charts | Hand-rolled SVG sparkline component (no chart library) |
| Lint and format | ESLint (`typescript-eslint`, `eslint-plugin-svelte`) + Prettier (`prettier-plugin-svelte`) |
| Tests | Vitest; `svelte-check` for Svelte types |
| Hosting | GitHub Pages at `https://<user>.github.io/prys-uil/` |

```
prys-uil/
  apps/
    web/            Svelte 5 SPA (GitHub Pages)
    scraper/        price checker run by GitHub Actions
  packages/
    shared/         Zod schemas, types, pure helpers
  data/
    products.json   written by the web app only
    prices/         <productId>.json, written by the scraper only
  .github/
    workflows/      ci.yml, check-prices.yml, deploy-web.yml
  CLAUDE.md         conventions for AI agents
  pnpm-workspace.yaml
```

Dependencies stay minimal: every new runtime dependency needs a one-line justification in the PR description.

## Data model

Two kinds of JSON file, each with a single writer, so the web app and the scraper never edit the same file. All files are validated with the Zod schemas in `packages/shared` on every read and write; invalid data fails loudly.

**`data/products.json`** (written by the web app only)

```ts
const Product = z.object({
  id: z.string(),                 // nanoid, stable, used in file names
  url: z.string().url(),
  name: z.string().min(1).optional(), // user override; else scraped title
  shop: z.string(),               // hostname, e.g. takealot.com
  forWhom: z.string().optional(), // e.g. "Dad"
  targetPrice: z.number().positive().optional(), // alert when price <= this
  minDropPercent: z.number().min(0).max(100).default(5),
  selector: z.string().optional(),   // CSS selector override for stubborn sites
  useBrowser: z.boolean().default(false), // Playwright fallback
  bought: z.boolean().default(false),
  addedAt: z.string().datetime(),
});

const ProductsFile = z.object({
  version: z.literal(1),
  currency: z.literal("ZAR"),
  products: z.array(Product),
});
```

**`data/prices/<productId>.json`** (written by the scraper only)

```ts
const PricePoint = z.object({
  at: z.string().datetime(),
  price: z.number().positive(),
  inStock: z.boolean().optional(),
});

const PriceFile = z.object({
  productId: z.string(),
  title: z.string().optional(),      // scraped product title
  imageUrl: z.string().url().optional(), // scraped product image
  history: z.array(PricePoint),     // appended only when the price changes
  lastCheckedAt: z.string().datetime(),
  lastError: z.string().optional(), // set when extraction fails, cleared on success
  consecutiveFailures: z.number().int().default(0),
  lastAlertedPrice: z.number().optional(),
  issueNumber: z.number().int().optional(), // GitHub Issue for this product
});
```

Derived values (current price, lowest seen, change since added) are computed in `packages/shared`, never stored.

Currency is ZAR only in v1. A price from a page in another currency is recorded as an extraction error rather than converted.

## Web app (`apps/web`)

A single-page Svelte 5 app with one main screen, a few dialogs, and no router. It reads `data/` from the repo and writes only `data/products.json`.

**Screens**

1. **List** (home). One card per product: image, display name, shop, current price, target price, lowest seen, change since added, and a price-history sparkline. Each card shows a status badge: *Checking…* (no price yet), *Below target*, *Price dropped*, *Can't read price* (`lastError` set) or *Bought*. Filters: for whom (all / each name), and hide bought (on by default). Sort: biggest drop first, then name.
2. **Add product dialog.** Fields: URL (required), for whom, target price (R), minimum drop % (default 5). On save the product is committed with no name; the card shows *Checking…* until the scraper fills in the title, image and first price.
3. **Edit product dialog.** All fields from Add, plus name override, CSS selector, "use browser" toggle, mark as bought, and delete (with confirm).
4. **Settings dialog.** Paste a GitHub fine-grained token, test it, clear it. Shows the repo the app is bound to.

**Display rules**

- Display name = `product.name` ?? `priceFile.title` ?? shop hostname.
- Prices are formatted as ZAR with `Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' })`.
- Duplicate URLs (after normalising: strip tracking params such as `utm_*`, trailing slash, `#fragment`) are rejected with an inline error.

**Reading data**

- With a token: read through the GitHub Contents API (Octokit), which is fresh and authenticated.
- Without a token: read from `raw.githubusercontent.com` (read-only view; may lag up to \~5 minutes from caching).
- Load `products.json` and all price files in parallel; show cards progressively.

**Writing data**

- Every change is one commit to `data/products.json` via the Contents API, with message `chore(data): add|edit|delete <display name>`.
- Always send the file's `sha` from the last read. On `409` or `422` (file changed): re-fetch, re-apply the same change to the fresh copy, retry once, then show "Couldn't save. Reload and try again."
- Validate with `ProductsFile.parse` before sending; never write invalid data.

**Token handling**

- A fine-grained personal access token scoped to the `prys-uil` repo only, with *Contents: read and write* permission. No other permissions.
- Stored in `localStorage` under `prysuil.token`, only on the owner's devices; never sent anywhere except `api.github.com`.
- Without a token, the app is read-only and hides add and edit controls.

**PWA**

- `vite-plugin-pwa` with a manifest (name *PrysUil*, owl icon, `display: standalone`) and offline caching of the app shell only, not data.
- `share_target` (GET, params `url` and `text`): opens the Add dialog with the first URL found in either field. Works on Android; iOS users add via a Shortcut that opens `…/prys-uil/?add=<url>`, which the app handles the same way.

**Config**

- `vite.config.ts` sets `base: '/prys-uil/'`.
- Repo owner and name come from `VITE_REPO_OWNER` and `VITE_REPO_NAME`, set in the deploy workflow.

## Scraper (`apps/scraper`)

A Node script run by GitHub Actions. Each run checks every product not marked bought, updates its price file, sends alerts, and commits all changes in one commit.

**Run steps**

1. Load and validate `data/products.json` and every file in `data/prices/`.
2. Delete price files whose product no longer exists (it is the only writer of `data/prices/`).
3. For each active product (concurrency 3, at least 2 s between requests to the same host): fetch, extract, update the price file.
4. Evaluate alert rules and send notifications (see Notifications).
5. Commit `data/prices/` as `chore(prices): check <n> products (<m> changed)` and push. Retry the push once after `git pull --rebase` if it is rejected.

**Fetching**

- Plain `fetch` with a realistic desktop `User-Agent`, `Accept-Language: en-ZA,en`, a 20 s timeout, and one retry on network errors or 5xx.
- When `useBrowser` is true: load the page in Playwright Chromium, wait for network idle, then run the same extraction on the rendered HTML. Playwright is installed in the workflow only when at least one product needs it.

**Price extraction** (first match wins; implemented as pure functions in `packages/shared` so they can be tested on saved HTML)

1. `selector` override on the product, if set.
2. JSON-LD: any `<script type="application/ld+json">` containing a schema.org `Product` (including inside `@graph` or arrays). Use `offers.price`, or `offers.lowPrice` for `AggregateOffer`; read `priceCurrency` and `availability`.
3. Meta tags: `product:price:amount` / `og:price:amount` with their currency tags.
4. Microdata: `[itemprop=price]` (`content` attribute first, then text).

Title comes from JSON-LD `name`, else `og:title`, else `<title>`. Image comes from JSON-LD `image`, else `og:image`. Both are stored in the price file and refreshed on every successful check.

**Price parsing** handles ZAR formats such as `R 1 299,00`, `R1,299.00`, `1299` and `R1 299` (including non-breaking spaces). A currency other than ZAR, a missing price or a non-positive number is an extraction error.

**Price file updates**

- Success: append a `PricePoint` only when the price or stock status differs from the last point; set `title`, `imageUrl` and `lastCheckedAt`; clear `lastError`; reset `consecutiveFailures`.
- Failure: keep history untouched; set `lastError` to a short reason (for example `HTTP 403`, `no price found`, `currency USD`); increment `consecutiveFailures`; set `lastCheckedAt`.

**Alert rule** (pure function `shouldAlert` in `packages/shared`)

Let `reference = lastAlertedPrice ?? first price in history`. Alert when the new price is lower than the previous recorded price **and** either:

- `targetPrice` is set and the new price is at or below it, or
- the drop from `reference` is at least `minDropPercent`.

After an alert, set `lastAlertedPrice` to the new price, so the same price never alerts twice. The first price ever recorded never alerts.

## Notifications

WhatsApp is the main channel; GitHub Issues keep a record of every alert and become the alert itself when WhatsApp fails. Each channel is an adapter behind one interface, so channels can be added later (for example Telegram or ntfy) by adding an adapter and its secrets.

```ts
interface Alert {
  kind: "price-drop" | "cant-read-price";
  product: Product;
  priceFile: PriceFile;
  oldPrice?: number;
  newPrice?: number;
}

interface Notifier {
  name: string;
  enabled(): boolean;                 // true when its secrets are set
  send(alerts: Alert[]): Promise<void>; // throws on failure
}
```

**WhatsApp (CallMeBot)**

- Enabled when secrets `CALLMEBOT_PHONE` (international format, no `+`) and `CALLMEBOT_APIKEY` are set.
- One HTTPS GET per message to `https://api.callmebot.com/whatsapp.php` with `phone`, `apikey` and URL-encoded `text`. Never log the full URL.
- One message per alert when a run has up to 3 alerts; a single summary message when it has more, to stay well within CallMeBot's limits.
- A non-2xx response, a timeout, or an error in the response body counts as a failure.

Example message:

```
PrysUil: Sony WH-1000XM5 dropped to R5 499 (was R6 999, -21%). Target R5 800.
https://www.takealot.com/...
```

**GitHub Issues (always on)**

- Uses the workflow's `GITHUB_TOKEN` (`issues: write`); no extra setup.
- One issue per product, created on its first alert and stored as `issueNumber` in the price file. Title: `Price drop: <display name>`. Body: image, current and previous price, change, target, lowest seen, tracking since, shop link. Label: `price-drop`.
- Every later alert adds a comment to that issue.
- The comment or issue body @mentions the repo owner **only when the WhatsApp send failed or WhatsApp is not configured**, so you aren't notified twice. The record is written either way.
- When a product is marked bought or deleted, the scraper closes its issue with a final comment.
- The *for whom* value is never put in issues or labels.

**Can't read price**

- When `consecutiveFailures` reaches 3, send one `cant-read-price` alert (WhatsApp, and a comment or issue labelled `scrape-error`) naming the product and `lastError`, with a hint to set a CSS selector or enable "use browser".
- No further failure alerts for that product until it succeeds again.

**Failure handling**

A notifier failure never fails the whole run or blocks the commit. Price files are committed regardless, and `lastAlertedPrice` is only updated when at least one channel delivered the alert.

## Workflows, configuration and secrets

Three GitHub Actions workflows, each with the minimum permissions it needs.

| Workflow | Triggers | Does | Permissions |
| --- | --- | --- | --- |
| `ci.yml` | Push and pull request | `pnpm install --frozen-lockfile`, ESLint, `prettier --check`, `tsc -b`, `svelte-check`, Vitest, web build | `contents: read` |
| `check-prices.yml` | Cron `17 */4 * * *` (every 4 h, off the hour); push to `main` touching `data/products.json`; manual `workflow_dispatch` | Runs the scraper, sends alerts, commits `data/prices/` | `contents: write`, `issues: write` |
| `deploy-web.yml` | Push to `main` touching `apps/web/**` or `packages/shared/**`; manual | Builds `apps/web`, deploys to GitHub Pages | `pages: write`, `id-token: write`, `contents: read` |

**Workflow rules**

- `check-prices.yml` uses `concurrency: { group: prices, cancel-in-progress: false }` so runs never overlap, and `timeout-minutes: 15`.
- The web app commits with the owner's token, so adding a product triggers a check within minutes. The scraper commits with `GITHUB_TOKEN`, which does not trigger workflows, so there are no loops.
- Data changes never redeploy the site; the app reads `data/` at runtime.
- Scheduled runs commit every time (`lastCheckedAt` changes), which keeps the repo active so GitHub doesn't disable the schedule after 60 days.
- Node 24 via `actions/setup-node` with pnpm cache; Playwright Chromium installed only when a product has `useBrowser: true`.

**Secrets (repo settings → Actions secrets)**

| Secret | Used by | Value |
| --- | --- | --- |
| `CALLMEBOT_PHONE` | `check-prices.yml` | Owner's WhatsApp number, international format without `+` (for example `27…`) |
| `CALLMEBOT_APIKEY` | `check-prices.yml` | Key returned by CallMeBot after the opt-in message |

The web app's GitHub token is not a repo secret; it lives only in the owner's browser. Nothing sensitive is committed: no phone numbers, keys or tokens in the repo, logs or issues.

**One-time setup (owner)**

1. Create the public repo `prys-uil` and push the scaffold.
2. Settings → Pages → Source: *GitHub Actions*.
3. Get a CallMeBot key (message the bot from WhatsApp) and add both secrets.
4. Create a fine-grained token for `prys-uil` with *Contents: read and write*, and paste it into the app's Settings dialog.
5. Add a product, then run `check-prices` manually to confirm a price appears.

## Testing, acceptance criteria and agent conventions

**Testing**

- Unit tests (Vitest) for everything in `packages/shared`: schemas, URL normalisation, ZAR price parsing, each extraction strategy, `shouldAlert`, and derived values.
- Extraction tests run against saved HTML fixtures in `packages/shared/test/fixtures/<shop>.html`, one per shop the owner tracks. Adding a shop means adding a fixture.
- Scraper tests mock `fetch` and the notifiers: a drop sends one alert, an unchanged price sends none, the same price never alerts twice, a WhatsApp failure triggers the @mention, and three failures send one `cant-read-price` alert.
- Web app: tests for the GitHub data module (sha conflict retry, validation before write). No end-to-end browser tests in v1.

**Acceptance criteria**

- [ ] Pasting a product URL in the app adds it to `data/products.json` in one commit, and the card shows *Checking…*.
- [ ] Within one `check-prices` run, the card shows the product's title, image and current price.
- [ ] A price drop that meets the alert rule sends one WhatsApp message and records it on the product's GitHub Issue.
- [ ] With WhatsApp secrets removed, the same drop @mentions the owner on the issue instead.
- [ ] Marking a product bought stops checks and closes its issue on the next run.
- [ ] A site that blocks the scraper shows *Can't read price* on the card and sends exactly one alert after 3 failed runs.
- [ ] Editing from two devices at once never loses an edit.
- [ ] The app installs as a PWA on Android and accepts shared links.
- [ ] CI passes: lint, format, type-check, `svelte-check`, tests and build.
- [ ] Running costs are R0.

**Conventions for AI agents (copy into `CLAUDE.md`)**

- Svelte 5 runes only (`$state`, `$derived`, `$props`, `$effect`). No Svelte 4 syntax: no `export let`, no `$:` statements, no stores for component state.
- No SvelteKit, no UI kits, no chart libraries. No new runtime dependency without a one-line justification.
- Business logic (parsing, extraction, alert rules, derived values) lives in `packages/shared` as pure, tested functions. Apps only do I/O.
- Every JSON read and write goes through the Zod schemas. Never hand-edit types that Zod can infer (`z.infer`).
- `data/products.json` is written only by `apps/web`; `data/prices/` only by `apps/scraper`.
- Never commit or log secrets, tokens, phone numbers or full CallMeBot URLs.
- Conventional commit messages (`feat:`, `fix:`, `chore:`, `test:`).

**Suggested build order**

1. `packages/shared`: schemas, parsing, extraction, `shouldAlert`, with tests.
2. `apps/scraper` with both notifiers, plus `check-prices.yml`.
3. `apps/web`: list, add, edit, settings.
4. PWA, share target, and `deploy-web.yml`.
5. `ci.yml`, README with the one-time setup.

**Open questions**

- *For whom* names are stored in `data/products.json`, which is public. Use nicknames, or drop the field?
- Which shops will you track first? Each needs a saved HTML fixture to confirm extraction works.
