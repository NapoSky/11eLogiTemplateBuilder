/**
 * Tests d'intégration du Store
 * 
 * Ces tests vérifient les fonctionnalités clés du state management:
 * - Gestion des sections (CRUD)
 * - Gestion des icônes dans les sections
 * - Persistance localStorage
 * - Filtrage des icônes
 * - Système de subscription (event emitter)
 */

import { store, ICON_SCALES } from '../store';
import { Icon, Section, CATEGORIES } from '../types';

// Helper pour reset le store entre les tests
function resetStore() {
  // Supprimer toutes les sections
  while (store.sections.length > 0) {
    store.deleteSection(store.sections[0].id);
  }
  // Reset les autres états
  store.setIcons([]);
  store.setSubtypes([]);
  store.setCategory('Toutes');
  store.setSearch('');
}

beforeEach(() => {
  resetStore();
  localStorage.clear();
});

// ============================================
// TESTS
// ============================================

describe('Store - Gestion des Sections', () => {
  describe('CRUD Sections', () => {
    test('addSection ajoute une section avec tous les paramètres', () => {
      const section: Section = {
        id: 'section-1',
        title: 'Infanterie',
        color: '#3b82f6',
        x: 100,
        y: 200,
        width: 300,
        height: 250,
        icons: []
      };
      
      store.addSection(section);
      
      expect(store.sections).toHaveLength(1);
      expect(store.sections[0]).toEqual(section);
    });
    
    test('updateSection modifie uniquement les propriétés spécifiées', () => {
      const section: Section = {
        id: 'section-1',
        title: 'Infanterie',
        color: '#3b82f6',
        x: 100,
        y: 200,
        width: 300,
        height: 250,
        icons: []
      };
      
      store.addSection(section);
      store.updateSection('section-1', { title: 'Véhicules', x: 500 });
      
      expect(store.sections[0].title).toBe('Véhicules');
      expect(store.sections[0].x).toBe(500);
      expect(store.sections[0].y).toBe(200);
      expect(store.sections[0].color).toBe('#3b82f6');
    });
    
    test('deleteSection supprime la section et préserve les autres', () => {
      store.addSection({ id: 'section-1', title: 'A', color: '#fff', x: 0, y: 0, width: 100, height: 100, icons: [] });
      store.addSection({ id: 'section-2', title: 'B', color: '#fff', x: 0, y: 0, width: 100, height: 100, icons: [] });
      store.addSection({ id: 'section-3', title: 'C', color: '#fff', x: 0, y: 0, width: 100, height: 100, icons: [] });
      
      store.deleteSection('section-2');
      
      expect(store.sections).toHaveLength(2);
      expect(store.sections.map(s => s.id)).toEqual(['section-1', 'section-3']);
    });
    
    test('deleteSection sur ID inexistant ne fait rien', () => {
      store.addSection({ id: 'section-1', title: 'A', color: '#fff', x: 0, y: 0, width: 100, height: 100, icons: [] });
      
      store.deleteSection('inexistant');
      
      expect(store.sections).toHaveLength(1);
    });
  });
  
  describe('Gestion des icônes dans les sections', () => {
    const mockIcon: Icon = {
      id: 'rifle-icon',
      filename: 'rifle.png',
      displayName: 'Fusil',
      category: 'Small Arms',
      path: '/assets/icons/rifle.png'
    };
    
    beforeEach(() => {
      store.addSection({
        id: 'section-1',
        title: 'Test',
        color: '#fff',
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        icons: []
      });
    });
    
    test('addIconToSection ajoute une icône avec position par défaut', () => {
      store.addIconToSection('section-1', mockIcon);
      
      expect(store.sections[0].icons).toHaveLength(1);
      expect(store.sections[0].icons[0].iconId).toBe('rifle-icon');
      expect(store.sections[0].icons[0].quantity).toBe(1);
      expect(store.sections[0].icons[0].gridRow).toBe(0);
      expect(store.sections[0].icons[0].gridCol).toBe(0);
    });
    
    test('addIconToSection ajoute une icône avec position spécifiée', () => {
      store.addIconToSection('section-1', mockIcon, 2, 3);
      
      expect(store.sections[0].icons[0].gridRow).toBe(2);
      expect(store.sections[0].icons[0].gridCol).toBe(3);
    });
    
    test('addIconToSection trouve automatiquement une position libre', () => {
      store.addIconToSection('section-1', mockIcon);
      store.addIconToSection('section-1', { ...mockIcon, id: 'icon-2' });
      store.addIconToSection('section-1', { ...mockIcon, id: 'icon-3' });
      
      const positions = store.sections[0].icons.map(i => `${i.gridRow},${i.gridCol}`);
      expect(new Set(positions).size).toBe(3);
    });
    
    test('removeIconFromSection supprime l\'icône spécifiée', () => {
      store.addIconToSection('section-1', mockIcon);
      const iconInstanceId = store.sections[0].icons[0].id;
      
      store.removeIconFromSection('section-1', iconInstanceId);
      
      expect(store.sections[0].icons).toHaveLength(0);
    });
    
    test('setIconQuantity modifie la quantité (minimum 1)', () => {
      store.addIconToSection('section-1', mockIcon);
      const iconInstanceId = store.sections[0].icons[0].id;
      
      store.setIconQuantity('section-1', iconInstanceId, 5);
      expect(store.sections[0].icons[0].quantity).toBe(5);
      
      store.setIconQuantity('section-1', iconInstanceId, 0);
      expect(store.sections[0].icons[0].quantity).toBe(1);
      
      store.setIconQuantity('section-1', iconInstanceId, -10);
      expect(store.sections[0].icons[0].quantity).toBe(1);
    });
    
    test('setIconSubtype ajoute/modifie le subtype', () => {
      store.addIconToSection('section-1', mockIcon);
      const iconInstanceId = store.sections[0].icons[0].id;
      
      store.setIconSubtype('section-1', iconInstanceId, '/assets/icons/subtypes/veteran.png');
      expect(store.sections[0].icons[0].subtype).toBe('/assets/icons/subtypes/veteran.png');
      
      store.setIconSubtype('section-1', iconInstanceId, undefined);
      expect(store.sections[0].icons[0].subtype).toBeUndefined();
    });
  });
  
  describe('Déplacement d\'icônes dans la grille', () => {
    const mockIcon: Icon = {
      id: 'icon-1',
      filename: 'test.png',
      displayName: 'Test',
      category: 'Small Arms',
      path: '/test.png'
    };
    
    beforeEach(() => {
      store.addSection({
        id: 'section-1',
        title: 'Test',
        color: '#fff',
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        icons: []
      });
    });
    
    test('moveIconToGridPosition déplace vers une cellule vide', () => {
      store.addIconToSection('section-1', mockIcon, 0, 0);
      const iconId = store.sections[0].icons[0].id;
      
      store.moveIconToGridPosition('section-1', iconId, 2, 3);
      
      expect(store.sections[0].icons[0].gridRow).toBe(2);
      expect(store.sections[0].icons[0].gridCol).toBe(3);
    });
    
    test('moveIconToGridPosition échange les positions si cellule occupée', () => {
      store.addIconToSection('section-1', mockIcon, 0, 0);
      store.addIconToSection('section-1', { ...mockIcon, id: 'icon-2' }, 1, 1);
      
      const icon1Id = store.sections[0].icons[0].id;
      const icon2Id = store.sections[0].icons[1].id;
      
      store.moveIconToGridPosition('section-1', icon1Id, 1, 1);
      
      const movedIcon1 = store.sections[0].icons.find(i => i.id === icon1Id);
      expect(movedIcon1?.gridRow).toBe(1);
      expect(movedIcon1?.gridCol).toBe(1);
      
      const movedIcon2 = store.sections[0].icons.find(i => i.id === icon2Id);
      expect(movedIcon2?.gridRow).toBe(0);
      expect(movedIcon2?.gridCol).toBe(0);
    });
  });
  
  describe('Déplacement entre sections', () => {
    const mockIcon: Icon = {
      id: 'icon-1',
      filename: 'test.png',
      displayName: 'Test',
      category: 'Small Arms',
      path: '/test.png'
    };
    
    beforeEach(() => {
      store.addSection({
        id: 'section-1',
        title: 'Source',
        color: '#fff',
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        icons: []
      });
      store.addSection({
        id: 'section-2',
        title: 'Destination',
        color: '#fff',
        x: 400,
        y: 0,
        width: 300,
        height: 200,
        icons: []
      });
    });
    
    test('moveIconBetweenSections transfère l\'icône', () => {
      store.addIconToSection('section-1', mockIcon, 0, 0);
      const iconId = store.sections[0].icons[0].id;
      
      store.moveIconBetweenSections('section-1', 'section-2', iconId, 2, 2);
      
      expect(store.sections[0].icons).toHaveLength(0);
      expect(store.sections[1].icons).toHaveLength(1);
      expect(store.sections[1].icons[0].id).toBe(iconId);
      expect(store.sections[1].icons[0].gridRow).toBe(2);
      expect(store.sections[1].icons[0].gridCol).toBe(2);
    });
    
    test('moveIconBetweenSections ne fait rien si section source inexistante', () => {
      store.addIconToSection('section-1', mockIcon);
      const iconId = store.sections[0].icons[0].id;
      
      store.moveIconBetweenSections('inexistant', 'section-2', iconId, 0, 0);
      
      expect(store.sections[0].icons).toHaveLength(1);
      expect(store.sections[1].icons).toHaveLength(0);
    });
  });
});

