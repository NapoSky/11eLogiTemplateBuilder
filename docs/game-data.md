# Game data and icons

[Back to README](../README.md) · [Contributing](../CONTRIBUTING.md) · [Calculation compatibility](calculations.md#saved-files-and-browser-storage)

## Sources and generated files

Normal builds are offline and reproducible. They generate runtime files from the accepted Foxhole Wiki Cargo snapshot; running a build does not fetch the wiki.

| File | Role |
| --- | --- |
| `scripts/data/wiki.snapshot.json` | Accepted wiki snapshot. |
| `scripts/data/iconMapping.legacy.json` | Local asset registry and original labels; retain existing keys and historical values. |
| `scripts/data/wiki.compatibility.json` | Reviewed aliases, image exceptions, generic/retired artwork annotations and contextual icon variants. |
| `scripts/data/mpf.legacy.json` | Frozen historical Stockpile production behavior for compatibility. |
| `public/categoryMapping.json` | Manually maintained UI categories. |
| `public/mpfData.json` | Generated MPF catalogue. |
| `public/iconMapping.json` | Generated display names. |
| `public/itemData.json` | Generated item metadata and direct recipes. |
| `public/facilitiesData.json` | Independent facility catalogue, loaded on first use. |

Edit the source files above rather than generated public JSON files. The old `scripts/foxhole.snapshot.json` foxholelogi snapshot is no longer a build input.
Data provenance: **Foxhole Wiki, CC BY-NC-SA 4.0**.

The catalogue matches local asset filenames to wiki entities. Images, categories and saved positions stay local.
Names and general faction metadata do not depend on MPF eligibility. Unresolved images remain available and appear in the comparison report.

## Review or update data

```sh
# Regenerate runtime files from the accepted snapshot, without network access
pnpm run build:mpf

# Review associations, old/new labels, exceptions and variants in data/wiki-preview/
pnpm run data:preview

# Check the public wiki without replacing the accepted snapshot
node --experimental-strip-types scripts/syncWikiData.ts --check

# Accept validated wiki changes locally, then regenerate runtime data
pnpm run data:sync
pnpm run build:mpf
```

Review the diff and comparison report, then run the tests and build described in [Development](development.md#checks-and-build).

## Icon pack layout

Game assets live under `public/assets/icons/Textures/` and `public/assets/icons/Slate/`, preserving the supplied pack's folders and filenames.
Overlay new packs onto these folders. `public/NEW` is only an import staging location; `public/assets/icons/subtypes/` is independent.

Retain these three local mortar compositions under `Textures/UI/ItemIcons/`; they are absent from the supplied pack:

- `MortarAmmoIconFlare.png`
- `MortarAmmoIconShrapnel.png`
- `MortarAmmoIconFire.png`

They distinguish shell variants. Replacing them with a common shell filename merges distinct objects.
Incendiary shells remain outside MPF eligibility in the accepted wiki data.

### Image variants and reviewed exceptions

`iconVariants` declares logistics and Facilities artwork for Heavy Oil, Enriched Oil, Rare Metal and Water.
Runtime metadata carries optional `iconUsage`: logistics sidebars and Stockpile prefer logistics artwork; Facilities prefer their declared variants.
Both files/catalogue entries remain available, and saved templates retain their chosen image.

The compatibility file also records these reviewed cases:

- Alternative Heavy Oil / Enriched Oil images and the deployed Underground Fortress map to their Cargo entities.
- The shared Assembly Materials image is generic, without an inferred grade or recipe. Facilities add visible I–V grade badges; older documents retain their historical IV comparison.
- The old Metal Beam Pallet is legacy artwork and has no current Rare Materials identity.
- `FacilityMaterials12Icon.png` supplies the current Rare Materials image. Harpy, Tümmler by VAC, Overseer Sky-Hauler and the Paratrooper subtype are also available.

`data:preview` distinguishes unmatched/ambiguous assets from deliberately generic or retired graphics.

### Older image paths

The [path adapter](../src/services/iconPaths.ts) recognizes previous `UI/` and `Vehicles/` layouts and four reviewed aircraft filename changes.
Templates, Stockpile templates and saved todolists migrate image references while preserving instance IDs, quantities, overlays, calculation mode and recorded production values.
The bomber's duplicate `_copy` entry is consolidated. Current filenames identify Poseidon and Mergo-4 "Myrmidon" through Cargo.

## Automatic wiki updates

The [Wiki data update workflow](../.github/workflows/wiki-data.yml) runs daily or manually.
It validates schemas, pagination and row counts, retries rate limits within bounds and preserves the accepted snapshot on failure.
Collection dates, Cargo row IDs and row order alone do not trigger changes.

When data changes, it runs tests and a production build, generates a comparison artifact, then creates or updates one data PR.
After merge, the normal CI/deployment flow publishes the result. Missing MPF references or new MPF outputs without local assets stop the update for review.

GitHub must allow Actions to create pull requests. Depending on repository/token settings, workflows for a bot-created PR can require approval.
A successful download does not establish that every wiki entry reflects the latest game patch.
