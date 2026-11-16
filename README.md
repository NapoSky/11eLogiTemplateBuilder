# 11eRC-FL Template Builder

<p align="center">
  <img src="public/logo.png" alt="11e Logi Template Builder logo" width="120">
</p>

[![Build & Deploy](https://github.com/NapoSky/11eLogiTemplateBuilder/actions/workflows/deploy.yml/badge.svg)](https://github.com/NapoSky/11eLogiTemplateBuilder/actions/workflows/deploy.yml)
[![Tests](https://github.com/NapoSky/11eLogiTemplateBuilder/actions/workflows/test.yml/badge.svg)](https://github.com/NapoSky/11eLogiTemplateBuilder/actions/workflows/test.yml)
[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)

A stockpile template generator for the game Foxhole, designed for the 11eRC-FL regiment.

## 🎯 Features

- **Modern UI**: TypeScript application with Tailwind CSS
- **Drag & drop**: Easily organise icons into sections
- **Smart grid**: Precise CSS grid icon placement
- **Automatic categorisation**: Icons sorted by type (Weapons, Ammunition, Uniforms, etc.)
- **Adjustable size**: Change the global icon size (S/M/L)
- **Quantity management**: Click to edit the quantity of each item
- **PNG export**: High-quality 1920×1080 image ready to use
- **JSON save**: Save and reload your templates
- **Production**: Independent regiment todolist with Discord export and personal Factory/MPF run with loading calculations
- **Stockpile comparison**: Compare a Foxhole CSV export against a template to spot gaps
- **Keyboard shortcuts**: Quick navigation with Ctrl+S, Ctrl+O, Ctrl+E
- **Help menu**: `?` button to view all shortcuts

## 🚀 Usage

### Quick start

```bash
# Install dependencies
pnpm install

# Start the development server
pnpm run dev

# Production build
pnpm run build
```

### Workflow

1. **Double-click** the canvas to create a new section
2. **Search** or browse icons in the left sidebar
3. **Drag & drop** icons into a section
4. **Reorder** icons by dragging them within the grid
5. **Click** an icon to edit its quantity
6. **Export** as PNG or save as JSON

## 📋 Production

The **Production** tab has two independent workspaces: **MPF Todolist** keeps the regiment's MPF list and Discord preview; **Logi Calculator** has separate personal **Factory** and **MPF** drafts. Loading uses only the displayed building's draft, never the regiment shortage or the other building's contents.

### Workflow

1. Switch to **📋 Production**, then choose **MPF Todolist** or **Logi Calculator**. The regiment list, Factory draft and MPF draft retain independent factions, items and quantities. Only MPF Todolist has a title field.
2. **MPF Todolist** always uses the MPF catalogue. **Logi Calculator → Building → Factory / MPF** switches between separate saved drafts. Drag or double-click sidebar items to add an order. The Production sidebar groups items by their existing production categories, with **Resources** and **Structures** menu labels. Only eligible categories are shown; searching does not remove category buttons. This menu grouping leaves `categoryMapping.json`, icon categories, saved documents and Template/Stockpile unchanged.
3. **MPF Todolist** keeps its **× order count**. In **Logi Calculator**, each line instead has a directly editable **Crates** field with **− / +** buttons: Factory **1–4** (default **4**), MPF **3–9** (default **9**) or **3–5** for vehicles/shippables (default **5**). Each category contains one queue, with no order multiplier. Costs and loading update immediately. MPF discounts apply within that queue; splitting a five-crate order into separate orders of three and two is not valid.
4. A **Logi Calculator** has one line per production category (one queue). Choosing another item in that category replaces its current line. Other categories and the other building's draft are retained. The MPF Todolist keeps its usual multiple-item ordering workflow.
5. Filter with **All / Warden / Colonial** below the sidebar search, using the same buttons as Template. Template, MPF Todolist, Factory run and MPF run keep independent faction choices. In **MPF Todolist**, **+ Text** inserts free-text blocks (Discord Markdown supported).
6. In **Logi Calculator**, **Loading → Check transport capacity** shows a **standard truck** for either building (15 slots, loose stacks of 100 per material). **MPF only** also offers a **flatbed + shipping container** (60 material crates). Factory has no loading pad and only offers loose truck inputs. Truck totals show stacks/slots; container totals show material crates. Materials are summed before rounding each material into crates/stacks.
7. Loading plans input materials, separately from the Stockpile planner for shipping finished goods. Crate capacities come from the item catalogue, with current game values as offline fallbacks.
8. In **MPF Todolist**, click **📋 Copy** or **⬇️ .txt** in **Discord Preview** to export the regiment list. Historical Factory or partial lines remain readable/exportable at their recorded quantities and prices. **Load** imports into the regiment todo only; it is hidden in the personal run.

> The regiment list title auto-inserts the current date when **Auto-date** is enabled. **Clear calculator** clears only the displayed building's draft; **Clear** in MPF Todolist clears only the regiment list.

The existing `todolist` storage key remains the regiment list, with no automatic copy or reinterpretation. `productionRun` stores a version 2 envelope with separate `factory`/`mpf` drafts, the selected building and the MPF transport choice. Older mixed drafts are split by each recorded recipe, retaining their prices, crates per order and identifiers. Reading an old cache does not overwrite it; the next run edit or building switch writes the new format. Historical saved todos retain their recorded values and full-order Discord format. Editing or clearing a run does not overwrite the other run or the cached regiment todo.

Older production drafts with several lines in one category keep the last selected line per category. Their original cache is retained once under `productionRun_beforeSingleQueue` before normalization; the regiment todo is unaffected.

Calculator drafts always store `orderCount: 1`: only the selected crate quantity affects the load. Old run multipliers are normalized to one order, with their previous cache retained once under `productionRun_beforeSingleOrder`. The regiment todolist's multipliers are unchanged.

---

## 📦 Stockpile

The **Stockpile** mode compares a Foxhole stockpile CSV export against a template to surface shortages.

### Workflow

1. Switch to **📦 Stockpile** mode in the toolbar
2. Click **Load Stockpile CSV** (or drag & drop a `.csv` file) to import a Foxhole export
3. Choose a **Template** source in the toolbar:
   - **Current** — use the template open in the editor
   - **Official** — use the bundled reference template
   - **Load file** — load any `.json` template file
4. Use the **filters** (Missing / Partial / OK), **Sort by gap**, and **Search** to focus on shortages
5. Click **Generate Todolist** to produce a Discord-ready MPF order list from the missing items

### Status indicators

| Status | Meaning |
|--------|---------|
| ✓ OK | Stockpile meets or exceeds target quantity |
| ⚠ Partial | Some stock exists but below target |
| ✗ Missing | No stock found for this item |
| — | Item not found in icon mapping |

> The CSV is persisted in `localStorage` and restored on reload. Use **Clear CSV** to reset.

---

## ⌨️ Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + S` | Save template (JSON) |
| `Ctrl + O` | Load template |
| `Ctrl + E` | Export as PNG |
| `?` | Show/hide help |
| `Escape` | Close modals |

## 🖱️ Mouse actions

- **Double-click** the canvas → Create a new section
- **Drag** an icon from the sidebar → Add to a section
- **Drag** an icon in the grid → Reorder
- **Click** a placed icon → Edit quantity/subtype
- **Drag** a section header → Move the section
- **Drag** a section corner → Resize

## 📐 Icon size

Use the **S** / **M** / **L** buttons in the toolbar to adjust the global icon size:
- **S** (Small): Compact icons for more content
- **M** (Medium): Default balanced size  
- **L** (Large): Larger, more visible icons

## 📁 Project structure

```
11eTemplateBuilder/
├── src/
│   ├── main.ts              # Entry point
│   ├── store.ts             # Global state (sections, icons)
│   ├── types.ts             # TypeScript types
│   ├── styles.css           # Tailwind styles
│   └── components/
│       ├── Toolbar.ts       # Toolbar + shortcuts
│       ├── Sidebar.ts       # Icon list
│       ├── Canvas.ts        # Work area
│       ├── Section.ts       # Section component
│       └── ...
├── assets/
│   ├── backgrounds/         # Template backgrounds (PNG)
│   ├── emojis/              # Icons for Todolists
│   └── icons/               # Foxhole icons (PNG)
├── data/
│   ├── iconMapping.json     # Icon display names
│   └── categoryMapping.json # Icon categorisation
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 💾 Export formats

| Format | Use |
|--------|-----|
| **PNG** | 1920×1080 image for Discord/forum sharing |


## 🛠️ Tech stack

- **TypeScript**: Static typing
- **pnpm**: Fast, disk-efficient package manager
- **Vite**: Fast build and HMR
- **Tailwind CSS v4**: Utility-first styles
- **interact.js**: Section drag & resize
- **html2canvas-pro**: PNG export (oklab/oklch support)

## Game data

The build generates `public/mpfData.json`, `public/iconMapping.json`, and `public/itemData.json` from the accepted [Foxhole Wiki](https://foxhole.wiki.gg) Cargo snapshot in `scripts/data/wiki.snapshot.json`. Normal builds are offline and reproducible. The old foxholelogi snapshot is no longer a build input; frozen historical names and MPF entries remain available for saved-document compatibility. Data provenance: Foxhole Wiki, CC BY-NC-SA 4.0.

The catalogue matches local game asset filenames to wiki entities. Images, categories, and saved positions remain local; corrected names and general faction metadata no longer depend on MPF eligibility. Saved image paths are migrated to the current game-pack layout when loading old documents. Unresolved images stay available and are listed in the comparison report. Direct production recipes are available on Stockpile hover; the dedicated facilities planner and production-chain calculations will follow in a second phase. Run `pnpm run data:preview` to review image associations, exceptions and contextual variants.

```sh
# Regenerate runtime data from the accepted snapshot (no network)
pnpm run build:mpf

# Review asset associations and old/new labels under data/wiki-preview/
pnpm run data:preview

# Check the public wiki without replacing the accepted snapshot
node --experimental-strip-types scripts/syncWikiData.ts --check

# Accept validated source changes locally, then regenerate runtime data
pnpm run data:sync
pnpm run build:mpf
```

`scripts/data/iconMapping.legacy.json` is the asset registry and original-label record; retain existing keys and historical values when adding assets. Reviewed same-object aliases, image exceptions, generic/retired artwork annotations and contextual `iconVariants` belong in `scripts/data/wiki.compatibility.json`. `scripts/data/mpf.legacy.json` preserves historical Stockpile production behavior. Edit these source files rather than the generated public JSON files.

### Icon pack layout

Game assets live under `public/assets/icons/Textures/` and `public/assets/icons/Slate/`, preserving the supplied pack's folders and filenames. `public/assets/icons/subtypes/` is independent and unchanged. New packs can be overlaid directly onto these two folders; `public/NEW` is only an import staging location.

Three local mortar compositions are absent from the supplied pack and must be retained under `Textures/UI/ItemIcons/`: `MortarAmmoIconFlare.png`, `MortarAmmoIconShrapnel.png`, and `MortarAmmoIconFire.png`. They distinguish the shell variants while keeping the existing filename-based application contract. Incendiary shells remain outside MPF eligibility, as declared by the wiki. Replacing the three entries with the common shell filename would merge distinct objects.

The [path adapter](src/services/iconPaths.ts) recognizes the previous `UI/` and `Vehicles/` layouts and four reviewed aircraft filename changes. Templates, Stockpile templates and saved TodoLists migrate their image references; instance IDs, quantities, overlays, calculation mode and recorded production values are preserved. The bomber's duplicate `_copy` entry is consolidated. The new filenames also identify the Colonial carrier as **Poseidon** and the bomber as **Mergo-4 "Myrmidon"** directly through Cargo.

Visually reviewed exceptions associate the alternative Heavy Oil / Enriched Oil images and the deployed Underground Fortress with their Cargo entities. The common Assembly Materials image is labelled generically, with no inferred grade or recipe; old documents retain their historical IV comparison. The old Metal Beam Pallet is labelled as legacy and receives no current Rare Materials identity. The current Rare Materials image (`FacilityMaterials12Icon.png`) is now declared from the locally supplied file, alongside Harpy, Tümmler by VAC and Overseer Sky-Hauler; the Paratrooper subtype is also available. `data:preview` distinguishes unmatched/ambiguous assets from these deliberately generic or retired graphics.

The game supplies two legitimate icon variants for Heavy Oil, Enriched Oil, Rare Metal and Water. `iconVariants` declares the first images for logistics and their `Facilities/` counterparts for the future facilities module. The runtime metadata carries optional `iconUsage`; the current logistics sidebar and Stockpile depot defaults prefer logistics artwork. Both files and catalogue entries remain available, and saved templates keep whichever variant they already reference.


### Stockpile units and compatibility

Stockpile is intended for **Seaport and Storage Depot exports**. Ordinary item stacks are stored there as crates: their quantity tooltips show crates only. Vehicles and shippable structures retain the physical crate/unit breakdown and the shortage in both units and crate equivalents. Historical imports retain their recorded quantities.

Hover or focus an item's icon/name in either Stockpile view to see its production recipes, in English and in the site's dark tooltip. Each option shows the building, its upgrade/category and the actual output quantity on the first line, with **Inputs:** underneath. Factory orders use four crates at the ordinary undiscounted price. Facility batches retain their own quantities and units; available Factory and facility options are shown together. Recipes include required base vehicles, crates, extra parts, power and byproducts. These are direct recipe costs; chain expansion remains for the dedicated facilities planner.

Template targets are crates. CSV names ending in `(Crate)` count physical crates; bare names count unpacked units in the new calculation, including equipment and resources. Stock is converted to units using the known crate contents before comparing targets. Tables show numbers only, with the crate unit stated in the header. Displayed gaps round up in magnitude to whole crates (−0.67 → −1, −2.33 → −3); exact quantities remain in tooltips and calculations. Hover or focus a quantity to see the physical crate/unit breakdown and the shortage in both units and equivalent crates in a dark themed tooltip; Escape dismisses it. For example, a target of 10 Silverhand crates means 30 vehicles: 2 crates plus 15 assembled vehicles leave 9 vehicles missing, equivalent to 3 crates. Backline units are deducted before rounding the remaining production into whole crates and full MPF orders.

New and bundled templates use the optional `quantityMode: "crate-equivalents-v1"` field. Files without it retain the previous calculation, historical labels, and MPF parameters. **Use crate equivalents** in Stockpile explicitly converts the selected template's calculation; it preserves icon paths, identifiers and target numbers. Saved TodoLists retain their recorded values. Historical Discord names are still recognized when importing text.

Transport planning keeps physical packaging and its capacities. Unpacked equipment contributes to stock targets and is listed in depot totals; its transport must be planned separately, as the planner supports crates and shippable vehicles/equipment. Unknown crate contents are reported as unresolved rather than guessed.

### Automatic updates

The `Wiki data update` workflow runs daily or manually. It validates schemas, pagination and row counts, retries rate limits within bounds, and preserves the accepted snapshot on failure. Collection dates, Cargo row IDs and row order do not trigger a change. When data changes, it runs tests and a production build before updating one data PR; after merge, the existing CI/deployment flow publishes the result. The deployment checks out the commit validated by CI.

GitHub must allow Actions to create pull requests. Depending on repository/token settings, workflows for a bot-created PR can require approval; the update workflow itself validates the proposed data before creating it. Disappearing MPF references or new MPF outputs without local assets stop the automated update for review. A successful download alone does not establish that every wiki entry reflects the latest game patch.

## 🌐 Compatibility

- ✅ Chrome 90+
- ✅ Firefox 90+
- ✅ Safari 15+
- ✅ Edge 90+

## 🎮 About Foxhole

Foxhole is an MMO war game developed by Siegecamp Inc. This template builder is a community tool created to help manage regiment logistics.

## 📜 License

This project is released under **CC BY-NC 4.0** (Creative Commons Attribution - NonCommercial).

> ⚠️ **Important note**: Foxhole icons and graphical assets are the property of **Siegecamp Inc.** and are used solely for non-commercial community purposes.

See the [LICENSE](LICENSE) file for details.

---

**v2.3** - Made with ❤️ for the 11eRC-FL
