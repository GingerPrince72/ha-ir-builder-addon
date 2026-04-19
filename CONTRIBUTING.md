# Contributing to IR Config Builder

## Current build model (honest version)

The original React/Express source tree does **not** live in this repository.
What you see committed are the pre-built artifacts:

- `index.cjs` — the bundled Express server (~1 MB)
- `public/` — the bundled React client (Vite output)

Edits today are typically made directly on the Home Assistant machine under
`/addons/ir-config-builder/` and pushed here. When you push, CI will run
against the committed artifacts. That's a deliberate, pragmatic choice — not
a bug.

## What you can safely change in this repo

- **Add-on metadata:** `config.yaml`, `build.yaml`, `repository.yaml`, `Dockerfile`, `run.sh`, `nginx.conf`
- **Docs:** `docs/**`, `CONTRIBUTING.md`, `README.md`
- **Remotes database:** `remotes-db/**` — this is pure data, no build step required
- **CI and scripts:** `.github/workflows/**`, `scripts/**`
- **Built assets:** `index.cjs`, `public/**` — but only when you've rebuilt
  them upstream; never hand-edit minified JS

## What CI checks on every push and PR

1. Every `*.json` file parses as valid JSON
2. `remotes-db/index.json` structure and every `remotes-db/remotes/**/*.json` schema
3. No remote is `verified: true` while any button has an empty `code`
4. `repository.yaml.url` matches this repo's actual owner/repo
5. `config.yaml` has the required keys and a valid semver version
6. On PR: if `config.yaml` changed, its `version` must be strictly greater
   than the base branch's version

Run the same checks locally before pushing:

```bash
node scripts/validate-remotes-db.mjs
node scripts/validate-addon-config.mjs
```

## Releasing

Bump the `version:` string in `config.yaml` and merge to `master`. A GitHub
Action will tag `vX.Y.Z` and create a release automatically. HA supervisor
picks up the new version on its next refresh.

## Adding a remote to the database

1. Place the image in `remotes-db/images/` (PNG with transparent background
   preferred, JPEG OK).
2. Create `remotes-db/remotes/{make}/{model-slug}.json` using the schema in
   `remotes-db/README.md`.
3. Add an entry to `remotes-db/index.json`.
4. Leave `verified: false` until every button has a captured `code`. When you
   flip to `verified: true`, populate `verified_by` with your GitHub handle.
5. Run `node scripts/validate-remotes-db.mjs` to confirm.

## Migration path back to source in this repo

If/when the React/Express source is recovered, drop it into:

```
client/        # React + Vite
server/        # Express + Drizzle + better-sqlite3
shared/        # Zod schemas shared between client and server
script/build.ts
```

Then add a `build` step to the `validate` workflow and update the Dockerfile
to run `npm run build` during image build. The validation checks and release
flow above stay untouched.
