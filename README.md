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
- **Facilities**: Plan task force objectives, shared material requirements and production stages, with reusable facility profiles and Discord export
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

The **Production** tab has two independent workspaces: **MPF Todolist** keeps the regiment's MPF list and Discord preview; **Logi Calculator** opens **Factory 1 / Factory 2 / MPF** through three direct buttons. Loading uses the displayed production by default. **Load both factories** optionally combines both Factory drafts for a shared truck run, independently of MPF and the regiment shortage.

### Workflow

1. Switch to **📋 Production**, then choose **MPF Todolist** or **Logi Calculator**. The regiment list, Factory draft and MPF draft retain independent factions, items and quantities. Only MPF Todolist has a title field.
2. **MPF Todolist** always uses the MPF catalogue. **Logi Calculator → Factory 1 / Factory 2 / MPF** opens saved production directly, with no profile dropdown. Both factories retain independent assets, crate quantities and factions. **Loading** identifies the displayed building or **Both factories** when combined loading is enabled; **Clear calculator** clears the displayed production only. Existing factory profiles become Factory 1 and Factory 2. The MPF button reopens its last active saved draft; historical MPF profile data remains stored. Older single drafts migrate to the first slot with their recorded quantities and costs. Drag or double-click sidebar items to add an order. The Production sidebar groups items by their existing production categories, with **Resources** and **Structures** menu labels. Only eligible categories are shown; searching does not remove category buttons. This menu grouping leaves `categoryMapping.json`, icon categories, saved documents and Template/Stockpile unchanged.
3. **MPF Todolist** keeps its **× order count**. In **Logi Calculator**, each line instead has a directly editable **Crates** field with **− / +** buttons: Factory **1–4** (default **4**), MPF **3–9** (default **9**) or **3–5** for vehicles/shippables (default **5**). Each category contains one queue, with no order multiplier. Costs and loading update immediately. MPF discounts apply within that queue; splitting a five-crate order into separate orders of three and two is not valid.
4. **Factory** allows several assets within a category, sharing a maximum of **4 crates total**. The first asset defaults to 4 crates; reduce its quantity to make room. Additional assets use the remaining capacity; a full category refuses additions with an explanation and keeps its existing lines. Quantity controls respect the shared limit, and each category displays its **X / 4 crates** count. **MPF** retains one asset per category: choosing another replaces its current line. The MPF Todolist keeps its usual multiple-item ordering workflow. Valid mixed Factory queues survive reloads; overfull historical drafts keep their latest selections within the limit, with the original cache preserved under `productionRun_beforeFactoryCapacity`.
5. Filter with **All / Warden / Colonial** below the sidebar search, using the same buttons as Template. Template, MPF Todolist, Factory run and MPF run keep independent faction choices. In **MPF Todolist**, **+ Text** inserts free-text blocks (Discord Markdown supported).
6. In **Logi Calculator**, **Loading → Check transport capacity** shows a **standard truck** for either building (15 slots, loose stacks of 100 per material). **MPF only** also offers a **flatbed + shipping container** (60 material crates). Factory has no loading pad and only offers loose truck inputs. Truck totals show stacks/slots; container totals show material crates. Materials are summed before rounding each material into crates/stacks.

   **Load both factories** sums both saved Factory profiles before rounding materials into truck stacks. Plan up to **4 + 4 crates in the same category** across the two factories; editing still respects each factory's own four-crate queue. Category headers show the combined count, Loading lists each profile's output count, and the total and capacity warning turn orange above 15 truck slots. The advance-deposit advice uses the combined material excess and refers to the Factory inventories. This optional loading choice persists; older drafts default to the displayed profile alone. It changes neither profile's contents, MPF loading nor Clear's scope.
7. Loading plans input materials, separately from the Stockpile planner for shipping finished goods. Crate capacities come from the item catalogue, with current game values as offline fallbacks.
8. In **MPF Todolist**, click **📋 Copy** or **⬇️ .txt** in **Discord Preview** to export the regiment list. Historical Factory or partial lines remain readable/exportable at their recorded quantities and prices. **Load** imports into the regiment todo only; it is hidden in the personal run.

> The regiment list title auto-inserts the current date when **Auto-date** is enabled. **Clear calculator** clears only the displayed building's draft; **Clear** in MPF Todolist clears only the regiment list.

The existing `todolist` storage key remains the regiment list, with no automatic copy or reinterpretation. `productionRun` stores a version 3 envelope with two saved profiles per building, the selected profiles, MPF transport choices and the combined Factory loading preference. Older single drafts migrate into the first profile; older mixed drafts are split by each recorded recipe, retaining their prices, crates per order and identifiers. Reading an old cache does not overwrite it; the next run edit or building switch writes the new format. Historical saved todos retain their recorded values and full-order Discord format. Editing or clearing a run does not overwrite the other run or the cached regiment todo.

Older MPF drafts with several lines in one category keep the last selected line per category. Their original cache is retained once under `productionRun_beforeSingleQueue` before normalization; valid mixed Factory queues are retained. The regiment todo is unaffected.

