# User guide

[Back to README](../README.md) · [Calculation rules](calculations.md)

The app has four tabs. Start with the one matching your task; each workspace keeps its own saved work.
Button names below match the English interface. The **?** help panel also offers French explanations.

## Template: create a stockpile checklist

1. Double-click the work area, or click **New Section**, to add a section.
2. Search or browse items in the sidebar. Use **All / Warden / Colonial** to filter by faction.
3. Drag an icon into a section. Drag placed icons to reorder them.
4. Click an icon to edit its quantity or subtype, such as a crate marker.
5. Drag a section header to move it, or a corner to resize it. Use **Size** (S through XXL) and **Background** to adjust the appearance.
6. Click **PNG** for a 1920 × 1080 image, or **Export JSON** for an editable file. **Load** reopens a JSON template.

Each grid cell holds one asset. Dropping a sidebar asset onto an occupied cell replaces its contents with the new asset's default quantity and no subtype. Moving an existing asset within the same section exchanges occupied cells; moving it between sections replaces the destination asset and retains the incoming quantity and subtype. Loading an older template with overlapping assets moves each duplicate to the next free cell, without changing its quantity or subtype. Existing distinct positions stay in place.

For Stockpile comparisons, ordinary depot item targets represent crates. Vehicle and structure targets represent units unless you select the **Crate** subtype. See [stockpile units](calculations.md#stockpile-units) for examples and older-file behavior.

## Production: regiment list or personal run

Open **Production**, then choose **MPF Todolist** or **Logi Calculator**.
Their items, quantities and faction choices are independent; editing one does not update the other.

### MPF Todolist

Use this workspace to prepare the regiment's orders for the Mass Production Factory (MPF).

1. Set the list title and faction. Enable **Auto-date** to add today's date to the title.
2. Drag or double-click sidebar items to add orders, then set each line's **× order count**.
3. Use **Text** to insert instructions or other free text. Discord Markdown is supported.
4. Check **Discord Preview**, then click **Copy** or download **.txt**.

**Load** imports an existing Discord todolist into this workspace. **Clear** empties the regiment list.

### Logi Calculator

Use this workspace to calculate a personal production run and the materials to bring.

1. Choose **Factory 1**, **Factory 2** or **MPF**. Each button opens its saved production.
2. Drag or double-click an item to add it, then edit **Crates** directly or use **− / +**.
3. Check material totals and **Loading → Check transport capacity**.
4. When visiting both factories, enable **Load both factories** to combine their input materials into one truck load.

Each Factory category shares a four-crate limit. Reduce an existing line to make room for another item.
MPF allows one item per category; choosing another replaces the current one.
See [production calculations](calculations.md#production-queues-and-loading) for crate ranges and transport capacities.

**Clear calculator** clears only the displayed production. Both factories and MPF retain independent drafts.
Loading calculates materials to bring into production; the Stockpile transport planner deals with finished goods.

## Stockpile: find shortages

Use a CSV exported from a **Seaport or Storage Depot**.

1. Open **Stockpile** and click **Load Stockpile CSV**. Paste successive exports with **Ctrl+V** in the import window, use **Paste from clipboard**, or add/drop several `.csv` / `.txt` files. The window stays open as the basket grows.
2. Choose a comparison template: **Current**, **Official (W)**, **Official (C)** or **Load file** for a JSON template.
3. Filter by **Missing / Partial / OK**, search for an item, or use **Sort by gap**.
4. Click **Generate Todolist** to prepare MPF orders for eligible missing items.

Before clicking **Import**, select the snapshots to apply and check **Backline / Main / Front** once per depot. Known depots keep their saved role. Only one depot can be **Main**; moving an existing Main to Backline requires explicitly checking the confirmation in the import window.

The basket keeps the latest dated snapshot for each stockpile. Identical loaded snapshots are not selected. Older versions, or different contents with the same recorded date as a loaded snapshot, require explicit selection to replace it. Separate stockpiles within the same depot remain separate and contribute to its total. Closing the import window or **Clear basket** leaves loaded stocks unchanged.

On Windows, focus the paste field and use **Win+V** to select previous copies one at a time (clipboard history must be enabled). The site only receives what you paste; it cannot browse Windows clipboard history. If clipboard access is refused, use the paste field instead.

**Transport planning** covers depot replenishment. Keep finished equipment and ammunition (including facility-made 120/150 mm), vehicles, Basic Materials, Refined Materials, Explosive Powder, Heavy Explosive Powder, Diesel and Petrol. Industrial materials/liquids and bulk resources such as Construction/Assembly Materials, Rare Metal/Alloys, oil, water, coal and salvage are outside this scope; plan their production and supply in **Facilities**. Imported snapshots and saved template targets are preserved.

The overview, Main readiness, depot totals and **Prepare transport** use this same scope. Template objectives remain visible even without stock. Supplies absent from the template appear only if some depot has positive stock; their target is **—**, while an explicit unlimited target remains **∞**. Unknown names with stock remain visible. If a template targets an excluded resource, the overview flags that objective as outside transport scope.

**Transport what's missing** retains the targets of facility-made finished goods. **Transport everything** also excludes industrial/bulk resources. The configurable exclusions apply within the transport scope; Refined Materials and Heavy Explosive Powder remain excluded from cargo by default and can be enabled explicitly.

In **Prepare transport**, all four modes use quantity-first cargo labels, such as `20 Bandages, 20 Blood Plasma and 20 12.7mm`. A shared note specifies quantities in crates, or units for assembled shippables. Train tasks retain the number of flatbed cars, for example `One train (3 flatbed cars) with …`.

Each task describes **one load**; its final `(xN)` repeats identical loads. Different loads, including the last incomplete vehicle, are listed separately. For example, 130 crates on flatbeds become `One flatbed with 60 Bandages (x2)` and `One flatbed with 10 Bandages`.

In **Container/Shippable** mode, shipping containers can mix item types up to 60 crates total. The slots and the 11eForge list use the same packing: 20 Bandages + 20 Blood Plasma + 20 ammunition crates produce one container task. Partial containers and crated/assembled shippables remain distinct tasks.

| Status | Meaning |
| --- | --- |
| OK | Stock meets or exceeds the target. |
| Partial | Some stock is available, but below target. |
| Missing | No stock is available for this item. |
| — | The item or its quantity could not be resolved. |

Hover or focus an item's icon/name for direct production recipes. Hover or focus quantities for the crate/unit breakdown; **Escape** dismisses the tooltip.
Full facility production chains are available in **Facilities**.

The CSV is saved in this browser and restored on reload. **Clear CSV** removes it.
Older templates offer **Use crate equivalents** to switch their comparison rules explicitly; see [compatibility](calculations.md#saved-files-and-browser-storage).

## Facilities: plan a mission

1. Name the task force and choose its faction.
2. Browse or search the illustrated catalogue, then click an objective and set its quantity. **Add objective** reopens the picker; adding the same item increases its quantity.
3. Open **Facility Settings** to name the reusable profile, set the delivery location and choose production recipes matching your buildings. **All materials** also shows core materials beyond the current mission.
4. Choose **Supply from outside** for an ingredient you will bring rather than produce. Raw resources and base vehicles are supplied by default; refinery recipes can be selected explicitly.
5. Open **Available Stock** to enter materials already allocated to the mission. These quantities are entered manually and are separate from Stockpile CSVs.
6. Use **Supplied by pipeline** for a liquid with a continuous external supply. Its finite stock input is disabled while checked, but its saved quantity is kept.
7. Review **Supplies to bring** and the production stages, then copy the **Discord Preview** or download **.txt**. Long briefings also offer numbered message copies.

**Facility Settings** and **Available Stock** open separately. Each has search and material filters; objectives are hidden from these ingredient lists.
Hidden rows keep their saved settings. Escape, Done or the backdrop closes the dialog.

Expand **Required facilities** below the profile to see compact rows grouped by building, with its base technology tier beside the name and its upgrades and illustrated products alongside. Buildings sort by **T1 → T2 → T3**, alphabetically within each tier; buildings with independent research requirements follow separately. Extra tier/research requirements appear beside the relevant upgrade: Small Assembly Station stays T1, with **Requires Dry Dock** beside Naval Works; Metalworks stays T2, with T3 beside Engineering Station. Rows follow the page's normal scroll and update with your recipes, allocated stock and pipeline supplies. Each setup appears once; it is not a building count. The panel starts collapsed and stays out of the Discord briefing. Check current building availability and item unlocks in game.

**Clear** in Facility Settings resets all recipe choices. **Clear** in Available Stock removes all allocated quantities, including hidden rows.
Both preserve objectives, profile details and pipeline connections. **Clear mission** preserves the reusable profile.

The global **Export JSON / Load** buttons share a mission together with its profile.
**Export profile / Import profile** in Facility Settings share only the settings.

The planner calculates materials and batches. Check the [facility calculation rules and limits](calculations.md#facility-planning) before using the plan to organize a mission.

## Saving and sharing

Drafts are stored in your current browser, with no automatic synchronization between devices.
Export files to keep a copy before clearing browser data or moving to another device.

| Workspace | Share or keep a copy |
| --- | --- |
| Template | JSON for editing; PNG for an image. |
| MPF Todolist | Discord text via Copy or `.txt`; Load imports that text. |
| Logi Calculator | Saved browser drafts for Factory 1, Factory 2 and MPF. |
| Facilities | Mission JSON including its profile; profile JSON for settings alone; Discord text via Copy or `.txt`. |

Discord exports are copied manually. They do not post messages or track participants' progress automatically.

## Keyboard shortcuts

Shortcuts apply when you are not typing in an input field. On macOS, use **Cmd** instead of **Ctrl**.

| Shortcut | Action |
| --- | --- |
| Ctrl + S | Export template JSON; in Facilities, export the mission. |
| Ctrl + O | Open template loading; in Facilities, load a mission. |
| Ctrl + E | Export the template canvas as PNG. |
| ? | Toggle help. |
| Escape | Close help, dialogs or active tooltips. |
