# 11eRC-FL Template Builder

[![Build & Deploy](https://github.com/11eRC-FL/11eTemplateBuilder/actions/workflows/deploy.yml/badge.svg)](https://github.com/11eRC-FL/11eTemplateBuilder/actions/workflows/deploy.yml)
[![Tests](https://github.com/11eRC-FL/11eTemplateBuilder/actions/workflows/test.yml/badge.svg)](https://github.com/11eRC-FL/11eTemplateBuilder/actions/workflows/test.yml)
[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)

Un générateur de templates de stockpile pour le jeu Foxhole, spécialement conçu pour le régiment 11eRC-FL.

## 🎯 Fonctionnalités

- **Interface moderne** : Application TypeScript avec Tailwind CSS
- **Glisser-déposer** : Organisez facilement les icônes dans des sections
- **Grille intelligente** : Placement précis des icônes sur une grille CSS
- **Catégorisation automatique** : Les icônes sont classées par type (Armes, Munitions, Uniformes, etc.)
- **Taille ajustable** : Changez la taille globale des icônes (S/M/L)
- **Gestion des quantités** : Clic pour modifier la quantité de chaque item
- **Export PNG** : Image haute qualité 1920x1080 prête à l'emploi
- **Sauvegarde JSON** : Sauvegardez et rechargez vos templates
- **Raccourcis clavier** : Navigation rapide avec Ctrl+S, Ctrl+O, Ctrl+E
- **Menu d'aide** : Bouton `?` pour voir tous les raccourcis

## 🚀 Utilisation

### Démarrage rapide

```bash
# Installation des dépendances
npm install

# Lancement en mode développement
npm run dev

# Build de production
npm run build
```

### Workflow

1. **Double-cliquez** sur le canvas pour créer une nouvelle section
2. **Recherchez** ou parcourez les icônes dans la sidebar gauche
3. **Glissez-déposez** les icônes vers une section
4. **Réorganisez** les icônes en les glissant dans la grille
5. **Cliquez** sur une icône pour modifier sa quantité
6. **Exportez** en PNG ou sauvegardez en JSON

## ⌨️ Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl + S` | Sauvegarder le template (JSON) |
| `Ctrl + O` | Charger un template |
| `Ctrl + E` | Exporter en PNG |
| `?` | Afficher/masquer l'aide |
| `Escape` | Fermer les modals |

## 🖱️ Actions souris

- **Double-clic** sur le canvas → Créer une nouvelle section
- **Glisser** une icône de la sidebar → Ajouter à une section
- **Glisser** une icône dans la grille → Réorganiser
- **Clic** sur une icône placée → Modifier quantité/sous-type
- **Glisser** le header d'une section → Déplacer la section
- **Glisser** le coin d'une section → Redimensionner

## 📐 Taille des icônes

Utilisez les boutons **S** / **M** / **L** dans la toolbar pour ajuster la taille globale des icônes :
- **S** (Small) : Icônes compactes pour plus de contenu
- **M** (Medium) : Taille par défaut équilibrée  
- **L** (Large) : Icônes plus visibles

## 📁 Structure du projet

```
11eTemplateBuilder/
├── src/
│   ├── main.ts              # Point d'entrée
│   ├── store.ts             # État global (sections, icônes)
│   ├── types.ts             # Types TypeScript
│   ├── styles.css           # Styles Tailwind
│   └── components/
│       ├── Toolbar.ts       # Barre d'outils + raccourcis
│       ├── Sidebar.ts       # Liste des icônes
│       ├── Canvas.ts        # Zone de travail
│       ├── Section.ts       # Composant section
│       └── ...
├── assets/
│   ├── icons/               # Icônes Foxhole (PNG)
│   └── template_background.png
├── data/
│   ├── iconMapping.json     # Noms d'affichage des icônes
│   └── categoryMapping.json # Catégorisation des icônes
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 🎨 Catégories d'icônes

- **🔫 Armes** : Fusils, pistolets, lance-roquettes
- **🔴 Munitions** : Balles, obus, grenades, mines  
- **👤 Uniformes** : Équipements personnels et armures
- **📦 Ressources** : Matériaux de construction, composants
- **❤️ Médical** : Kits de soins, plasma sanguin
- **🚗 Véhicules** : Munitions et équipements véhicules
- **⚓ Naval** : Équipements maritimes
- **🏗️ Emplacements** : Structures défensives
- **➕ Autres** : Divers

## 💾 Formats d'export

| Format | Usage |
|--------|-------|
| **PNG** | Image 1920x1080 pour partage Discord/forums |
| **JSON** | Sauvegarde complète pour modification ultérieure |

## 🛠️ Stack technique

- **TypeScript** : Typage statique
- **Vite** : Build rapide et HMR
- **Tailwind CSS v4** : Styles utilitaires
- **interact.js** : Drag & resize des sections
- **html2canvas-pro** : Export PNG (support oklab/oklch)

## 🌐 Compatibilité

- ✅ Chrome 90+
- ✅ Firefox 90+
- ✅ Safari 15+
- ✅ Edge 90+

## 🎮 À propos de Foxhole

Foxhole est un jeu de guerre MMO développé par Siegecamp Inc. Ce template builder est un outil communautaire créé pour faciliter la gestion logistique des régiments.

## 📜 Licence

Ce projet est sous licence **CC BY-NC 4.0** (Creative Commons Attribution - Pas d'Utilisation Commerciale).

> ⚠️ **Note importante** : Les icônes et assets graphiques de Foxhole sont la propriété de **Siegecamp Inc.** et sont utilisés uniquement à des fins communautaires non commerciales.

Voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

**v2.0** - Créé avec ❤️ pour le 11eRC-FL
