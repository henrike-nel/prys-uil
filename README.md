# prys-uil

![PrysUil](docs/brand/svg/prysuil-lockup.svg)

My uiltjie wat aanlyn pryse dophou en my op WhatsApp laat weet wanneer iets op my wenslys goedkoper word.

## Overview

PrysUil is a personal price watcher. Product links go into a wishlist, and a WhatsApp message arrives when one of them gets meaningfully cheaper.

It runs on free GitHub services only, with no server. The repo is the database:

- `apps/web` is a Svelte 5 SPA on GitHub Pages. It reads `data/` and commits changes to `data/products.json` through the GitHub API using the owner's token.
- `apps/scraper` runs in GitHub Actions (`check-prices`) on a schedule and whenever `data/products.json` changes. It fetches each shop page, writes `data/prices/<id>.json` and commits the result.
- Alerts go to WhatsApp through CallMeBot. Every alert is also logged on a GitHub Issue per product, which @mentions the owner when WhatsApp is not set up or fails.
- `packages/shared` holds the Zod schemas and the pure logic (price parsing, extraction, alert rules).

[`docs/SPEC.md`](docs/SPEC.md) is the full spec and the source of truth. [`CLAUDE.md`](CLAUDE.md) has the conventions for AI agents.

## One-time setup (owner)

1. Create the public repo `prys-uil` and push the scaffold.
2. Settings → Pages → Source: _GitHub Actions_. Do this before the `deploy-web` workflow runs for the first time, otherwise its `configure-pages` step fails. If it already failed, rerun it after changing the setting.
3. Get a CallMeBot key (message the bot from WhatsApp) and add both secrets under Settings → Secrets and variables → Actions: `CALLMEBOT_PHONE` (your number in international format, no `+`) and `CALLMEBOT_APIKEY`.
4. Create a fine-grained token for `prys-uil` with _Contents: read and write_, and paste it into the app's Settings dialog.
5. Add a product, then run `check-prices` manually to confirm a price appears.

### Sharing links from a phone

- Android: install the app from the browser (Add to Home screen) and it shows up in the share sheet.
- iOS: make a Shortcut that accepts URLs from the share sheet and opens `https://<owner>.github.io/prys-uil/?add=<url>`. URL-encode the shared link in the Shortcut first, otherwise a `&` in the product URL cuts the query string short.

## Local development

Needs Node 24 and pnpm (`corepack enable`).

```sh
pnpm install
pnpm test                        # Vitest across all packages
pnpm typecheck                   # tsc -b
pnpm lint                        # ESLint
pnpm format                      # Prettier (format:check to only check)
pnpm --filter @prysuil/web dev   # run the web app; it talks to the real repo (default henrike-nel/prys-uil),
                                 # so with a token pasted in, adding a product commits to data/products.json
pnpm --filter @prysuil/web check # svelte-check
```

To run the scraper once by hand:

```sh
GITHUB_REPOSITORY=<owner>/prys-uil GITHUB_TOKEN=... pnpm --filter @prysuil/scraper check
```

- It reads the env vars it gets in Actions: `GITHUB_TOKEN`, `GITHUB_REPOSITORY` (set automatically on Actions, set it by hand locally), and optionally `CALLMEBOT_PHONE` and `CALLMEBOT_APIKEY`.
- `GITHUB_TOKEN` needs _Issues: read and write_ on `prys-uil`. The web app's token (Contents only) isn't enough: issue calls then fail quietly and are only logged.
- This is a real run. It checks every product not marked bought, rewrites `data/prices/`, opens, comments on and closes real GitHub issues, and sends WhatsApp only if both CallMeBot vars are set. Products with `useBrowser` need Chromium: `pnpm --filter @prysuil/scraper exec playwright install chromium`.
- It then commits `data/prices/` and pushes the current branch. Run it from a clean checkout of `main`, because anything already staged gets committed and pushed with the prices.

CI (`.github/workflows/ci.yml`) runs lint, format check, typecheck, svelte-check, tests and the web build on every push and pull request.
