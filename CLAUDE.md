# CLAUDE.md

## Source of truth

[`docs/SPEC.md`](docs/SPEC.md) is the source of truth for this project. If this
file or any code disagrees with it, the spec wins — update the code (or raise
the conflict) rather than quietly diverging. Changes to product behaviour,
data model, or architecture should be reflected back into the spec.

## Repo layout

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
  docs/
    SPEC.md         source of truth (see above)
  .github/
    workflows/      ci.yml, check-prices.yml, deploy-web.yml
  CLAUDE.md         this file — conventions for AI agents
  pnpm-workspace.yaml
```

## Conventions for AI agents

- Svelte 5 runes only (`$state`, `$derived`, `$props`, `$effect`). No Svelte 4
  syntax: no `export let`, no `$:` statements, no stores for component state.
- No SvelteKit, no UI kits, no chart libraries. No new runtime dependency
  without a one-line justification.
- Business logic (parsing, extraction, alert rules, derived values) lives in
  `packages/shared` as pure, tested functions. Apps only do I/O.
- Every JSON read and write goes through the Zod schemas. Never hand-edit
  types that Zod can infer (`z.infer`).
- `data/products.json` is written only by `apps/web`; `data/prices/` only by
  `apps/scraper`.
- Never commit or log secrets, tokens, phone numbers or full CallMeBot URLs.
- Conventional commit messages (`feat:`, `fix:`, `chore:`, `test:`).

## Brand

Full brand reference: [`docs/brand/BRAND.md`](docs/brand/BRAND.md).

- Colour comes only from `docs/brand/tokens/colors.css` (imported globally in
  `apps/web`). No other hex values anywhere in the app.
- Colour roles: cream page background, white cards, brown text and icons,
  green header bar and "Below target" badge, yellow primary buttons, orange
  "Price dropped" badge. Text on any coloured surface is brown, never white.
