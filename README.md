# 11eRC-FL Template Builder

<p align="center">
  <img src="public/logo.png" alt="11e Logi Template Builder logo" width="120">
</p>

[![Build & Deploy](https://github.com/NapoSky/11eLogiTemplateBuilder/actions/workflows/deploy.yml/badge.svg)](https://github.com/NapoSky/11eLogiTemplateBuilder/actions/workflows/deploy.yml)
[![Tests](https://github.com/NapoSky/11eLogiTemplateBuilder/actions/workflows/test.yml/badge.svg)](https://github.com/NapoSky/11eLogiTemplateBuilder/actions/workflows/test.yml)
[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](LICENSE)

A community tool for planning Foxhole logistics, made for the 11eRC-FL regiment.
Create stockpile checklists, prepare production orders and share plans on Discord.

**[Open the app](https://logitb.11e-foxhole.com/)** — no installation needed.

## What can I do with it?

| Tab | Use it to… |
| --- | --- |
| **Template** | Build a visual stockpile checklist with item icons and quantities. Save it for later or share it as a PNG. |
| **Production** | Write a regiment MPF todolist for Discord, or calculate materials and loading for your own Factory/MPF run. |
| **Stockpile** | Import a Seaport or Storage Depot CSV, compare it with a template and find what is missing. |
| **Facilities** | Choose production objectives, account for available materials and prepare a supply list and production stages. |

MPF means **Mass Production Factory**. The regiment todolist and your personal production calculator keep separate drafts.

## Make your first template

1. Open **Template** and double-click the empty work area to create a section.
2. Find an item in the sidebar and drag it into the section.
3. Click the placed icon to set its quantity. Add more items as needed.
4. Use **PNG** to share the image, or **Export JSON** to keep an editable copy. **Load** opens a saved template.

The **?** button in the app provides help in English and French.
For the other tabs, follow the [user guide](docs/usage.md).

## Keep and share your work

Drafts are saved in your current browser. They do not sync between devices, and clearing browser data removes them.

- **Template:** export JSON to edit it later; export a 1920 × 1080 PNG to share the image.
- **Production:** copy the MPF todolist to Discord or download it as `.txt`.
- **Facilities:** export the mission as JSON, or copy/download the Discord briefing. Facility profiles can also be shared separately.

## Run locally

For contributors: use **Node.js 24** and **pnpm** (the version is pinned in `package.json`).
From the project folder:

```sh
pnpm install
pnpm run dev
```

Open [localhost:5173](http://localhost:5173). See [development](docs/development.md) for tests, builds and deployment.

## Documentation and contributions

- [User guide](docs/usage.md) — steps for each tab, saving and shortcuts.
- [Calculations and saved-file compatibility](docs/calculations.md) — queue limits, loading, stock units and facility planning rules.
- [Game data and icons](docs/game-data.md) — wiki updates, generated files and asset maintenance.
- [Development](docs/development.md) — project layout, commands and CI.
- [Contributing](CONTRIBUTING.md) — add backgrounds, icons or other improvements.

Keep this README focused on getting started; document detailed behavior in the relevant guide above.

## Credits and license

Released under [CC BY-NC 4.0](LICENSE). Foxhole icons and artwork belong to **Siegecamp Inc.**
Wiki data comes from **Foxhole Wiki (CC BY-NC-SA 4.0)**.
This is a community project, unaffiliated with Siegecamp.
