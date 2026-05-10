// Types de base pour l'application

// Génère un ID unique (compatible tous navigateurs)
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface Icon {
  id: string;
  filename: string;
  displayName: string;
  category: string;
  path: string;
}

export interface SectionIcon {
  id: string;
  iconId: string;
  filename: string;
  path: string;
  subtype?: string; // Chemin vers l'icône de subtype
  quantity: number; // Quantité affichée sur l'icône
  gridRow: number;  // Position sur la grille (ligne, commence à 0)
  gridCol: number;  // Position sur la grille (colonne, commence à 0)
}

export interface Subtype {
  filename: string;
  displayName: string;
  path: string;
}

export interface Section {
  id: string;
  title: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  icons: SectionIcon[];
}

// Tailles d'icônes disponibles
export type IconScale = 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';
export const ICON_SCALES: Record<IconScale, { cell: number; icon: number; img: number }> = {
  small:   { cell: 52,  icon: 48,  img: 38 },
  medium:  { cell: 64,  icon: 58,  img: 46 },
  large:   { cell: 76,  icon: 70,  img: 56 },
  xlarge:  { cell: 92,  icon: 84,  img: 68 },
  xxlarge: { cell: 110, icon: 100, img: 82 }
};

export interface Template {
  sections: Section[];
  iconScale?: IconScale;
}

// Catégories identiques aux onglets de la Factory in-game Foxhole + véhicules/structures
export type IconCategory = 
  | 'Small Arms'        // Armes légères + munitions légères
  | 'Heavy Arms'        // Armes lourdes + munitions moyennes
  | 'Heavy Ammunition'  // Munitions lourdes (artillerie, tanks)
  | 'Utility'           // Outils, équipement
  | 'Medical'           // Médical
  | 'Resources'         // Ressources & Matériaux
  | 'Uniforms'          // Uniformes
  | 'Vehicles'          // Véhicules terrestres (tanks, camions, voitures blindées)
  | 'Field Weapons'     // Armes de campagne (canons, mortiers, MGs)
  | 'Structures'        // Emplacements, structures défensives
  | 'Naval'             // Bateaux, navires, sous-marins
  | 'Trains'            // Locomotives et wagons
  | 'Planes';           // Avions et pièces d'avions

export const CATEGORIES: IconCategory[] = [
  'Small Arms',
  'Heavy Arms',
  'Heavy Ammunition',
  'Utility',
  'Medical',
  'Resources',
  'Uniforms',
  'Vehicles',
  'Field Weapons',
  'Structures',
  'Naval',
  'Trains',
  'Planes'
];

// =====================================================================
// TodoList builder (mode #2)
// =====================================================================

export type ViewMode = 'template' | 'todolist';

export type Faction = 'neutral' | 'colonial' | 'warden';
export type FactionFilter = 'all' | 'colonial' | 'warden';

// Catégories MPF (ordre d'affichage dans l'export Discord)
export type MpfCategory =
  | 'small_arms'
  | 'heavy_arms'
  | 'heavy_ammunition'
  | 'vehicles'
  | 'shipables'
  | 'uniforms'
  | 'supplies';

export const MPF_CATEGORIES: MpfCategory[] = [
  'small_arms',
  'heavy_arms',
  'heavy_ammunition',
  'supplies',
  'uniforms',
  'vehicles',
  'shipables',
];

export const MPF_CATEGORY_LABELS: Record<MpfCategory, string> = {
  small_arms: 'Small arms',
  heavy_arms: 'Heavy arms',
  heavy_ammunition: 'Heavy ammunition',
  vehicles: 'Vehicles',
  shipables: 'Shippables',
  uniforms: 'Uniforms',
  supplies: 'Supplies',
};

export interface MpfDataEntry {
  iconFilename: string;
  itemName: string;
  itemCategory: MpfCategory;
  faction: Faction[];
  cost: { bmat?: number; rmat?: number; emat?: number; hemat?: number };
  numberProduced: number;
  crateBonus?: number;
  maxCrates: 9 | 5;
}

export interface TodoListItem {
  id: string;
  iconFilename: string;
  itemName: string;
  category: MpfCategory;
  faction: Faction[];
  cost: { bmat?: number; rmat?: number; emat?: number; hemat?: number };
  maxCrates: 9 | 5;
  numberProduced: number;
  crateBonus?: number;
  orderCount: number; // nombre de full orders MPF (chaque order = maxCrates caisses)
}

export interface TodoList {
  title: string;        // libre, par défaut "TODOLIST"
  autoDate: boolean;    // si true, ajoute la date dans l'export
  faction: FactionFilter;
  items: TodoListItem[];
  textBlocks: TextBlock[];
}

// =====================================================================
// Free-form text blocks anchored in the TodoList output.
// =====================================================================

export type TextAnchor =
  | { kind: 'top' }
  | { kind: 'category'; category: MpfCategory }
  | { kind: 'footer' };

export interface TextBlock {
  id: string;
  content: string;
  anchor: TextAnchor;
}

