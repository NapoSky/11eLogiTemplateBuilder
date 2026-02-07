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

export interface Template {
  sections: Section[];
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