describe('Store - Filtrage des icônes', () => {
  const testIcons: Icon[] = [
    { id: '1', filename: 'rifle.png', displayName: 'Fusil', category: 'Small Arms', path: '/rifle.png' },
    { id: '2', filename: 'pistol.png', displayName: 'Pistolet', category: 'Small Arms', path: '/pistol.png' },
    { id: '3', filename: 'tank.png', displayName: 'Tank Lourd', category: 'Vehicles', path: '/tank.png' },
    { id: '4', filename: 'medkit.png', displayName: 'Kit Médical', category: 'Medical', path: '/medkit.png' },
    { id: '5', filename: 'grenade.png', displayName: 'Grenade à main', category: 'Small Arms', path: '/grenade.png' },
  ];
  
  beforeEach(() => {
    store.setIcons(testIcons);
  });
  
  test('filteredIcons retourne toutes les icônes par défaut', () => {
    expect(store.filteredIcons).toHaveLength(5);
  });
  
  test('filteredIcons filtre par catégorie', () => {
    store.setCategory('Small Arms');
    
    expect(store.filteredIcons).toHaveLength(3);
    expect(store.filteredIcons.every(i => i.category === 'Small Arms')).toBe(true);
  });
  
  test('filteredIcons filtre par recherche textuelle (displayName)', () => {
    store.setSearch('tank');
    
    expect(store.filteredIcons).toHaveLength(1);
    expect(store.filteredIcons[0].displayName).toBe('Tank Lourd');
  });
  
  test('filteredIcons filtre par recherche textuelle (filename)', () => {
    store.setSearch('medkit');
    
    expect(store.filteredIcons).toHaveLength(1);
    expect(store.filteredIcons[0].filename).toBe('medkit.png');
  });
  
  test('filteredIcons combine catégorie et recherche', () => {
    store.setCategory('Small Arms');
    store.setSearch('gren');
    
    expect(store.filteredIcons).toHaveLength(1);
    expect(store.filteredIcons[0].displayName).toBe('Grenade à main');
  });
  
  test('filteredIcons recherche case-insensitive', () => {
    store.setSearch('TANK');
    
    expect(store.filteredIcons).toHaveLength(1);
  });
  
  test('filteredIcons ignore les espaces en début/fin de recherche', () => {
    store.setSearch('  tank  ');
    
    expect(store.filteredIcons).toHaveLength(1);
  });
});

