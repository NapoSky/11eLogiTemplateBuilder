import {
  aggregateStockpileItems,
  buildBacklineCargo,
  formatLocationLabel,
  missionFits,
  normalizeStockItems,
  renderTransportList,
  suggestCargoPerTrip,
  suggestDepotRole,
  suggestTransportMissions,
  transportSlotsPerTrip,
  upsertStockpileSnapshot,
  usedTransportSlots,
  type StockpileSnapshot,
  type TransportMission,
} from '../services/stockpileLogistics';

function snapshot(overrides: Partial<StockpileSnapshot> = {}): StockpileSnapshot {
  return {
    id: 'snapshot-1',
    header: { location: 'Basin Sionnach - Lamplight - Seaport - 11e', date: '2026.09.20-10.00.00' },
    items: new Map([['7.92mm (Crate)', 20]]),
    label: 'Lamplight',
    depotName: 'Lamplight',
    role: 'intermediate',
    ...overrides,
  };
}

describe('stockpile snapshots', () => {
  test('remplace un relevé ayant le même header.location', () => {
    const previous = snapshot();
    const next = snapshot({
      id: 'new-id',
      header: { location: previous.header!.location, date: '2026.09.20-12.00.00' },
      items: new Map([['7.92mm (Crate)', 60]]),
      depotName: 'Wrong default',
      role: 'backline',
    });

    const result = upsertStockpileSnapshot([previous], next);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('snapshot-1');
    expect(result[0].header?.date).toBe('2026.09.20-12.00.00');
    expect(result[0].items.get('7.92mm (Crate)')).toBe(60);
    expect(result[0].depotName).toBe('Lamplight');
    expect(result[0].role).toBe('intermediate');
  });

  test('ajoute un relevé dont la location est différente', () => {
    const result = upsertStockpileSnapshot([
      snapshot(),
    ], snapshot({ id: 'snapshot-2', header: { location: 'Callahan - Crumbling Post', date: 'now' } }));

    expect(result).toHaveLength(2);
  });

  test('exclut les stocks du front du total calculé', () => {
    const result = aggregateStockpileItems([
      snapshot({ items: new Map([['7.92mm', 20]]) }),
      snapshot({ id: 'front', role: 'front', items: new Map([['7.92mm', 100]]) }),
    ]);

    expect(result.get('7.92mm')).toBe(20);
  });
});

describe('formatLocationLabel', () => {
  test('retire les coordonnées et le nom de la ville (déjà affiché comme nom de dépôt)', () => {
    const location = 'Ash Fields - Ashtown - Port - 11e-ASH-A - X: 0.5363015 Y: 0.4727113';
    expect(formatLocationLabel(location, 'Ashtown')).toBe('Ash Fields - Port - 11e-ASH-A');
  });

  test('ne modifie pas un nom de ville avec une casse différente', () => {
    const location = 'Ash Fields - Ashtown - Port - 11e-ASH-A - X: 0.5363015 Y: 0.4727113';
    expect(formatLocationLabel(location, 'ASHTOWN')).toBe('Ash Fields - Port - 11e-ASH-A');
  });

  test('retombe sur la chaîne sans coordonnées si plus rien ne reste après retrait de la ville', () => {
    const location = 'Ashtown - X: 0.5363015 Y: 0.4727113';
    expect(formatLocationLabel(location, 'Ashtown')).toBe('Ashtown');
  });
});

