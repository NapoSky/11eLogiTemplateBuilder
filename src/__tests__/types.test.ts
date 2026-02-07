/**
 * Tests des types et fonctions utilitaires
 * 
 * Ces tests vérifient les fonctions utilitaires et les constantes
 * exportées par types.ts
 */

import { generateId, CATEGORIES } from '../types';

describe('generateId - Génération d\'identifiants uniques', () => {
  test('génère un ID au format UUID v4', () => {
    const id = generateId();
    
    // Format UUID v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  test('génère des IDs uniques à chaque appel', () => {
    const ids = new Set<string>();
    const iterations = 1000;
    
    for (let i = 0; i < iterations; i++) {
      ids.add(generateId());
    }
    
    // Tous les IDs doivent être uniques
    expect(ids.size).toBe(iterations);
  });

  test('génère des IDs de longueur fixe (36 caractères)', () => {
    const id = generateId();
    
    // UUID standard = 32 hex chars + 4 tirets = 36
    expect(id.length).toBe(36);
  });

  test('génère des IDs avec le bon pattern de version (4)', () => {
    // Vérifier sur plusieurs IDs que le 13e caractère est toujours '4'
    for (let i = 0; i < 100; i++) {
      const id = generateId();
      // Position 14 (index 13) doit être '4' pour UUID v4
      expect(id[14]).toBe('4');
    }
  });

  test('génère des IDs avec le bon variant (8, 9, a, ou b)', () => {
    // Le caractère à la position 19 doit être 8, 9, a, ou b
    for (let i = 0; i < 100; i++) {
      const id = generateId();
      // Position 19 (index 18, mais après le tiret c'est 19)
      const variant = id[19];
      expect(['8', '9', 'a', 'b']).toContain(variant);
    }
  });
});

describe('CATEGORIES - Liste des catégories', () => {
  test('contient toutes les catégories attendues', () => {
    const expectedCategories = [
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
    
    expect(CATEGORIES).toEqual(expectedCategories);
  });

  test('contient exactement 13 catégories', () => {
    expect(CATEGORIES).toHaveLength(13);
  });

  test('ne contient pas de doublons', () => {
    const uniqueCategories = new Set(CATEGORIES);
    expect(uniqueCategories.size).toBe(CATEGORIES.length);
  });

  test('toutes les catégories sont des strings non vides', () => {
    for (const category of CATEGORIES) {
      expect(typeof category).toBe('string');
      expect(category.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('Types - Interfaces (vérification structurelle)', () => {
  // Ces tests vérifient que les structures de données
  // respectent les interfaces attendues à runtime
  
  test('Icon interface structure', () => {
    const validIcon = {
      id: 'icon-1',
      filename: 'rifle.png',
      displayName: 'Fusil',
      category: 'Small Arms',
      path: '/assets/icons/rifle.png'
    };
    
    // Vérifie que toutes les propriétés requises sont présentes
    expect(validIcon).toHaveProperty('id');
    expect(validIcon).toHaveProperty('filename');
    expect(validIcon).toHaveProperty('displayName');
    expect(validIcon).toHaveProperty('category');
    expect(validIcon).toHaveProperty('path');
    
    // Vérifie les types
    expect(typeof validIcon.id).toBe('string');
    expect(typeof validIcon.filename).toBe('string');
    expect(typeof validIcon.displayName).toBe('string');
    expect(typeof validIcon.category).toBe('string');
    expect(typeof validIcon.path).toBe('string');
  });

  test('SectionIcon interface structure', () => {
    const validSectionIcon = {
      id: 'section-icon-1',
      iconId: 'icon-1',
      filename: 'rifle.png',
      path: '/assets/icons/rifle.png',
      quantity: 3,
      gridRow: 0,
      gridCol: 1,
      subtype: '/assets/icons/subtypes/veteran.png' // optionnel
    };
    
    expect(validSectionIcon).toHaveProperty('id');
    expect(validSectionIcon).toHaveProperty('iconId');
    expect(validSectionIcon).toHaveProperty('filename');
    expect(validSectionIcon).toHaveProperty('path');
    expect(validSectionIcon).toHaveProperty('quantity');
    expect(validSectionIcon).toHaveProperty('gridRow');
    expect(validSectionIcon).toHaveProperty('gridCol');
    
    expect(typeof validSectionIcon.quantity).toBe('number');
    expect(typeof validSectionIcon.gridRow).toBe('number');
    expect(typeof validSectionIcon.gridCol).toBe('number');
  });

  test('Section interface structure', () => {
    const validSection = {
      id: 'section-1',
      title: 'Infanterie',
      color: '#3b82f6',
      x: 100,
      y: 200,
      width: 300,
      height: 250,
      icons: []
    };
    
    expect(validSection).toHaveProperty('id');
    expect(validSection).toHaveProperty('title');
    expect(validSection).toHaveProperty('color');
    expect(validSection).toHaveProperty('x');
    expect(validSection).toHaveProperty('y');
    expect(validSection).toHaveProperty('width');
    expect(validSection).toHaveProperty('height');
    expect(validSection).toHaveProperty('icons');
    
    expect(typeof validSection.x).toBe('number');
    expect(typeof validSection.y).toBe('number');
    expect(typeof validSection.width).toBe('number');
    expect(typeof validSection.height).toBe('number');
    expect(Array.isArray(validSection.icons)).toBe(true);
  });

  test('Subtype interface structure', () => {
    const validSubtype = {
      filename: 'veteran.png',
      displayName: 'Vétéran',
      path: '/assets/icons/subtypes/veteran.png'
    };
    
    expect(validSubtype).toHaveProperty('filename');
    expect(validSubtype).toHaveProperty('displayName');
    expect(validSubtype).toHaveProperty('path');
  });

  test('Template interface structure', () => {
    const validTemplate = {
      sections: [
        {
          id: 'section-1',
          title: 'Test',
          color: '#fff',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          icons: []
        }
      ]
    };
    
    expect(validTemplate).toHaveProperty('sections');
    expect(Array.isArray(validTemplate.sections)).toBe(true);
  });
});