Calculator drafts always store `orderCount: 1`: only the selected crate quantity affects the load. Old run multipliers are normalized to one order, with their previous cache retained once under `productionRun_beforeSingleOrder`. The regiment todolist's multipliers are unchanged.

---

## 🏭 Facilities

The fourth main tab plans facility missions independently of Template, Production and Stockpile. Recipes are loaded on first use from `public/facilitiesData.json`, generated offline from the complete accepted wiki catalogue. Assembly Materials I–V share the existing Assembly Materials icon with a visible grade badge; existing icon/category mappings are unchanged. Facilities prefer their declared artwork variants where available.

1. Name the task force, select its faction, then browse the illustrated catalogue using search and **All / Vehicles / Equipment / Materials / Structures** filters. Click an item to add it; the picker collapses and focuses its quantity. **+ Add objective** reopens the catalogue. Quantities are explicit units, litres or physical crates, as labelled. Adding the same item increases its quantity. These filters only affect the Facilities display.
2. **Facility Settings** opens its own compact dialog for the profile, delivery location and current mission's production methods; **All materials** includes the other core materials for profile preparation. Search narrows the list and **i** reveals recipe ingredients. Select recipes matching your available buildings/upgrades, or **Supply from outside** to stop expanding an ingredient's production chain. Raw resources and base vehicles are supplied by default. Refinery recipes can be selected explicitly. Before adding objectives, the dialog shows core materials.
3. **Available Stock** opens a separate dialog for quantities already allocated to this mission and liquid pipeline checkboxes. Neither dialog has tabs or links to switch to the other; each opens from its own main-page button and keeps its own title and Clear action. These are manually declared quantities, not synchronized facility inventory or Seaport CSV stock. The planner combines shared demands before subtracting allocated stock and rounding each selected recipe into whole batches. **Supplies to bring** separates **Raw resources to gather** (Coal, Salvage, Sulfur, Components), **Liquids to supply** and **Other supplies**, with the same groups in Discord. A craftable intermediate marked **Supply from outside** is labelled explicitly; **Produce here** switches it back to its default production recipe and recomputes the stages. Physical crate inputs have their own identities and cannot be satisfied by loose-item stock. The dialog has its own bounded scroll area and leaves the plan's page layout unchanged; Escape, Done or the backdrop closes it.
4. **Discord Preview** uses the MPF Todolist layout and rendered formatting, with a character counter, blue **📋 Copy** button and **⬇️ .txt** export. Copy and download preserve the original Markdown. The Discord briefing omits Inputs, Surplus and Requires lines; Coke remains included. The detailed plan and all calculations retain the full recipe information. Underlined headings and **🇦・ / 🇧・ / …** action points restart for each supply/production section. Sections with more than 26 points receive labelled continuations. Objectives and allocated stock are informational, not duplicate tasks. Long briefings retain the full Copy button and also provide numbered message copies. This is manual Discord text, with no 11eForge dependency or automatic progress tracking. **Save mission / Load mission** share the mission and its profile as JSON; **Export profile / Import profile** share settings alone.

Both dialogs combine search with **All / Raw Resources / Liquids / Materials / Assembly Materials / Parts & Assets** filters and item counts. Each dialog retains its own filter. Mission objectives are hidden in both lists, including with **All materials** enabled: recipe choices and allocated stock entries focus on their ingredients and components. Existing saved data is preserved when a row is hidden.

**Clear** in **Facility Settings** restores all default recipe choices, including filtered items. **Clear** in **Available stock** empties all allocated quantities, including hidden rows. Both buttons use the red destructive-action style, recalculate and save immediately, and keep objectives, profile details and pipeline connections.

Mission and profile persist under separate `facilitiesMission.v1` / `facilitiesProfile.v1` keys. **Clear mission** keeps the profile. Used defaults are saved with their complete recipe contents; a changed or missing saved recipe requires an explicit replacement and blocks briefing export. Cyclic recipes, missing references, incompatible factions and unsafe quantities also block export.

Liquid **Supplies to bring**, stages and Discord use cans. Production requirements round up to complete cans after allocated stock is deducted, then the planner recalculates whole recipe batches and their resource inputs. For example, **72 L Heavy Oil → 3 full cans (90 L), consuming 150 L Oil**. Stage inputs show cans to provide; outputs count only complete cans actually produced. Any smaller batch remainder stays visible in the litre tooltip and surplus, with byproducts still not credited. Hover or focus a liquid quantity for its exact volume and can capacity. Capacities verified on the wiki: Heavy/Enriched Oil 30 L, Oil/Petrol/Water 50 L, Diesel 100 L. Saved quantities and internal recipe math remain in litres.

**Use pipeline** is available on liquid supply rows, liquid production stages and in **Facility Settings**. **Available stock** also has a **Supplied by pipeline** checkbox on each liquid row, synchronized with these buttons. While checked, its finite stock input is disabled but its saved quantity is preserved; unchecking restores ordinary stock deduction. **Pipeline supplied** marks a continuous external supply: the liquid and its upstream production/gathering are removed from the mission, while unrelated requirements remain. The plan lists every declared connection under **Supplied by pipeline**, including upstream Oil when Heavy Oil is also piped. Discord groups these connections with stock under **Already allocated — do not gather again**, using simple lines such as `- Oil (Piped)`; it has no separate pipeline section. Connections with no direct consumption remain visible without inventing a quantity; their tooltip explains that status. Stage inputs identify piped liquids by name. The profile saves the selection without replacing its recipe choices, and switching it off restores the previous production/supply method. It assumes a connected source meeting demand; network throughput, upgrades, availability and power are not simulated. Oil on a connected field and Water from a Piped Water Pump are examples; no liquid is treated as continuously supplied by default. Older profiles without this optional setting retain their existing behavior.

