# Development

[Back to README](../README.md) · [Contributing](../CONTRIBUTING.md) · [Game data](game-data.md)

## Local setup

Use **Node.js 24**, matching CI, and the **pnpm** version pinned in `package.json`.
From the project folder:

```sh
pnpm install
pnpm run dev
```

Open [localhost:5173](http://localhost:5173). The Vite development server listens on all interfaces to support WSL2.

## Checks and build

| Command | Purpose |
| --- | --- |
| `pnpm exec tsc --noEmit` | Check TypeScript types. |
| `pnpm test` | Run the Jest tests. |
| `pnpm run test:watch` | Re-run tests while editing. |
| `pnpm run test:coverage` | Generate a local coverage report. |
| `pnpm run test:ci` | Run tests with coverage and JUnit output for CI. |
| `pnpm run build` | Generate game data, check/compile TypeScript and build the static site into `dist/`. |
| `pnpm run preview` | Serve the existing production build locally. |

Use `pnpm install --frozen-lockfile` when reproducing CI.
Data generation uses the accepted local snapshot; [wiki update commands](game-data.md#review-or-update-data) are separate.

## Project layout

```text
src/
  main.ts, App.ts       Entry point and workspace mounting
  store.ts             Template, Production and shared application state
  types.ts             Shared data types
  styles.css           Styles
  components/          Toolbar, canvas, sidebar and workspace views
  services/            Calculations, catalogues, parsers, exports and storage
  __tests__/           Tests and fixtures
public/
  assets/backgrounds/  Background images and manifest
  assets/icons/        Game pack and subtype images
  assets/emojis/       Todolist emojis
  categoryMapping.json UI categories
  *Data.json           Generated game catalogues
scripts/
  data/                Accepted snapshot and compatibility sources
  buildMpfData.ts       Runtime data generation
  buildWikiCatalog.ts  Offline comparison reports
  syncWikiData.ts      Wiki collection and validation
docs/                  User and maintenance guides
```

The frontend uses TypeScript, Vite and Tailwind CSS v4. interact.js handles section dragging/resizing, SortableJS handles item ordering, and html2canvas-pro generates PNG exports.
There is no application backend; drafts use browser storage. See [saved-file compatibility](calculations.md#saved-files-and-browser-storage) before changing document formats.

## CI and deployment

[Tests CI](../.github/workflows/test.yml) runs on pushes and PRs targeting `main` or `develop`.
It checks types, runs tests with coverage and builds the site. Coverage, JUnit results and build output are uploaded as artifacts.

[Deploy to GitHub Pages](../.github/workflows/deploy.yml) runs automatically after successful Tests CI on `main`, checking out the commit validated by that run.
It can also be started manually; that path builds the selected commit without the preceding Tests CI gate.
The deployment publishes `dist/`. The custom domain is declared in [`public/CNAME`](../public/CNAME).

[Wiki data update](../.github/workflows/wiki-data.yml) maintains a separate data PR; see [automatic updates](game-data.md#automatic-wiki-updates).

For contributions, follow [CONTRIBUTING.md](../CONTRIBUTING.md). Keep the README as a short introduction; put usage details and technical rules in the relevant `docs/` guide.