describe('Store - Persistance localStorage', () => {
  test('save() persiste les sections dans localStorage', () => {
    const section: Section = {
      id: 'section-1',
      title: 'Test',
      color: '#fff',
      x: 100,
      y: 200,
      width: 300,
      height: 250,
      icons: []
    };
    
    store.addSection(section);
    
    const saved = JSON.parse(localStorage.getItem('template') || '{}');
    expect(saved.sections).toHaveLength(1);
    expect(saved.sections[0].title).toBe('Test');
  });
  
  test('load() restaure les sections depuis localStorage', () => {
    const template = {
      sections: [{
        id: 'loaded-section',
        title: 'Chargé',
        color: '#f00',
        x: 50,
        y: 50,
        width: 200,
        height: 150,
        icons: []
      }]
    };
    localStorage.setItem('template', JSON.stringify(template));
    
    store.load();
    
    expect(store.sections).toHaveLength(1);
    expect(store.sections[0].title).toBe('Chargé');
  });
  
  test('load() restaure iconScale depuis localStorage', () => {
    localStorage.setItem('iconScale', 'large');
    
    store.load();
    
    expect(store.iconScale).toBe('large');
  });
  
  test('load() gère gracieusement un JSON invalide', () => {
    localStorage.setItem('template', 'not valid json{');
    
    expect(() => store.load()).not.toThrow();
  });
  
  test('setIconScale persiste le choix', () => {
    store.setIconScale('small');
    
    expect(localStorage.getItem('iconScale')).toBe('small');
    expect(store.iconScale).toBe('small');
  });
});

