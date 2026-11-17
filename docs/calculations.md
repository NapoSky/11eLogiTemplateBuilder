# Calculations and saved-file compatibility

[Back to README](../README.md) · [User guide](usage.md) · [Game data](game-data.md)

## Production queues and loading

The regiment **MPF Todolist** counts complete orders using **× order count**.
The **Logi Calculator** instead edits the crate quantity of one queue per category.

| Calculator | Crate range | Default | Items per category |
| --- | --- | --- | --- |
| Factory | 1–4 total | 4 for the first item | Several items sharing the four-crate limit. |
| MPF, ordinary items | 3–9 | 9 | One item; selecting another replaces it. |
| MPF, vehicles/shippables | 3–5 | 5 | One item; selecting another replaces it. |

Additional Factory items use the remaining category capacity. A full category refuses additions and keeps its existing lines.
MPF discounts apply within a queue: a five-crate order cannot be split into separate three- and two-crate orders.

Loading sums input materials before rounding each material into stacks or crates.
Catalogue crate capacities are used where available, with offline fallback values.

| Transport | Capacity | Available for |
| --- | --- | --- |
| Standard truck | 15 slots; loose material stacks of 100 | Factory and MPF |
| Flatbed + shipping container | 60 material crates | MPF only |

Factory inputs use loose materials because the Factory has no loading pad.
Truck totals show stacks/slots; container totals show material crates.

**Load both factories** combines both saved Factory drafts before rounding. Each Factory still has its own four-crate limit per category, allowing 4 + 4 across the two.
Loading lists each factory's output count; combined category headers show the shared total.
Totals and capacity warnings turn orange above 15 truck slots, and advance-deposit advice uses the combined excess.
This preference is saved and does not affect MPF loading or the scope of **Clear calculator**.

## Stockpile units

Stockpile comparisons are designed for **Seaport and Storage Depot exports**.
New and bundled templates use the `crate-equivalents-v1` calculation mode:

- Ordinary depot item targets represent crates.
- Vehicle and structure targets represent individual units unless they have the **Crate** subtype.
- CSV names ending in `(Crate)` count physical crates; bare names count unpacked units, including equipment and resources.
- Both forms contribute to a target using known crate contents. Unknown crate contents remain unresolved.

For example, a target of **5 Bardiche without the Crate subtype** against **13 assembled vehicles** gives a surplus of **8 units**.
A target of **10 crated Silverhands** means **30 vehicles**: **2 crates + 15 assembled vehicles** leave **9 vehicles missing**, equivalent to **3 crates**.

Stock, shortages, readiness and transport Fit follow the target's unit. Tables put units in section headers and add `(Crate)` to crated vehicles/structures.
Displayed crate gaps round up in magnitude: −0.67 becomes −1 and −2.33 becomes −3. Exact values remain available in tooltips and calculations.
Backline units are deducted before rounding remaining production into whole crates and full MPF orders.

Transport retains physical packaging and its capacities. Unpacked equipment contributes to stock totals but its transport must be planned separately; the planner supports crates and shippable vehicles/equipment.

Item tooltips show direct recipes in English: building, category/upgrade, output and inputs, including required base vehicles, physical crates, extra parts, power and byproducts.
Factory recipes show four crates at the ordinary undiscounted price. Facility recipes retain their own batch quantities and units; their full chains are expanded only in Facilities.

## Facility planning

Objective quantities follow the recipe output: equipment and ammunition produced in crates are entered in crates; vehicles, structures and loose materials are entered in units (liquids in litres). There is no packaging selector.
For example, **50 crates of Clancy-Raca M4** require **50 crates of No.2 Loughcaster**, plus **2,500 Cmat and 2,000 Pcmat**. A **50 Callahan** objective means 50 individual vehicles.
Production stages and Discord briefings keep the same output unit. A recipe producing 10 crates per batch still rounds up to complete batches.

The planner combines shared ingredient demands, subtracts allocated stock, then rounds the selected recipes to whole batches.
Physical crate inputs have separate identities and cannot be satisfied by loose-item stock.
A craftable ingredient marked **Supply from outside** stops that production chain; **Produce here** restores its default production recipe.

### Delivery quantities

Liquid requirements are calculated in litres but displayed as cans, with exact volumes in hover/focus tooltips.
After allocated stock is deducted, requirements round up to full cans and the planner recalculates whole recipe batches and their inputs.
For example, **72 L Heavy Oil → 3 cans (90 L), consuming 150 L Oil**.

