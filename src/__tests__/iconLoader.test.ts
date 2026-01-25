/**
 * Tests du service iconLoader
 * 
 * Ces tests vérifient le chargement des icônes et des subtypes
 * depuis les fichiers JSON de mapping.
 */

// Mock fetch global
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Pour réinitialiser le cache entre les tests
let loadIcons: typeof import('../services/iconLoader').loadIcons;
let loadSubtypes: typeof import('../services/iconLoader').loadSubtypes;

beforeEach(async () => {
  mockFetch.mockReset();
  // Réinitialiser le module pour vider le cache
  jest.resetModules();
  const module = await import('../services/iconLoader');
  loadIcons = module.loadIcons;
  loadSubtypes = module.loadSubtypes;
});

describe('loadIcons - Chargement des icônes', () => {
  test('charge et transforme correctement les icônes', async () => {
    // Premier appel: categoryMapping.json
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({
          'Small Arms': { items: ['rifle.png', 'pistol.png'] },
          'Vehicles': { items: ['tank.png'] }
        })
      })
      // Deuxième appel: iconMapping.json
      .mockResolvedValueOnce({
        json: async () => ({
          'rifle.png': 'Fusil',
          'pistol.png': 'Pistolet',
          'tank.png': 'Tank Lourd'
        })
      });

    const icons = await loadIcons();

    expect(icons).toHaveLength(3);
    
    const rifle = icons.find(i => i.filename === 'rifle.png');
    expect(rifle).toBeDefined();
    expect(rifle?.displayName).toBe('Fusil');
    expect(rifle?.category).toBe('Small Arms');
    
    const tank = icons.find(i => i.filename === 'tank.png');
    expect(tank?.category).toBe('Vehicles');
  });

  test('ignore les entrées _comment dans iconMapping', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({
          'Small Arms': { items: ['rifle.png'] }
        })
      })
      .mockResolvedValueOnce({
        json: async () => ({
          '_comment_1': 'Ceci est un commentaire',
          'rifle.png': 'Fusil'
        })
      });

    const icons = await loadIcons();

    // Vérifie que le commentaire n'a pas été chargé comme icône
    expect(icons).toHaveLength(1);
    expect(icons.some(i => i.filename === '_comment_1')).toBe(false);
    expect(icons[0].displayName).toBe('Fusil');
  });

  test('utilise Resources comme fallback pour icône non mappée dans categoryMapping', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({
          'Small Arms': { items: ['rifle.png'] }
          // Note: unknown.png n'est pas dans ce mapping
        })
      })
      .mockResolvedValueOnce({
        json: async () => ({
          'rifle.png': 'Fusil',
          'unknown.png': 'Icône Inconnue'  // Dans iconMapping mais pas dans categoryMapping
        })
      });

    // Capture console.warn pour vérifier le fallback
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const icons = await loadIcons();

    // L'icône unknown.png devrait avoir la catégorie fallback 'Resources'
    const unknown = icons.find(i => i.filename === 'unknown.png');
    expect(unknown).toBeDefined();
    expect(unknown?.category).toBe('Resources');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('unknown.png'));
    
    consoleSpy.mockRestore();
  });

  test('gère les sous-dossiers dans les chemins d\'icônes', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({
          'Vehicles': { items: ['VehicleIcons/tank.png'] }
        })
      })
      .mockResolvedValueOnce({
        json: async () => ({
          'VehicleIcons/tank.png': 'Tank'
        })
      });

    const icons = await loadIcons();

    expect(icons[0].path).toContain('VehicleIcons/tank.png');
  });
});

describe('loadSubtypes - Chargement des subtypes', () => {
  test('charge et transforme correctement les subtypes', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        'veteran.png': 'Vétéran',
        'elite.png': 'Élite'
      })
    });

    const subtypes = await loadSubtypes();

    expect(subtypes).toHaveLength(2);
    expect(subtypes[0].filename).toBe('veteran.png');
    expect(subtypes[0].displayName).toBe('Vétéran');
    expect(subtypes[0].path).toContain('subtypes/veteran.png');
  });

  test('retourne un tableau vide pour un mapping vide', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({})
    });

    const subtypes = await loadSubtypes();

    expect(subtypes).toHaveLength(0);
  });
});
