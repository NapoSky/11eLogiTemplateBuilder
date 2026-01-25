import { Icon, IconCategory, Subtype } from '../types';

// Interface pour le fichier categoryMapping.json
interface CategoryMapping {
  [category: string]: {
    _comment?: string;
    items: string[];
  };
}

// Cache du mapping catégorie (chargé une seule fois)
let categoryLookup: Map<string, IconCategory> | null = null;

// Charger le mapping des catégories depuis le fichier JSON
async function loadCategoryMapping(): Promise<Map<string, IconCategory>> {
  if (categoryLookup) {
    return categoryLookup;
  }
  
  try {
    const response = await fetch('/categoryMapping.json');
    const mapping: CategoryMapping = await response.json();
    
    categoryLookup = new Map<string, IconCategory>();
    
    // Parcourir chaque catégorie et créer un lookup rapide
    for (const [category, data] of Object.entries(mapping)) {
      if (category === '_comment') continue; // Ignorer les commentaires
      
      for (const filename of data.items) {
        categoryLookup.set(filename, category as IconCategory);
      }
    }
    
    return categoryLookup;
  } catch (error) {
    console.error('Erreur lors du chargement de categoryMapping.json:', error);
    return new Map();
  }
}

// Fonction de catégorisation utilisant le mapping JSON
function categorize(filename: string, lookup: Map<string, IconCategory>): IconCategory {
  // Chercher d'abord dans le mapping JSON (avec le chemin complet pour les sous-dossiers)
  const category = lookup.get(filename);
  if (category) {
    return category;
  }
  
  // Fallback pour les items non mappés
  console.warn(`Icon non mappé dans categoryMapping.json: ${filename}`);
  return 'Resources';
}

// Extraire le chemin d'une icône (gère les sous-dossiers)
function getIconPath(filename: string): string {
  // Si le filename contient déjà un chemin (ex: VehicleIcons/xxx.png)
  if (filename.includes('/')) {
    return `/assets/icons/${filename}`;
  }
  // Sinon, c'est une icône dans le dossier racine
  return `/assets/icons/${filename}`;
}

export async function loadIcons(): Promise<Icon[]> {
  // Charger le mapping des catégories d'abord
  const categoryLookup = await loadCategoryMapping();
  
  const response = await fetch('/iconMapping.json');
  const mapping: Record<string, string> = await response.json();
  
  // Filtrer les commentaires (clés commençant par _comment)
  return Object.entries(mapping)
    .filter(([filename]) => !filename.startsWith('_comment'))
    .map(([filename, displayName]) => ({
      id: filename,
      filename,
      displayName,
      category: categorize(filename, categoryLookup),
      path: getIconPath(filename)
    }));
}

export async function loadSubtypes(): Promise<Subtype[]> {
  const response = await fetch('/subtypeMapping.json');
  const mapping: Record<string, string> = await response.json();
  
  return Object.entries(mapping).map(([filename, displayName]) => ({
    filename,
    displayName,
    path: `/assets/icons/subtypes/${filename}`
  }));
}