describe('Store - Import/Export JSON', () => {
  test('exportJSON retourne le template formaté', () => {
    store.addSection({
      id: 'section-1',
      title: 'Export Test',
      color: '#3b82f6',
      x: 100,
      y: 100,
      width: 300,
      height: 200,
      icons: []
    });
    
    const json = store.exportJSON();
    const parsed = JSON.parse(json);
    
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].title).toBe('Export Test');
  });
  
  test('importJSON charge un template valide', () => {
    const template = {
      sections: [{
        id: 'imported',
        title: 'Importé',
        color: '#22c55e',
        x: 200,
        y: 200,
        width: 400,
        height: 300,
        icons: [{
          id: 'icon-1',
          iconId: 'rifle',
          filename: 'rifle.png',
          path: '/rifle.png',
          quantity: 3,
          gridRow: 0,
          gridCol: 0
        }]
      }]
    };
    
    store.importJSON(JSON.stringify(template));
    
    expect(store.sections).toHaveLength(1);
    expect(store.sections[0].icons).toHaveLength(1);
    expect(store.sections[0].icons[0].quantity).toBe(3);
  });
  
  test('importJSON gère un JSON invalide sans crash', () => {
    expect(() => store.importJSON('invalid json {')).not.toThrow();
  });
  
  test('exportJSON puis importJSON préserve les données', () => {
    store.addSection({
      id: 'section-1',
      title: 'Roundtrip',
      color: '#ef4444',
      x: 150,
      y: 250,
      width: 350,
      height: 280,
      icons: []
    });
    
    const exported = store.exportJSON();
    resetStore();
    store.importJSON(exported);
    
    expect(store.sections[0].title).toBe('Roundtrip');
    expect(store.sections[0].x).toBe(150);
  });
});

describe('Store - Système de Subscription', () => {
  test('subscribe notifie les listeners lors des changements', () => {
    const listener = jest.fn();
    store.subscribe(listener);
    
    store.addSection({
      id: 'section-1',
      title: 'Test',
      color: '#fff',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      icons: []
    });
    
    expect(listener).toHaveBeenCalled();
  });
  
  test('subscribe retourne une fonction unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    
    store.setSearch('test');
    const callCount = listener.mock.calls.length;
    
    unsubscribe();
    store.setSearch('autre');
    
    expect(listener.mock.calls.length).toBe(callCount);
  });
});

describe('Store - ICON_SCALES', () => {
  test('ICON_SCALES contient les trois tailles', () => {
    expect(ICON_SCALES).toHaveProperty('small');
    expect(ICON_SCALES).toHaveProperty('medium');
    expect(ICON_SCALES).toHaveProperty('large');
  });
  
  test('chaque taille a cell, icon et img', () => {
    for (const scale of ['small', 'medium', 'large'] as const) {
      expect(ICON_SCALES[scale]).toHaveProperty('cell');
      expect(ICON_SCALES[scale]).toHaveProperty('icon');
      expect(ICON_SCALES[scale]).toHaveProperty('img');
    }
  });
});

