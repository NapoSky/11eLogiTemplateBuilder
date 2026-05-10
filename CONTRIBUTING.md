# Contribuer au 11eRC-FL Template Builder

Merci de l'intérêt que tu portes au projet ! Ce guide explique comment proposer des modifications via une Pull Request.

## Table des matières

- [Prérequis](#prérequis)
- [Fork & mise en place locale](#fork--mise-en-place-locale)
- [Ce que tu peux contribuer](#ce-que-tu-peux-contribuer)
  - [Backgrounds de template](#-backgrounds-de-template)
  - [Icônes d'items](#-icônes-ditems)
  - [Noms et catégories d'items](#-noms-et-catégories-ditems)
- [Ouvrir une Pull Request](#ouvrir-une-pull-request)
- [Licence et droits](#licence-et-droits)

---

## Prérequis

- Un compte [GitHub](https://github.com)
- Node.js ≥ 18 et npm
- Des notions basiques de Git (fork, branch, commit, push)

---

## Fork & mise en place locale

```bash
# 1. Forker le dépôt via l'interface GitHub (bouton "Fork" en haut à droite)

# 2. Cloner ton fork
git clone https://github.com/<ton-pseudo>/11eLogiTemplateBuilder.git
cd 11eLogiTemplateBuilder

# 3. Installer les dépendances
npm install

# 4. Lancer le serveur de développement
npm run dev
# L'application est disponible sur http://localhost:5173

# 5. Créer une branche dédiée à ta contribution
git checkout -b feat/mon-ajout
```

---

## Ce que tu peux contribuer

### 🖼️ Backgrounds de template

Les fonds de template sont situés dans **`public/assets/backgrounds/`** et déclarés dans **`public/assets/backgrounds/manifest.json`**.

#### Spécifications techniques

| Propriété | Valeur attendue |
|-----------|----------------|
| Format | PNG (de préférence) ou JPG |
| Résolution | **1920 × 1080 px** obligatoire |
| Taille fichier | < 2 Mo recommandé |
| Thème | En rapport avec Foxhole (carte, carte régimentaire, interface, etc.) |

#### Étapes

1. Ajoute ton image dans `public/assets/backgrounds/` (ex : `mon_fond.png`)
2. Déclare-la dans `manifest.json` :

```json
{
  "presets": [
    { "name": "Default Foxhole", "path": "/assets/backgrounds/template_default.png" },
    { "name": "Mon Fond",        "path": "/assets/backgrounds/mon_fond.png" }
  ]
}
```

3. Lance l'application (`npm run dev`) et vérifie que le preset s'affiche correctement dans la modale **Fond → Preset**.
4. Commit ton image **et** le `manifest.json` modifié.

---

### 🔫 Icônes d'items

Les icônes sont extraites directement des fichiers du jeu Foxhole et organisées selon la **structure de modding officielle**.

#### Structure attendue

```
public/assets/icons/
├── UI/
│   ├── ItemIcons/           # Items de fabrication (armes, munitions, ressources…)
│   │   ├── Uniforms/        # Uniformes et équipements personnels
│   │   └── Facilities/      # Items liés aux bâtiments de production
│   ├── StructureIcons/      # Structures défensives
│   ├── VehicleIcons/        # Icônes de véhicules (symboles d'interface)
│   └── Menus/               # Icônes de menus in-game
├── Vehicles/                # Silhouettes de véhicules
└── subtypes/                # Marqueurs de sous-type (SubtypeAmmoIcon.png, etc.)
```

> ⚠️ Respecte cette arborescence : elle correspond aux chemins utilisés dans le jeu et permet une cohérence avec les futures mises à jour de Foxhole.

#### Conventions de nommage

Les fichiers suivent la convention PascalCase du jeu :

- `AssaultRifleItemIcon.png`
- `AssaultRifleHeavyCItemIcon.png` (`C` = Colonial, `W` = Warden)
- `ATMortarItemIcon.png`

Les icônes spécifiques à une faction portent un suffixe `C` (Colonial) ou `W` (Warden).

#### Étapes

1. Ajoute ton fichier PNG dans le bon sous-dossier de `public/assets/icons/`.
2. Déclare l'icône dans `public/iconMapping.json` (voir section suivante).
3. Assigne-lui une catégorie dans `public/categoryMapping.json` (voir section suivante).
4. Lance `npm run dev` et vérifie que l'icône apparaît dans la sidebar, dans la bonne catégorie.

---

### 📋 Noms et catégories d'items

Les métadonnées des icônes sont gérées par deux fichiers JSON à la racine de `public/` :

#### `public/iconMapping.json` — Noms d'affichage

Ce fichier associe le chemin relatif d'une icône à son nom lisible dans l'interface :

```json
{
  "UI/ItemIcons/AssaultRifleItemIcon.png": "Aalto Storm Rifle 24",
  "UI/ItemIcons/AssaultRifleHeavyCItemIcon.png": "\"Dusk\" ce.III",
  "UI/ItemIcons/AssaultRifleHeavyWItemIcon.png": "Booker Storm Rifle Model 838"
}
```

- La **clé** est le chemin relatif depuis `public/assets/icons/` (sans ce préfixe).
- La **valeur** est le nom exact de l'item tel qu'il apparaît dans le jeu.

#### `public/categoryMapping.json` — Catégories

Ce fichier assigne chaque icône à l'une des catégories de l'interface :

```json
{
  "UI/ItemIcons/AssaultRifleItemIcon.png": "Small Arms",
  "UI/ItemIcons/ATMortarItemIcon.png": "Field Weapons"
}
```

Catégories disponibles :

| Clé | Description |
|-----|-------------|
| `Small Arms` | Armes légères et munitions légères |
| `Heavy Arms` | Armes lourdes et munitions intermédiaires |
| `Heavy Ammunition` | Munitions lourdes (artillerie, blindés) |
| `Utility` | Outils et équipements |
| `Medical` | Soins et médical |
| `Resources` | Ressources et matériaux |
| `Uniforms` | Uniformes et équipements personnels |
| `Vehicles` | Véhicules et blindés |
| `Field Weapons` | Armes de campagne (mortiers, canons, MGs) |
| `Structures` | Emplacements et structures défensives |
| `Naval` | Navires et équipements maritimes |
| `Trains` | Locomotives et wagons |
| `Planes` | Avions et pièces d'avions |

---

## Ouvrir une Pull Request

Une fois tes modifications prêtes et testées localement :

```bash
# Vérification TypeScript (aucune erreur attendue)
npx tsc --noEmit

# Suite de tests (tous doivent passer)
npm test

# Commit et push
git add .
git commit -m "feat: ajoute le preset de fond 'Mon Fond'"
git push origin feat/mon-ajout
```

Puis ouvre une Pull Request depuis ton fork vers la branche `main` du dépôt original. Dans la description, précise :

- **Ce que tu ajoutes / modifies** et pourquoi
- **Une capture d'écran** si tu touches à l'UI ou aux assets visuels
- **La source des assets** si tu ajoutes des icônes (obligatoire — voir section Licence)

---

## Licence et droits

Ce projet est distribué sous **CC BY-NC 4.0**.

> **Important** : les icônes et assets graphiques de Foxhole sont la propriété de **Siegecamp Inc.** Toute contribution d'icônes doit être issue des fichiers du jeu et utilisée uniquement à des fins communautaires non commerciales, conformément aux conditions d'utilisation de Siegecamp.

En soumettant une Pull Request, tu acceptes que ta contribution soit publiée sous la même licence que le projet.