Solid raw deliveries (Coal, Components, Salvage, Sulfur, Damaged Components, Aluminum, Iron and Copper) use **Resource Containers of 5,000 units**, rounded up to whole containers. For example, **12,500 Coal → 3 Resource Containers of Coal**, and **4,400 Sulfur → 1 Resource Container of Sulfur**. The plan shows these container totals directly. Only Discord tasks in **Raw resources to gather** factor the count as a suffix, for example `🇦・Bring 1 Resource Containers of Coal (x32)` for 32 containers. Other supply groups, stages and allocated-stock lines retain their existing format. Hover/focus in the plan retains the exact unit requirement. This delivery rounding is applied after stock deduction; recipe stages and saved quantities remain exact in units. **Rare Metal always remains in exact units** in the plan and Discord (for example, 3,200 stays 3,200), without container rounding. Intermediate resources and other transport packaging retain their previous display.

This is material planning: power generation fuel, maintenance, transport, production duration and participant/progress tracking are outside the calculation. Power is displayed per recipe, not summed as energy. Byproducts are displayed but are not deducted from other requirements, so the plan does not assume their reuse. The planner does not optimize recipes or verify that the configured buildings exist or are unlocked; the selected profile specifies that assumption.

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

The build generates `public/mpfData.json`, `public/iconMapping.json`, `public/itemData.json`, and the independent `public/facilitiesData.json` from the accepted [Foxhole Wiki](https://foxhole.wiki.gg) Cargo snapshot in `scripts/data/wiki.snapshot.json`. Normal builds are offline and reproducible. The old foxholelogi snapshot is no longer a build input; frozen historical names and MPF entries remain available for saved-document compatibility. Data provenance: Foxhole Wiki, CC BY-NC-SA 4.0.

The catalogue matches local game asset filenames to wiki entities. Images, categories, and saved positions remain local; corrected names and general faction metadata no longer depend on MPF eligibility. Saved image paths are migrated to the current game-pack layout when loading old documents. Unresolved images stay available and are listed in the comparison report. Stockpile hovers show direct recipes; the Facilities tab expands its own production chains using the complete catalogue. Run `pnpm run data:preview` to review image associations, exceptions and contextual variants.

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

The game supplies two legitimate icon variants for Heavy Oil, Enriched Oil, Rare Metal and Water. `iconVariants` declares the first images for logistics and their `Facilities/` counterparts for Facilities. The runtime metadata carries optional `iconUsage`; the logistics sidebar and Stockpile depot defaults prefer logistics artwork. Both files and catalogue entries remain available, and saved templates keep whichever variant they already reference.


### Stockpile units and compatibility

Stockpile is intended for **Seaport and Storage Depot exports**. Ordinary item stacks are stored there as crates: their quantity tooltips show crates only. Vehicles and shippable structures retain the physical crate/unit breakdown and the shortage in both units and crate equivalents. Historical imports retain their recorded quantities.

Hover or focus an item's icon/name in either Stockpile view to see its production recipes, in English and in the site's dark tooltip. Each option shows the building, its upgrade/category and the actual output quantity on the first line, with **Inputs:** underneath. Factory orders use four crates at the ordinary undiscounted price. Facility batches retain their own quantities and units; available Factory and facility options are shown together. Recipes include required base vehicles, crates, extra parts, power and byproducts. These are direct recipe costs; chain expansion belongs to the independent Facilities tab.

Template vehicle/structure targets use **units without the Crate subtype**, or **crates with it**. Ordinary depot item targets remain crates. CSV names ending in `(Crate)` count physical crates; bare names count unpacked units in the new calculation, including equipment and resources. Both stock forms contribute using the known crate contents, then stock, gaps, readiness and transport Fit follow each target's unit. Tables show numbers only, with units stated in section headers; crated vehicles/structures carry a `(Crate)` label to distinguish mixed targets. Displayed crate gaps round up in magnitude (−0.67 → −1, −2.33 → −3); exact quantities remain in tooltips and calculations. Hover or focus a quantity to see the physical crate/unit breakdown and the shortage in both units and equivalent crates in a dark themed tooltip; Escape dismisses it. For example, 5 Bardiche without the Crate subtype against 13 assembled vehicles gives a surplus of 8 units. A target of 10 explicitly crated Silverhands means 30 vehicles: 2 crates plus 15 assembled vehicles leave 9 vehicles missing, equivalent to 3 crates. Backline units are deducted before rounding the remaining production into whole crates and full MPF orders, including when the template requests individual vehicles.

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

**v3.0** - Made with ❤️ for the 11eRC-FL