describe('Store - reorderSectionIcons', () => {
  const mockIcon1: Icon = { id: 'icon-1', filename: 'rifle.png', displayName: 'Rifle', category: 'Small Arms', path: '/rifle.png' };
  const mockIcon2: Icon = { id: 'icon-2', filename: 'pistol.png', displayName: 'Pistol', category: 'Small Arms', path: '/pistol.png' };
  const mockIcon3: Icon = { id: 'icon-3', filename: 'tank.png', displayName: 'Tank', category: 'Vehicles', path: '/tank.png' };

  beforeEach(() => {
    store.addSection({
      id: 'section-reorder',
      title: 'Reorder Test',
      color: '#fff',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      icons: []
    });
    store.addIconToSection('section-reorder', mockIcon1);
    store.addIconToSection('section-reorder', mockIcon2);
    store.addIconToSection('section-reorder', mockIcon3);
  });

  test('reorderSectionIcons réorganise les icônes dans l\'ordre spécifié', () => {
    const icons = store.sections[0].icons;
    const id1 = icons[0].id;
    const id2 = icons[1].id;
    const id3 = icons[2].id;

    // Inverser l'ordre
    store.reorderSectionIcons('section-reorder', [id3, id1, id2]);

    const reordered = store.sections[0].icons;
    expect(reordered[0].id).toBe(id3);
    expect(reordered[1].id).toBe(id1);
    expect(reordered[2].id).toBe(id2);
  });

  test('reorderSectionIcons ignore les IDs inexistants', () => {
    const icons = store.sections[0].icons;
    const id1 = icons[0].id;

    store.reorderSectionIcons('section-reorder', ['inexistant', id1]);

    // Seul id1 devrait être présent
    expect(store.sections[0].icons.length).toBe(1);
    expect(store.sections[0].icons[0].id).toBe(id1);
  });

  test('reorderSectionIcons ne fait rien sur section inexistante', () => {
    const initialIcons = [...store.sections[0].icons];

    store.reorderSectionIcons('inexistant', ['id1', 'id2']);

    // Les icônes ne devraient pas changer
    expect(store.sections[0].icons.length).toBe(initialIcons.length);
  });
});

describe('Store - moveIconBetweenSections avec collision', () => {
  const mockIcon: Icon = { id: 'icon-collision', filename: 'rifle.png', displayName: 'Rifle', category: 'Small Arms', path: '/rifle.png' };

  beforeEach(() => {
    store.addSection({
      id: 'source-collision',
      title: 'Source',
      color: '#fff',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      icons: []
    });
    store.addSection({
      id: 'dest-collision',
      title: 'Destination',
      color: '#fff',
      x: 400,
      y: 0,
      width: 300,
      height: 200,
      icons: []
    });
  });

  test('moveIconBetweenSections avec position occupée remplace l\'icône existante', () => {
    // Ajouter une icône source
    store.addIconToSection('source-collision', mockIcon, 0, 0);
    const sourceIconId = store.sections.find(s => s.id === 'source-collision')!.icons[0].id;

    // Ajouter une icône à la destination à la position cible
    store.addIconToSection('dest-collision', { ...mockIcon, id: 'existing-icon' }, 1, 1);

    // Déplacer vers la position occupée
    store.moveIconBetweenSections('source-collision', 'dest-collision', sourceIconId, 1, 1);

    const destSection = store.sections.find(s => s.id === 'dest-collision')!;
    const sourceSection = store.sections.find(s => s.id === 'source-collision')!;

    // Source devrait être vide
    expect(sourceSection.icons.length).toBe(0);

    // Destination devrait avoir l'icône déplacée (l'existante est retirée)
    expect(destSection.icons.length).toBe(1);
    expect(destSection.icons[0].id).toBe(sourceIconId);
    expect(destSection.icons[0].gridRow).toBe(1);
    expect(destSection.icons[0].gridCol).toBe(1);
  });

  test('moveIconBetweenSections ne fait rien si icône source inexistante', () => {
    store.addIconToSection('source-collision', mockIcon, 0, 0);

    store.moveIconBetweenSections('source-collision', 'dest-collision', 'inexistant', 0, 0);

    const sourceSection = store.sections.find(s => s.id === 'source-collision')!;
    const destSection = store.sections.find(s => s.id === 'dest-collision')!;

    expect(sourceSection.icons.length).toBe(1);
    expect(destSection.icons.length).toBe(0);
  });
});