describe('suggestion de rôle basée sur le contenu du CSV', () => {
  test('au moins 3 types de ressources brutes distincts (chacun ≥50 unités) suggèrent Backline, quel que soit leur ratio', () => {
    const items = new Map([
      ['Basic Materials', 50],
      ['Refined Materials', 60],
      ['Rare Metal', 70],
      ['7.92mm', 3000],
      ['Dunne Transport', 400],
    ]);
    expect(suggestDepotRole(items)).toBe('backline');
  });

  test('des traces de ressources brutes (moins de 50 unités) ne comptent pas pour la règle des 3 types', () => {
    const items = new Map([
      ['Basic Materials', 53],
      ['Refined Materials', 10],
      ['Rare Metal', 11],
      ['7.92mm', 3000],
      ['Dunne Transport', 400],
    ]);
    expect(suggestDepotRole(items)).not.toBe('backline');
  });

  test('moins de 3 types de ressources brutes distincts ne suffit pas à suggérer Backline', () => {
    const items = new Map([
      ['Basic Materials', 1000],
      ['Refined Materials', 500],
      ['7.92mm', 3000],
      ['Dunne Transport', 400],
    ]);
    expect(suggestDepotRole(items)).not.toBe('backline');
  });

  test('reconnaît Explosive Powder (Emat) comme ressource brute au même titre que Bmat/Rmat', () => {
    const items = new Map([
      ['Basic Materials', 400],
      ['Explosive Powder', 300],
      ['Refined Materials', 300],
      ['7.92mm', 2000],
    ]);
    expect(suggestDepotRole(items)).toBe('backline');
  });

  test('reconnaît les ressources brutes même suffixées "(Crate)" (cas réel des exports CSV) et Métal Rare traduit du français', () => {
    const items = new Map([
      ['Basic Materials (Crate)', 110],
      ['Explosive Powder (Crate)', 144],
      ['Heavy Explosive Powder (Crate)', 295],
      ['Métal Rare (Crate)', 153],
      ['Refined Materials (Crate)', 137],
      ['7.92mm (Crate)', 18],
      ['Diesel (Crate)', 100],
      ['Gravel (Crate)', 300],
    ]);
    expect(suggestDepotRole(items)).toBe('backline');
  });

  test('de grosses quantités de caisses variées suggèrent Intermediate', () => {
    const items = new Map([
      ['7.92mm', 3000],
      ['9mm', 2500],
      ['Bandage', 800],
      ['Dunne Transport', 400],
    ]);
    expect(suggestDepotRole(items)).toBe('intermediate');
  });

  test('un peu de tout en petites quantités suggère Front', () => {
    const items = new Map([
      ['7.92mm', 60],
      ['9mm', 40],
      ['Bandage', 20],
    ]);
    expect(suggestDepotRole(items)).toBe('front');
  });

  test('les items à quantité 0 (toujours présents dans un export réel listant tout le catalogue) ne diluent pas la moyenne', () => {
    const items = new Map([
      ['7.92mm', 80],
      ['9mm', 60],
      ['Bandage', 40],
      // Des dizaines d'items à 0, comme dans un vrai export CSV.
      ...Array.from({ length: 200 }, (_, i) => [`Unused item ${i}`, 0] as [string, number]),
    ]);
    expect(suggestDepotRole(items)).toBe('intermediate');
  });

  test('un CSV vide retombe sur Intermediate par défaut', () => {
    expect(suggestDepotRole(new Map())).toBe('intermediate');
  });
});

describe('normalisation des conditionnements', () => {
  test('sépare les caisses et assemblés pour véhicules et shippables', () => {
    const result = normalizeStockItems(new Map([
      ['Dunne Transport', 12],
      ['Dunne Transport (Crate)', 1],
    ]), new Set(['Dunne Transport']));

    expect(result).toEqual([{ itemName: 'Dunne Transport', crates: 1, assembled: 12 }]);
  });

  test('considère les articles standards sans suffixe comme des caisses', () => {
    const result = normalizeStockItems(new Map([
      ['7.92mm', 40],
      ['7.92mm (Crate)', 20],
    ]), new Set());

    expect(result).toEqual([{ itemName: '7.92mm', crates: 60, assembled: 0 }]);
  });

  test('fusionne les noms français et anglais sous le nom anglais', () => {
    const result = normalizeStockItems(new Map([
      ['Resource Container', 2],
      ['Container de ressources', 3],
    ]), new Set(['Resource Container']));

    expect(result).toEqual([{ itemName: 'Resource Container', crates: 0, assembled: 5 }]);
  });
});

