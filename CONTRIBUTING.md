# Contributing to 11eRC-FL Template Builder

Thank you for your interest in the project! This guide explains how to propose changes via a Pull Request.

## Table of contents

- [Prerequisites](#prerequisites)
- [Fork & local setup](#fork--local-setup)
- [What you can contribute](#what-you-can-contribute)
  - [Template backgrounds](#-template-backgrounds)
  - [Item icons](#-item-icons)
  - [Item names and categories](#-item-names-and-categories)
- [Opening a Pull Request](#opening-a-pull-request)
- [License and rights](#license-and-rights)

---

## Prerequisites

- A [GitHub](https://github.com) account
- Node.js ≥ 24 and npm
- Basic Git knowledge (fork, branch, commit, push)

---

## Fork & local setup

```bash
# 1. Fork the repository via the GitHub interface (top-right "Fork" button)

# 2. Clone your fork
git clone https://github.com/<your-username>/11eLogiTemplateBuilder.git
cd 11eLogiTemplateBuilder

# 3. Install dependencies
npm install

# 4. Start the development server
npm run dev
# The app is available at http://localhost:5173

# 5. Create a dedicated branch for your contribution
git checkout -b feat/my-addition
```

---

## What you can contribute

### 🖼️ Template backgrounds

Template backgrounds are located in **`public/assets/backgrounds/`** and declared in **`public/assets/backgrounds/manifest.json`**.

#### Technical specifications

| Property | Expected value |
|----------|---------------|
| Format | PNG (preferred) or JPG |
| Resolution | **1920 × 1080 px** required |
| File size | < 2 MB recommended |
| Theme | Related to Foxhole (map, regiment map, interface, etc.) |

#### Steps

1. Add your image to `public/assets/backgrounds/` (e.g. `my_background.png`)
2. Declare it in `manifest.json`:

```json
{
  "presets": [
    { "name": "Default Foxhole", "path": "/assets/backgrounds/template_default.png" },
    { "name": "My Background",   "path": "/assets/backgrounds/my_background.png" }
  ]
}
```

3. Start the app (`npm run dev`) and verify the preset appears correctly in the **Background → Preset** modal.
4. Commit your image **and** the updated `manifest.json`.

---

### 🔫 Item icons

Icons are extracted directly from Foxhole game files and organised according to the **official modding structure**.

#### Expected structure

```
public/assets/icons/
├── UI/
│   ├── ItemIcons/           # Craftable items (weapons, ammo, resources…)
│   │   ├── Uniforms/        # Personal equipment and uniforms
│   │   └── Facilities/      # Items related to production buildings
│   ├── StructureIcons/      # Defensive structures
│   ├── VehicleIcons/        # Vehicle icons (interface symbols)
│   └── Menus/               # In-game menu icons
├── Vehicles/                # Vehicle silhouettes
└── subtypes/                # Subtype markers (SubtypeAmmoIcon.png, etc.)
```

> ⚠️ Respect this directory structure: it matches the paths used in-game and ensures consistency with future Foxhole updates.

#### Naming conventions

Files follow the game's PascalCase convention:

- `AssaultRifleItemIcon.png`
- `AssaultRifleHeavyCItemIcon.png` (`C` = Colonial, `W` = Warden)
- `ATMortarItemIcon.png`

Faction-specific icons carry a `C` (Colonial) or `W` (Warden) suffix.

#### Steps

1. Add your PNG file to the correct subfolder of `public/assets/icons/`.
2. Declare the icon in `public/iconMapping.json` (see next section).
3. Assign it a category in `public/categoryMapping.json` (see next section).
4. Run `npm run dev` and verify the icon appears in the sidebar, in the correct category.

---

### 📋 Item names and categories

Icon metadata is managed by two JSON files at the root of `public/`:

#### `public/iconMapping.json` — Display names

This file maps an icon's relative path to its human-readable name in the UI:

```json
{
  "UI/ItemIcons/AssaultRifleItemIcon.png": "Aalto Storm Rifle 24",
  "UI/ItemIcons/AssaultRifleHeavyCItemIcon.png": "\"Dusk\" ce.III",
  "UI/ItemIcons/AssaultRifleHeavyWItemIcon.png": "Booker Storm Rifle Model 838"
}
```

- The **key** is the relative path from `public/assets/icons/` (without that prefix).
- The **value** is the exact item name as it appears in the game.

#### `public/categoryMapping.json` — Categories

This file assigns each icon to one of the UI categories:

```json
{
  "UI/ItemIcons/AssaultRifleItemIcon.png": "Small Arms",
  "UI/ItemIcons/ATMortarItemIcon.png": "Field Weapons"
}
```

Available categories:

| Key | Description |
|-----|-------------|
| `Small Arms` | Light weapons and light ammunition |
| `Heavy Arms` | Heavy weapons and intermediate ammunition |
| `Heavy Ammunition` | Heavy ammunition (artillery, armoured) |
| `Utility` | Tools and equipment |
| `Medical` | Medical supplies |
| `Resources` | Resources and materials |
| `Uniforms` | Personal equipment and armour |
| `Vehicles` | Vehicles and armoured units |
| `Field Weapons` | Field weapons (mortars, cannons, MGs) |
| `Structures` | Emplacements and defensive structures |
| `Naval` | Naval ships and maritime equipment |
| `Trains` | Locomotives and railcars |
| `Planes` | Aircraft and aircraft parts |

---

## Opening a Pull Request

Once your changes are ready and tested locally:

```bash
# TypeScript check (no errors expected)
npx tsc --noEmit

# Test suite (all must pass)
npm test

# Commit and push
git add .
git commit -m "feat: add background preset 'My Background'"
git push origin feat/my-addition
```

Then open a Pull Request from your fork to the `main` branch of the original repository. In the description, specify:

- **What you add / modify** and why
- **A screenshot** if you touch the UI or visual assets
- **The source of the assets** if you add icons (required — see License section)

---

## License and rights

This project is distributed under **CC BY-NC 4.0**.

> **Important**: Foxhole icons and graphical assets are the property of **Siegecamp Inc.** Any icon contribution must come from game files and be used solely for non-commercial community purposes, in accordance with Siegecamp's terms of use.

By submitting a Pull Request, you agree that your contribution will be published under the same license as the project.
