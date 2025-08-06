# 11eRC-FL Template Builder

Un générateur de templates de stockpile pour le jeu Foxhole, spécialement conçu pour le régiment 11eRC-FL.

## 🎯 Fonctionnalités

- **Interface intuitive** : Glisser-déposer pour organiser facilement les icônes
- **Catégorisation automatique** : Les icônes sont automatiquement classées par type (armes, munitions, uniformes, etc.)
- **Gestion des quantités** : Clic simple pour modifier les quantités de chaque item
- **Système de sections** : Créez des sections personnalisées avec des couleurs de bordure différentes
- **Export haute qualité** : Génération d'images PNG en 1920x1080 prêtes à l'emploi
- **Sauvegarde/Chargement** : Sauvegardez vos templates et rechargez-les plus tard
- **Recherche** : Trouvez rapidement une icône spécifique
- **Responsive** : Fonctionne sur desktop et mobile

## 🚀 Utilisation

1. **Ouvrez** le fichier `index.html` dans votre navigateur
2. **Recherchez** ou parcourez les icônes dans la sidebar
3. **Glissez-déposez** les icônes sur le canvas pour créer votre template
4. **Cliquez** sur une icône placée pour modifier sa quantité
5. **Créez des sections** avec le bouton "Ajouter Section"
6. **Exportez** votre template en PNG haute qualité

## 📁 Structure du projet

```
11eTemplateBuilder/
├── index.html          # Interface principale
├── styles.css          # Styles CSS
├── script.js           # Logique JavaScript
├── assets/
│   └── icons/          # Dossier contenant toutes les icônes Foxhole
│       ├── AmmoUniformWIcon.png
│       ├── AssaultRifleItemIcon.png
│       └── ... (toutes les autres icônes)
└── README.md           # Ce fichier
```

## 🎨 Catégories d'icônes

Les icônes sont automatiquement classées dans les catégories suivantes :

- **🎯 Armes** : Fusils, pistolets, lance-roquettes, etc.
- **🔴 Munitions** : Balles, obus, grenades, mines
- **👤 Uniformes** : Tous types d'uniformes et armures
- **📦 Matériaux** : Matériaux de construction, combustibles, composants
- **❤️ Médical** : Trousses de soins, plasma sanguin, etc.
- **🚛 Véhicules** : Équipements et munitions pour véhicules
- **➕ Autres** : Tout ce qui ne rentre pas dans les autres catégories

## 🎨 Couleurs de sections

Vous pouvez choisir parmi 6 couleurs de bordure pour vos sections :

- **Bleu** : Équipement général
- **Rouge** : Munitions et explosifs
- **Vert** : Médical et ravitaillement
- **Orange** : Matériaux et construction
- **Violet** : Emplacements et fortifications
- **Gris** : Uniformes et équipement personnel

## 💾 Formats d'export

- **PNG** : Image haute qualité (1920x1080) pour partage direct
- **JSON** : Sauvegarde du template pour modification ultérieure

## 🔧 Fonctionnalités avancées

### Raccourcis clavier
- `Suppr` : Supprimer une section sélectionnée
- `Ctrl/Cmd + S` : Sauvegarder le template
- `Ctrl/Cmd + O` : Charger un template
- `Ctrl/Cmd + E` : Exporter en PNG

### Glisser-déposer
- Glissez une icône vers une section existante pour l'ajouter
- Glissez une icône vers une zone vide pour créer une nouvelle section
- Déplacez les sections en glissant leur en-tête

### Gestion des quantités
- Clic simple sur une icône pour modifier sa quantité
- Entrez 0 pour supprimer un item
- Les quantités sont automatiquement affichées avec un badge

## 🌐 Compatibilité

- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+

## 📝 Notes de développement

L'application est entièrement côté client et ne nécessite aucun serveur. Elle utilise :

- **HTML5** pour la structure
- **CSS3** avec variables personnalisées pour le style
- **JavaScript ES6+** pour la logique
- **Canvas API** pour l'export d'images
- **File API** pour la sauvegarde/chargement

## 🐛 Problèmes connus

- Les icônes doivent être au format PNG et dans le dossier `assets/icons/`
- L'export peut prendre quelques secondes pour les templates complexes
- La qualité d'export dépend de la qualité des icônes sources

## 🎮 À propos de Foxhole

Foxhole est un jeu de guerre multijoueur massivement en ligne développé par Clapfoot Inc. Ce template builder est un outil communautaire créé pour faciliter la gestion logistique des régiments.

---

Créé avec ❤️ pour le 11eRC-FL