| Liquid | Can capacity |
| --- | --- |
| Heavy Oil / Enriched Oil | 30 L |
| Oil / Petrol / Water | 50 L |
| Diesel | 100 L |

Stage inputs show cans to provide. Outputs count only complete cans produced; smaller remainders stay visible in litre tooltips and surplus.

Coal, Components, Salvage, Sulfur, Damaged Components, Aluminum, Iron and Copper deliveries round up to **Resource Containers of 5,000 units** after stock deduction.
For example, **12,500 Coal → 3 containers**, and **4,400 Sulfur → 1 container**. Recipe math and saved quantities remain exact.
**Rare Metal stays in exact units**, without container rounding.

### Pipelines

**Use pipeline** and **Supplied by pipeline** declare continuous external liquid supplies.
The planner removes the liquid's production/gathering chain while retaining unrelated requirements and the saved recipe choice.
Turning it off restores the previous production/supply method.

The plan lists every declared connection, including upstream liquids with no remaining direct consumption, without inventing quantities.
Discord groups these with allocated stock under **Already allocated — do not gather again**, using lines such as `- Oil (Piped)`.
No liquid is piped by default. The planner assumes the connected source meets demand; it does not simulate throughput, upgrades, availability or power.

### Discord briefing and limits

The briefing groups raw resources, liquids, other supplies and production stages. Objectives and allocated stock provide context rather than duplicate tasks.
It omits detailed Inputs, Surplus and Requires lines while keeping Coke. Full recipe details remain in the plan.
Action letters restart for each section; sections over 26 points receive labelled continuations.
Only raw-resource gathering tasks factor container counts into a suffix, for example `Bring 1 Resource Containers of Coal (x32)`.
Copy and download preserve the original Markdown; numbered message copies are available for long briefings.

The plan excludes power generation fuel, maintenance, transport, production duration and participant/progress tracking.
Power is shown per recipe rather than summed as energy. Byproducts are displayed but never credited against other requirements.
Recipes are not optimized, and the planner does not verify that buildings exist or are unlocked.

Changed or missing saved recipes require an explicit replacement before briefing export.
Cyclic recipes, missing references, incompatible factions and unsafe quantities also block export.

## Saved files and browser storage

These details are for maintenance or troubleshooting. Use the app's exports to share documents.

### Templates and Stockpile

New and bundled templates declare `quantityMode: "crate-equivalents-v1"`.
Files without it keep historical calculations, labels and MPF parameters.
**Use crate equivalents** explicitly converts the selected template while preserving icon paths, identifiers and target numbers.
Historical imports keep recorded quantities; saved todolists keep recorded prices and full-order Discord formatting. Historical Discord item names are still recognized.
Old image paths migrate through the [path adapter](../src/services/iconPaths.ts).

### Production

`todolist` remains the regiment list; it is not automatically copied into the calculator.
`productionRun` stores a version 3 envelope with two profiles per building, selected profiles, MPF transport choices and combined Factory loading preference.
The interface exposes Factory 1, Factory 2 and the last active MPF draft; historical MPF profile data stays stored.

Older single drafts migrate to the first profile. Older mixed drafts split by recorded recipe while retaining prices, crates per order and identifiers.
Reading an old cache does not overwrite it; the next run edit or building switch writes the new format.
Old drafts default to loading the displayed profile alone.

Normalization preserves the original cache once under the relevant backup key:

| Key | Migration |
| --- | --- |
| `productionRun_beforeSingleQueue` | Retain the last selected MPF item per category. |
| `productionRun_beforeSingleOrder` | Set calculator `orderCount` to 1; crate quantities determine the load. |
| `productionRun_beforeFactoryCapacity` | Keep the latest Factory selections within the shared four-crate limit. |

Valid mixed Factory queues survive reloads. These calculator migrations do not change the regiment todolist or its order multipliers.
Historical Factory or partial todolist lines remain readable/exportable with their recorded quantities and prices.

### Facilities

Mission and profile use separate `facilitiesMission.v1` and `facilitiesProfile.v1` keys.
Historical equipment objectives keep their loose-item identities and unit quantities when loaded or imported. New objectives use the recipe's crate identity where applicable.
Used default recipes are saved with their complete contents. Saved liquid amounts remain in litres and solid amounts in exact units.
Profiles without pipeline settings retain their previous behavior.