describe('capacités de transport', () => {
  const mission: TransportMission = {
    mode: 'freighter',
    tripCount: 1,
    cargo: [
      { itemName: '7.92mm', quantity: 90, kind: 'container-crate' },
      { itemName: 'Dunne Transport', quantity: 2, kind: 'direct-crate' },
      { itemName: 'Balfour Wolfhound 40mm', quantity: 1, kind: 'assembled' },
    ],
  };

  test('compte les conteneurs et les cargaisons directes en slots', () => {
    expect(usedTransportSlots(mission)).toBe(5);
    expect(missionFits(mission)).toBe(true);
  });

  test('applique les capacités flatbed, freighter et train', () => {
    expect(transportSlotsPerTrip({ ...mission, mode: 'flatbed' })).toBe(1);
    expect(transportSlotsPerTrip(mission)).toBe(5);
    expect(transportSlotsPerTrip({ ...mission, mode: 'train', trainCars: 20 })).toBe(14);
  });

  test('exclut par défaut les ressources stratégiques mais autorise les BMat', () => {
    const cargo = buildBacklineCargo(new Map([
      ['Basic Materials', 500],
      ['Heavy Explosive Powder', 10],
      ['Refined Materials', 20],
      ['Rare Metal', 5],
      ['Rare Alloys', 3],
      ['7.92mm (Crate)', 120],
      ['Dunne Transport', 2],
      ['Dunne Transport (Crate)', 1],
    ]), new Set(['Dunne Transport']));

    expect(cargo).toEqual([
      { itemName: '7.92mm', quantity: 120, kind: 'container-crate' },
      { itemName: 'Basic Materials', quantity: 500, kind: 'container-crate' },
      { itemName: 'Dunne Transport', quantity: 1, kind: 'direct-crate' },
      { itemName: 'Dunne Transport', quantity: 2, kind: 'assembled' },
    ]);
  });

  test('accepte une liste personnalisée incluant les BMat', () => {
    const cargo = buildBacklineCargo(new Map([
      ['Basic Materials', 500],
      ['Heavy Explosive Powder', 10],
    ]), new Set(), new Set(['Basic Materials']));

    expect(cargo).toEqual([
      { itemName: 'Heavy Explosive Powder', quantity: 10, kind: 'container-crate' },
    ]);
  });

  test('propose un chargement identique compatible avec chaque voyage', () => {
    const available = [
      { itemName: 'Dunne Transport', quantity: 4, kind: 'direct-crate' as const },
      { itemName: '7.92mm', quantity: 240, kind: 'container-crate' as const },
    ];

    expect(suggestCargoPerTrip(available, 'freighter', 2)).toEqual([
      { itemName: 'Dunne Transport', quantity: 2, kind: 'direct-crate' },
      { itemName: '7.92mm', quantity: 120, kind: 'container-crate' },
    ]);
  });

  test('répartit tout le stock sur plusieurs lignes et regroupe les voyages identiques', () => {
    const missions = suggestTransportMissions([
      { itemName: '7.92mm', quantity: 720, kind: 'container-crate' },
    ], 'freighter');

    expect(missions).toEqual([
      {
        mode: 'freighter',
        tripCount: 2,
        trainCars: undefined,
        cargo: [{ itemName: '7.92mm', quantity: 300, kind: 'container-crate' }],
      },
      {
        mode: 'freighter',
        tripCount: 1,
        trainCars: undefined,
        cargo: [{ itemName: '7.92mm', quantity: 120, kind: 'container-crate' }],
      },
    ]);
    expect(missions.every(missionFits)).toBe(true);
  });
});

describe('export Transport List 11eForge', () => {
  test('respecte markdown, lettres, ligne unique et facteur final', () => {
    const rendered = renderTransportList({
      date: new Date(2026, 1, 25),
      notes: [':exclamation: Weathering Halls = Main stockpile'],
      routes: [{
        source: 'The King',
        destination: "Bastard's Block AirDepot",
        missions: [{
          mode: 'flatbed',
          tripCount: 3,
          cargo: [
            { itemName: 'Quillback Torpedo', quantity: 30, kind: 'container-crate' },
            { itemName: '20mm', quantity: 30, kind: 'container-crate' },
          ],
        }],
      }],
    });

    expect(rendered).toBe(
      '__**TRANSPORT LIST -- 25/02**__\n\n' +
      ':exclamation: Weathering Halls = Main stockpile\n\n' +
      "__The King -> Bastard's Block AirDepot__\n" +
      'A-One flatbed with Quillback Torpedo and 20mm (x3)\n'
    );
  });

  test('reprend à A après Z', () => {
    const mission: TransportMission = {
      mode: 'freighter',
      tripCount: 1,
      cargo: [{ itemName: 'Dunne Transport', quantity: 1, kind: 'direct-crate' }],
    };
    const rendered = renderTransportList({
      date: new Date(2026, 0, 1),
      routes: [{ source: 'A', destination: 'B', missions: Array.from({ length: 27 }, () => mission) }],
    });

    expect(rendered.match(/^A-One freighter/gm)).toHaveLength(2);
    expect(rendered).toContain('Z-One freighter');
  });

  test('sépare une longue cargaison par des virgules avec un seul and final', () => {
    const rendered = renderTransportList({
      date: new Date(2026, 8, 20),
      routes: [{
        source: 'Ashtown',
        destination: 'Cinderwick',
        missions: [{
          mode: 'freighter',
          tripCount: 1,
          cargo: [
            { itemName: '.44 Mag', quantity: 9, kind: 'container-crate' },
            { itemName: 'Dusk', quantity: 9, kind: 'container-crate' },
            { itemName: 'Lionclaw', quantity: 31, kind: 'container-crate' },
            { itemName: 'Pitch Gun', quantity: 3, kind: 'container-crate' },
          ],
        }],
      }],
    });

    expect(rendered).toContain('.44 Mag, Dusk, Lionclaw and Pitch Gun');
    expect(rendered.match(/ and /g)).toHaveLength(1);
  });
});