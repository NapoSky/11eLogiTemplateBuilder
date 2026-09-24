/**
 * Tests de la vue Stockpile
 *
 * Couvre :
 * - parseCSV          : parsing du format CSV Foxhole
 * - buildComparison   : comparaison template ↔ stockpile
 * - iconPathToMappingKey : extraction de la clé depuis un chemin d'icône
 * - isCrateSubtype    : détection du sous-type Crate
 * - StockpileView     : cycle de vie, événements window, localStorage
 */

import { parseCSV, buildComparison, iconPathToMappingKey, isCrateSubtype, StockpileView } from '../components/StockpileView';
import { store } from '../store';
import { Section } from '../types';
import { localStorageMock } from './setup';
import { dismissCautionNotice } from '../services/actionGate';
import { TextDecoder, TextEncoder } from 'util';

// ─── Polyfills jsdom ──────────────────────────────────────────────────────────

// TextDecoder / TextEncoder ne sont pas injectés par défaut dans jsdom
Object.assign(global, { TextDecoder, TextEncoder });

// Blob.prototype.arrayBuffer absent dans les anciennes versions de jsdom
if (typeof Blob.prototype.arrayBuffer === 'undefined') {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', {
    value(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    },
    writable: true,
    configurable: true,
  });
}

// Blob.prototype.text absent dans certaines versions de jsdom
if (typeof Blob.prototype.text === 'undefined') {
  Object.defineProperty(Blob.prototype, 'text', {
    value(this: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    },
    writable: true,
    configurable: true,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Vide la file de microtâches + un tick de macrotâche */
const flushPromises = () => new Promise(r => setTimeout(r, 10));

/**
 * Change le rôle d'un dépôt via sa card. Si plusieurs dépôts partagent déjà
 * son rôle, clique d'abord l'onglet correspondant pour l'activer (seul le
 * dépôt actif d'une card affiche son `.depot-role-select`).
 */
const setDepotRole = (container: HTMLElement, depotName: string, role: string): void => {
  const tab = [...container.querySelectorAll<HTMLButtonElement>('.depot-tab-btn')]
    .find(btn => btn.textContent === depotName);
  tab?.click();
  const select = container.querySelector(`.depot-role-select[data-depot-name="${depotName}"]`) as HTMLSelectElement;
  select.value = role;
  select.dispatchEvent(new Event('change'));
};

/** Sélectionne un hauler dans la modale Transport ouverte (défaut : 'container', abstrait tout véhicule). */
const selectHaulerMode = (mode: string): void => {
  const select = document.querySelector<HTMLSelectElement>('#transport-mode')!;
  select.value = mode;
  select.dispatchEvent(new Event('change'));
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const iconMapping: Record<string, string> = {
  'UI/ItemIcons/RifleCItemIcon.png': 'Argenti r.II Rifle',
  'UI/ItemIcons/MortarItemIcon.png': 'Cremari Mortar',
  'UI/ItemIcons/GrenadeItemIcon.png': 'A3 Harpa Fragmentation Grenade',
};

const makeSection = (overrides: Partial<Section> = {}): Section => ({
  id: 'sec-1',
  title: 'Infanterie',
  color: '#3b82f6',
  x: 0, y: 0, width: 300, height: 200,
  icons: [],
  ...overrides,
});

// ─── parseCSV ────────────────────────────────────────────────────────────────

describe('parseCSV', () => {
  test('parse une ligne de métadonnées et des items', () => {
    const csv = `Foudre Base,2024.01.15-12.30.00\nArgenti r.II Rifle,50\nCremari Mortar,10\n`;
    const { header, items } = parseCSV(csv);

    expect(header).toEqual({ location: 'Foudre Base', date: '2024.01.15-12.30.00' });
    expect(items.get('Argenti r.II Rifle')).toBe(50);
    expect(items.get('Cremari Mortar')).toBe(10);
  });

  test('ignore les lignes vides', () => {
    const csv = `Base Alpha,2024.01.01-00.00.00\n\nRifle A,5\n\nRifle B,3\n`;
    const { items } = parseCSV(csv);
    expect(items.size).toBe(2);
  });

  test('retourne header null si première ligne est un item', () => {
    const csv = `Argenti r.II Rifle,50\n`;
    const { header, items } = parseCSV(csv);
    expect(header).toBeNull();
    expect(items.get('Argenti r.II Rifle')).toBe(50);
  });

  test('normalise les guillemets typographiques', () => {
    const csv = `Base,2024.01.01-00.00.00\nO\u2019Brien\u2019s Rifle,5\n`;
    const { items } = parseCSV(csv);
    expect(items.get("O'Brien's Rifle")).toBe(5);
  });

  test('utilise le dernier séparateur virgule (noms avec virgules)', () => {
    const csv = `Base,2024.01.01-00.00.00\n"Rifle, Type A",12\n`;
    const { items } = parseCSV(csv);
    expect(items.get('"Rifle, Type A"')).toBe(12);
  });

  test('ignore les lignes avec quantité non entière', () => {
    const csv = `Base,2024.01.01-00.00.00\nRifle,abc\n`;
    const { items } = parseCSV(csv);
    expect(items.size).toBe(0);
  });

  test('accepte une quantité de zéro', () => {
    const csv = `Base,2024.01.01-00.00.00\nCremari Mortar,0\n`;
    const { items } = parseCSV(csv);
    expect(items.get('Cremari Mortar')).toBe(0);
  });

  test('fonctionne avec des fins de ligne Windows (CRLF)', () => {
    const csv = `Base,2024.01.01-00.00.00\r\nArgenti r.II Rifle,7\r\n`;
    const { items } = parseCSV(csv);
    expect(items.get('Argenti r.II Rifle')).toBe(7);
  });

  // ── Support des exports CSV en français ──────────────────────────────────

  test('traduit (Caisse) en (Crate)', () => {
    const csv = `Morgen's Crossing,2024.01.15-12.30.00\nNo.2 Loughcaster (Caisse),100\n`;
    const { items } = parseCSV(csv);
    expect(items.get('No.2 Loughcaster (Crate)')).toBe(100);
    expect(items.has('No.2 Loughcaster (Caisse)')).toBe(false);
  });

  test('traduit les noms français en noms anglais', () => {
    const csv = `Base FR,2024.01.15-12.30.00\nFusil Auto Sampo 77 (Caisse),92\n7 92 mm (Caisse),100\nObus de Mortier à Fragmentation (Caisse),6\nChevrotines (Caisse),38\n`;
    const { items } = parseCSV(csv);
    expect(items.get('Sampo Auto-Rifle 77 (Crate)')).toBe(92);
    expect(items.get('7.92mm (Crate)')).toBe(100);
    expect(items.get('Shrapnel Mortar Shell (Crate)')).toBe(6);
    expect(items.get('Buckshot (Crate)')).toBe(38);
  });

  test('les noms identiques FR/EN ne sont pas altérés', () => {
    const csv = `Base,2024.01.01-00.00.00\nBonesaw MK.3 (Caisse),3\nKRN886-127 Gast Machine Gun (Caisse),5\n`;
    const { items } = parseCSV(csv);
    expect(items.get('Bonesaw MK.3 (Crate)')).toBe(3);
    expect(items.get('KRN886-127 Gast Machine Gun (Crate)')).toBe(5);
  });

  test('traduit les véhicules en français', () => {
    const csv = `Base,2024.01.01-00.00.00\nSemi-chenillé Niska Mk. I (Caisse),9\nGrue Mobile BMS de Classe 2 (Caisse),1\n`;
    const { items } = parseCSV(csv);
    expect(items.get('Niska Mk. I Gun Motor Carriage (Crate)')).toBe(9);
    expect(items.get('BMS - Class 2 Mobile Auto-Crane (Crate)')).toBe(1);
  });

  test('traduit le conteneur de ressources en anglais', () => {
    const csv = `Base,2024.01.01-00.00.00\nResource Container,2\nContainer de ressources,3\n`;
    const { items } = parseCSV(csv);

    expect(items.get('Resource Container')).toBe(5);
    expect(items.has('Container de ressources')).toBe(false);
  });

  test('traduit les uniformes en français', () => {
    const csv = `Base,2024.01.01-00.00.00\nManteau de Spécialiste (Caisse),0\nParka Caoivienne (Caisse),60\n`;
    const { items } = parseCSV(csv);
    expect(items.get("Specialist's Overcoat (Crate)")).toBe(0);
    expect(items.get('Caoivish Parka (Crate)')).toBe(60);
  });
});

// ─── isCrateSubtype ───────────────────────────────────────────────────────────

describe('isCrateSubtype', () => {
  test('retourne true pour un path contenant SubtypeCrateIcon.png', () => {
    expect(isCrateSubtype('subtypes/SubtypeCrateIcon.png')).toBe(true);
  });

  test('retourne false pour undefined', () => {
    expect(isCrateSubtype(undefined)).toBe(false);
  });

  test('retourne false pour un sous-type quelconque', () => {
    expect(isCrateSubtype('subtypes/SubtypeAmmoIcon.png')).toBe(false);
  });

  test('retourne false pour une chaîne vide', () => {
    expect(isCrateSubtype('')).toBe(false);
  });
});

// ─── iconPathToMappingKey ────────────────────────────────────────────────────

describe('iconPathToMappingKey', () => {
  test('extrait la clé depuis un chemin /assets/icons/...', () => {
    const result = iconPathToMappingKey('/assets/icons/UI/ItemIcons/RifleCItemIcon.png');
    expect(result).toBe('UI/ItemIcons/RifleCItemIcon.png');
  });

  test('fonctionne si le chemin contient assets/icons/ sans slash initial', () => {
    const result = iconPathToMappingKey('some/prefix/assets/icons/UI/ItemIcons/Foo.png');
    expect(result).toBe('UI/ItemIcons/Foo.png');
  });

  test('retourne le chemin tel quel si pas de assets/icons/', () => {
    const result = iconPathToMappingKey('unknown/path/Foo.png');
    expect(result).toBe('unknown/path/Foo.png');
  });
});

// ─── buildComparison ─────────────────────────────────────────────────────────

describe('buildComparison', () => {
  const makeIcon = (path: string, quantity: number, subtype?: string) => ({
    id: path,
    path: `/assets/icons/${path}`,
    quantity,
    gridRow: 0,
    gridCol: 0,
    subtype,
  });

  test('retourne des rows vides si aucune section', () => {
    const { rows, surplus } = buildComparison([], new Map(), iconMapping, null);
    expect(rows).toHaveLength(0);
    expect(surplus).toHaveLength(0);
  });

  test('status ok si stockpile >= target', () => {
    const section = makeSection({ icons: [makeIcon('UI/ItemIcons/RifleCItemIcon.png', 20)] });
    const csv = new Map([['Argenti r.II Rifle', 25]]);
    const { rows } = buildComparison([section], csv, iconMapping, null);

    expect(rows[0].status).toBe('ok');
    expect(rows[0].stockpileQty).toBe(25);
  });

  test('status partial si 0 < stockpile < target', () => {
    const section = makeSection({ icons: [makeIcon('UI/ItemIcons/RifleCItemIcon.png', 20)] });
    const csv = new Map([['Argenti r.II Rifle', 10]]);
    const { rows } = buildComparison([section], csv, iconMapping, null);

    expect(rows[0].status).toBe('partial');
  });

  test('status missing si stockpile = 0', () => {
    const section = makeSection({ icons: [makeIcon('UI/ItemIcons/RifleCItemIcon.png', 20)] });
    const { rows } = buildComparison([section], new Map(), iconMapping, null);

    expect(rows[0].status).toBe('missing');
    expect(rows[0].stockpileQty).toBe(0);
  });

  test('status ok si quantité cible infinie (targetQty = -1)', () => {
    const section = makeSection({ icons: [makeIcon('UI/ItemIcons/RifleCItemIcon.png', -1)] });
    const { rows } = buildComparison([section], new Map(), iconMapping, null);

    expect(rows[0].status).toBe('ok');
  });

  test('status unknown si icône absente du mapping', () => {
    const section = makeSection({ icons: [makeIcon('UI/ItemIcons/UnknownItem.png', 5)] });
    const { rows } = buildComparison([section], new Map(), iconMapping, null);

    expect(rows[0].status).toBe('unknown');
    expect(rows[0].itemName).toBeNull();
  });

  test('cherche le suffixe (Crate) pour les icônes crate', () => {
    const section = makeSection({
      icons: [makeIcon('UI/ItemIcons/RifleCItemIcon.png', 5, 'subtypes/SubtypeCrateIcon.png')],
    });
    const csv = new Map([['Argenti r.II Rifle (Crate)', 5]]);
    const { rows } = buildComparison([section], csv, iconMapping, null);

    expect(rows[0].isCrateTarget).toBe(true);
    expect(rows[0].status).toBe('ok');
  });

  test('calcule le surplus (items CSV non présents dans le template)', () => {
    const section = makeSection({ icons: [makeIcon('UI/ItemIcons/RifleCItemIcon.png', 10)] });
    const csv = new Map([
      ['Argenti r.II Rifle', 10],
      ['Cremari Mortar', 3],
    ]);
    const { surplus } = buildComparison([section], csv, iconMapping, null);

    expect(surplus).toHaveLength(1);
    expect(surplus[0].itemName).toBe('Cremari Mortar');
    expect(surplus[0].qty).toBe(3);
  });

  test('les items surplus avec qty = 0 ne sont pas inclus', () => {
    const csv = new Map([['Cremari Mortar', 0]]);
    const { surplus } = buildComparison([], csv, iconMapping, null);
    expect(surplus).toHaveLength(0);
  });

  test('le surplus est trié par quantité décroissante', () => {
    const csv = new Map([['Cremari Mortar', 3], ['A3 Harpa Fragmentation Grenade', 12]]);
    const { surplus } = buildComparison([], csv, iconMapping, null);
    expect(surplus[0].qty).toBeGreaterThan(surplus[1].qty);
  });

  test('transmet le header dans le résultat', () => {
    const header = { location: 'Base Alpha', date: '2024.01.01-00.00.00' };
    const { header: resultHeader } = buildComparison([], new Map(), iconMapping, header);
    expect(resultHeader).toEqual(header);
  });
});

// ─── StockpileView — cycle de vie ────────────────────────────────────────────

describe('StockpileView – cycle de vie', () => {
  let container: HTMLElement;
  let view: StockpileView;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    view = new StockpileView();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sections: [] }),
    } as unknown as Response);
  });

  afterEach(() => {
    view.unmount();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('mount affiche un indicateur de chargement puis rend le contenu', async () => {
    view.mount(container);
    expect(container.textContent).toMatch(/Loading/i);
    await flushPromises();
    expect(container.innerHTML).not.toBe('');
  });

  test('les listeners window sont enregistrés au mount et retirés au unmount', () => {
    const addSpy    = jest.spyOn(window, 'addEventListener');
    const removeSpy = jest.spyOn(window, 'removeEventListener');

    view.mount(container);
    const addedEvents = addSpy.mock.calls.map(c => c[0]);
    expect(addedEvents).toContain('stockpile:load-csv');
    expect(addedEvents).toContain('stockpile:clear-csv');
    expect(addedEvents).toContain('stockpile:set-tpl-current');
    expect(addedEvents).toContain('stockpile:set-tpl-official');
    expect(addedEvents).toContain('stockpile:load-tpl');

    view.unmount();
    const removedEvents = removeSpy.mock.calls.map(c => c[0]);
    expect(removedEvents).toContain('stockpile:load-csv');
    expect(removedEvents).toContain('stockpile:clear-csv');
    expect(removedEvents).toContain('stockpile:set-tpl-current');
  });
});

// ─── StockpileView — événements window ───────────────────────────────────────

describe('StockpileView – événements window', () => {
  let container: HTMLElement;
  let view: StockpileView;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    view = new StockpileView();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sections: [] }),
    } as unknown as Response);

    view.mount(container);
    await flushPromises();
  });

  afterEach(() => {
    view.unmount();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('stockpile:clear-csv efface les données CSV et retire les clés localStorage', async () => {
    const csv = `Base,2024.01.01-00.00.00\nArgenti r.II Rifle,10\n`;
    const file = new File([csv], 'test.csv', { type: 'text/csv' });
    window.dispatchEvent(new CustomEvent('stockpile:load-csv', { detail: { file } }));
    await flushPromises();

    window.dispatchEvent(new CustomEvent('stockpile:clear-csv'));
    await flushPromises();

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('stockpile_csv_entries');
  });

  test('stockpile:set-tpl-current met à jour le store', async () => {
    store.setStockpileTplSource('official');
    window.dispatchEvent(new CustomEvent('stockpile:set-tpl-current'));
    await flushPromises();
    expect(store.stockpileTplSource).toBe('current');
  });

  test('stockpile:set-tpl-official déclenche un fetch et met à jour le store', async () => {
    // Le beforeEach monte déjà en mode official — on bascule d'abord en current
    window.dispatchEvent(new CustomEvent('stockpile:set-tpl-current'));
    await flushPromises();
    expect(store.stockpileTplSource).toBe('current');

    const fetchCallsBefore = (global.fetch as jest.Mock).mock.calls.length;
    window.dispatchEvent(new CustomEvent('stockpile:set-tpl-official'));
    await flushPromises();

    expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(fetchCallsBefore);
    expect(store.stockpileTplSource).toBe('official');
  });

  test('stockpile:set-tpl-official-colonial déclenche un fetch et met à jour le store', async () => {
    window.dispatchEvent(new CustomEvent('stockpile:set-tpl-current'));
    await flushPromises();
    expect(store.stockpileTplSource).toBe('current');

    const fetchCallsBefore = (global.fetch as jest.Mock).mock.calls.length;
    window.dispatchEvent(new CustomEvent('stockpile:set-tpl-official-colonial'));
    await flushPromises();

    expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(fetchCallsBefore);
    expect((global.fetch as jest.Mock).mock.calls.at(-1)?.[0]).toEqual(expect.stringContaining('referenceTemplateColonial.json'));
    expect(store.stockpileTplSource).toBe('official-colonial');
  });

  test('stockpile:load-tpl avec JSON valide met à jour le store en mode file', async () => {
    const tpl = JSON.stringify({ sections: [] });
    const file = new File([tpl], 'myTemplate.json', { type: 'application/json' });
    window.dispatchEvent(new CustomEvent('stockpile:load-tpl', { detail: { file } }));
    await flushPromises();

    expect(store.stockpileTplSource).toBe('file');
    expect(store.stockpileTplFileName).toBe('myTemplate.json');
  });

  test('stockpile:load-tpl avec JSON invalide affiche une alerte', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const file = new File(['not-json'], 'bad.json', { type: 'application/json' });
    window.dispatchEvent(new CustomEvent('stockpile:load-tpl', { detail: { file } }));
    await flushPromises();

    expect(alertSpy).toHaveBeenCalledWith('Invalid template JSON');
  });
});

// ─── StockpileView — persistance localStorage ────────────────────────────────

describe('StockpileView – persistance localStorage', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('charge un CSV et persiste les données dans localStorage', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = new StockpileView();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sections: [] }),
    } as unknown as Response);

    view.mount(container);
    await flushPromises();

    const csv = `Bunker Noma,2024.03.10-08.45.00\nArgenti r.II Rifle,15\n`;
    const file = new File([csv], 'stockpile.csv', { type: 'text/csv' });
    window.dispatchEvent(new CustomEvent('stockpile:load-csv', { detail: { file } }));
    await flushPromises();

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'stockpile_csv_entries',
      expect.stringContaining('Argenti r.II Rifle')
    );
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'stockpile_csv_entries',
      expect.stringContaining('Bunker Noma')
    );

    view.unmount();
  });

  test('remplace automatiquement un relevé ayant le même header.location', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = new StockpileView();
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 'UI/VehicleIcons/TruckVehicleIcon.png': 'Dunne Transport' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sections: [makeSection({
            icons: [{
              id: 'dunne',
              iconId: 'dunne',
              filename: 'TruckVehicleIcon.png',
              path: '/assets/icons/UI/VehicleIcons/TruckVehicleIcon.png',
              quantity: 1,
              gridRow: 0,
              gridCol: 0,
            }],
          })],
        }),
      } as unknown as Response);
    view.mount(container);
    await flushPromises();

    window.dispatchEvent(new CustomEvent('stockpile:paste-csv', {
      detail: { text: 'Basin - Lamplight - Seaport - 11e,old\n7.92mm,10' },
    }));
    window.dispatchEvent(new CustomEvent('stockpile:paste-csv', {
      detail: { text: 'Basin - Lamplight - Seaport - 11e,new\n7.92mm,25' },
    }));

    const savedCalls = localStorageMock.setItem.mock.calls.filter(call => call[0] === 'stockpile_csv_entries');
    const saved = JSON.parse(savedCalls.at(-1)?.[1] as string);
    expect(saved).toHaveLength(1);
    expect(saved[0].header.date).toBe('new');
    expect(saved[0].items['7.92mm']).toBe(25);
    view.unmount();
  });
});

describe('StockpileView – dépôts et transport', () => {
  let container: HTMLElement;
  let view: StockpileView;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    view = new StockpileView();
    dismissCautionNotice(); // "Generate Todolist" affiche une notice pédagogique — pas testée ici
    store.setMpfData([
      {
        iconFilename: 'UI/VehicleIcons/TruckVehicleIcon.png',
        itemName: 'Dunne Transport',
        itemCategory: 'vehicles',
        faction: ['neutral'],
        cost: { bmat: 100 },
        numberProduced: 1,
        maxCrates: 5,
      },
      {
        iconFilename: 'UI/StructureIcons/ResourceContainerIcon.png',
        itemName: 'Resource Container',
        itemCategory: 'shipables',
        faction: ['neutral'],
        cost: { bmat: 100 },
        numberProduced: 1,
        maxCrates: 1,
      },
    ]);
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'UI/VehicleIcons/TruckVehicleIcon.png': 'Dunne Transport',
          'UI/ItemIcons/AmmoLightIcon.png': '7.92mm',
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sections: [
            makeSection({
              icons: [{
                id: 'dunne',
                iconId: 'dunne',
                filename: 'TruckVehicleIcon.png',
                path: '/assets/icons/UI/VehicleIcons/TruckVehicleIcon.png',
                quantity: 1,
                gridRow: 0,
                gridCol: 0,
              }],
            }),
            makeSection({
              id: 'sec-2',
              title: 'Munitions',
              color: '#ef4444',
              icons: [{
                id: 'ammo',
                iconId: 'ammo',
                filename: 'AmmoLightIcon.png',
                path: '/assets/icons/UI/ItemIcons/AmmoLightIcon.png',
                quantity: 100,
                gridRow: 0,
                gridCol: 0,
              }],
            }),
          ],
        }),
      } as unknown as Response);
    view.mount(container);
    await flushPromises();
    window.dispatchEvent(new CustomEvent('stockpile:paste-csv', {
      detail: { text: 'Basin - Mercy - Seaport - 11e,now\n7.92mm,10' },
    }));
    window.dispatchEvent(new CustomEvent('stockpile:paste-csv', {
      detail: { text: 'Basin - Kirknell - Storage Depot - 11e,now\n7.92mm,180\nDunne Transport,2\nDunne Transport (Crate),1\nUnlisted Cargo,4' },
    }));
    // Le rôle par défaut est désormais suggéré à partir du contenu du CSV (Kirknell est
    // par défaut "intermediate" au vu de son contenu) : on démote d'abord Kirknell en
    // backline (aucune confirmation requise), puis on promeut Mercy en intermediate
    // (plus aucun autre dépôt intermediate à ce moment, donc pas de confirmation non plus).
    setDepotRole(container, 'Kirknell', 'backline');
    setDepotRole(container, 'Mercy', 'intermediate');
  });

  afterEach(() => {
    view.unmount();
    document.body.innerHTML = '';
  });

  test('affiche séparément les caisses et assemblés dans la vue par dépôt', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    expect(container.textContent).toContain('Transport planning');
    expect(container.textContent).toContain('assembled');
    expect(container.textContent).toContain('Unlisted Cargo');
  });

  test('affiche les colonnes Target et Gap dans la vue Transport planning', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();

    const headerCells = [...container.querySelectorAll('thead th')].map(th => th.textContent?.trim());
    expect(headerCells).toContain('Target');
    expect(headerCells).toContain('Gap(total missing)');
    expect(headerCells).toContain('TotalB+M');

    const dunneRow = [...container.querySelectorAll('tbody tr')]
      .find(tr => tr.textContent?.includes('Dunne Transport'))!;
    const cells = [...dunneRow.querySelectorAll('td')].map(td => td.textContent?.trim());
    // Dunne Transport: target 1, calculated total (Kirknell backline) = 3 -> gap +2
    expect(cells).toContain('1');
    expect(cells).toContain('+2');
  });

  test('conserve les icônes et les sections repliables dans la vue par dépôt', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();

    const section = container.querySelector<HTMLButtonElement>('[data-section-key="Infanterie"]');
    const icon = container.querySelector<HTMLImageElement>('img[src*="TruckVehicleIcon.png"]');
    expect(section).toBeTruthy();
    expect(icon).toBeTruthy();

    section!.click();
    expect(section!.nextElementSibling?.classList.contains('hidden')).toBe(true);
  });

  test('conserve l’ordre des catégories du template malgré le tri par gap', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();

    const sections = [...container.querySelectorAll<HTMLElement>('.section-toggle')]
      .map(section => section.getAttribute('data-section-key'));
    expect(sections.slice(0, 2)).toEqual(['Infanterie', 'Munitions']);
  });

  test('réintègre les filtres globaux et les applique au dépôt intermédiaire', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();

    expect(container.querySelectorAll('.filter-btn')).toHaveLength(4);
    expect(container.querySelector('#btn-sort-gap')).toBeTruthy();
    expect(container.querySelector('#btn-hide-ok')).toBeTruthy();
    expect(container.querySelector('#search-items')).toBeTruthy();

    (container.querySelector('[data-filter="missing"]') as HTMLButtonElement).click();
    expect(container.textContent).toContain('Dunne Transport');
    expect(container.textContent).not.toContain('Unlisted Cargo');
  });

  test('affiche la readiness calculée sur le dépôt intermédiaire', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();

    const readiness = container.querySelector('[data-intermediate-readiness]');
    expect(readiness?.textContent).toContain('Main readiness');
    expect(readiness?.textContent).toContain('⚠ 1');
    expect(readiness?.textContent).toContain('✗ 1');
  });

  test('affiche la répartition Back/Main/Front et le cumul Back+Main dans la vue MPF production needs', () => {
    // Les deux items sont déjà à l'objectif (Backline + Main) : on désactive "Hide OK" pour les voir.
    (container.querySelector('#btn-hide-ok') as HTMLButtonElement).click();

    const dunneRow = [...container.querySelectorAll('tbody tr')]
      .find(tr => tr.textContent?.includes('Dunne Transport'))!;
    const dunneCells = [...dunneRow.querySelectorAll('td')].map(td => td.textContent?.trim());
    // Backline (Kirknell) = 1 crate + 2 assemblés = 3, Main (Mercy) = 0, Front = 0, Stockpile B+M = 3, Target 1, Gap = +2
    expect(dunneCells[1]).toBe('3');
    expect(dunneCells[2]).toBe('0');
    expect(dunneCells[3]).toBe('0');
    expect(dunneCells[4]).toBe('3');
    expect(dunneCells[5]).toBe('1');
    expect(dunneCells[6]).toBe('+2');
    expect(dunneRow.textContent).toContain('OK');

    const ammoRow = [...container.querySelectorAll('tbody tr')]
      .find(tr => tr.textContent?.includes('7.92mm'))!;
    const ammoCells = [...ammoRow.querySelectorAll('td')].map(td => td.textContent?.trim());
    // Backline (Kirknell) = 180, Main (Mercy) = 10, Front = 0, Stockpile B+M = 190, Target 100, Gap = +90
    expect(ammoCells[1]).toBe('180');
    expect(ammoCells[2]).toBe('10');
    expect(ammoCells[3]).toBe('0');
    expect(ammoCells[4]).toBe('190');
    expect(ammoCells[5]).toBe('100');
    expect(ammoCells[6]).toBe('+90');
  });

  test('recalcule la Todolist selon les rôles sélectionnés et mémorise le choix', () => {
    window.dispatchEvent(new CustomEvent('stockpile:paste-csv', {
      detail: { text: 'Basin - Cinderwick - Seaport - 11e,now\nDunne Transport,1' },
    }));
    setDepotRole(container, 'Cinderwick', 'front');

    (container.querySelector('#btn-generate-todolist') as HTMLButtonElement).click();
    // Disable the Backline-deduction feature for this test: it is covered by a
    // dedicated test below and would otherwise zero out the gap via Kirknell's
    // Backline stock, making role-selection assertions harder to read.
    const deductToggle = document.querySelector<HTMLInputElement>('#deduct-backline-toggle');
    if (deductToggle?.checked) {
      deductToggle.checked = false;
      deductToggle.dispatchEvent(new Event('change'));
    }
    let backline = document.querySelector<HTMLInputElement>('.todolist-role-toggle[value="backline"]')!;
    let intermediate = document.querySelector<HTMLInputElement>('.todolist-role-toggle[value="intermediate"]')!;
    let front = document.querySelector<HTMLInputElement>('.todolist-role-toggle[value="front"]')!;
    expect(backline.checked).toBe(false);
    expect(intermediate.checked).toBe(true);
    expect(front.checked).toBe(false);
    expect(document.querySelector('#todolist-role-summary')?.textContent).toContain('Main');
    expect((document.querySelector('#discord-textarea') as HTMLTextAreaElement).value).toContain('Dunne Transport');

    backline.checked = true;
    backline.dispatchEvent(new Event('change'));
    expect((document.querySelector('#discord-textarea') as HTMLTextAreaElement).value).toBe('*(nothing to order)*');

    backline = document.querySelector<HTMLInputElement>('.todolist-role-toggle[value="backline"]')!;
    backline.checked = false;
    backline.dispatchEvent(new Event('change'));
    expect((document.querySelector('#discord-textarea') as HTMLTextAreaElement).value).toContain('Dunne Transport');

    front = document.querySelector<HTMLInputElement>('.todolist-role-toggle[value="front"]')!;
    front.checked = true;
    front.dispatchEvent(new Event('change'));
    expect((document.querySelector('#discord-textarea') as HTMLTextAreaElement).value).toBe('*(nothing to order)*');
    expect(JSON.parse(localStorageMock.getItem('stockpile_calculation_roles')!)).toEqual(['intermediate', 'front']);

    (document.querySelector('#close-shortage-modal') as HTMLButtonElement).click();
    (container.querySelector('#btn-generate-todolist') as HTMLButtonElement).click();
    backline = document.querySelector<HTMLInputElement>('.todolist-role-toggle[value="backline"]')!;
    intermediate = document.querySelector<HTMLInputElement>('.todolist-role-toggle[value="intermediate"]')!;
    front = document.querySelector<HTMLInputElement>('.todolist-role-toggle[value="front"]')!;
    expect([backline.checked, intermediate.checked, front.checked]).toEqual([false, true, true]);
  });

  test('déduit le stock Backline disponible de la production MPF requise', () => {
    window.dispatchEvent(new CustomEvent('stockpile:paste-csv', {
      detail: { text: 'Basin - Cinderwick - Seaport - 11e,now\nDunne Transport,1' },
    }));
    setDepotRole(container, 'Cinderwick', 'front');

    (container.querySelector('#btn-generate-todolist') as HTMLButtonElement).click();

    // Par défaut, la déduction Backline est activée : Kirknell (Backline) a 3
    // Dunne Transport en stock, ce qui couvre entièrement le manque (1) sur
    // l'Intermediate → rien à produire, mais l'item apparaît en "disponible en Backline".
    const deductToggle = document.querySelector<HTMLInputElement>('#deduct-backline-toggle');
    expect(deductToggle?.checked).toBe(true);
    expect((document.querySelector('#discord-textarea') as HTMLTextAreaElement).value).toBe('*(nothing to order)*');
    expect(document.querySelector('#shortage-modal, [data-stock-view], body')?.textContent).toContain('Available in Backline');
    expect(document.body.textContent).toContain('Dunne Transport');

    // Désactiver la déduction : la production MPF redevient nécessaire.
    deductToggle!.checked = false;
    deductToggle!.dispatchEvent(new Event('change'));
    expect((document.querySelector('#discord-textarea') as HTMLTextAreaElement).value).toContain('Dunne Transport');
    expect(localStorageMock.getItem('stockpile_deduct_backline')).toBe('0');
  });

  test('affiche le total de ressources et de caisses nécessaires à la production', () => {
    window.dispatchEvent(new CustomEvent('stockpile:paste-csv', {
      detail: { text: 'Basin - Cinderwick - Seaport - 11e,now\nDunne Transport,1' },
    }));
    setDepotRole(container, 'Cinderwick', 'front');

    (container.querySelector('#btn-generate-todolist') as HTMLButtonElement).click();
    const deductToggle = document.querySelector<HTMLInputElement>('#deduct-backline-toggle');
    if (deductToggle?.checked) {
      deductToggle.checked = false;
      deductToggle.dispatchEvent(new Event('change'));
    }

    // Dunne Transport : 100 Bmats/crate x 5 crates dégressifs (90+80+70+60+50) = 350 Bmats pour 1 ordre.
    expect(document.querySelector('#shortage-modal')?.textContent).toContain('total = 350 Bmats');
    expect(document.querySelector('#shortage-modal')?.textContent).toContain('≈ 4 Bmat crate(s)');
  });

  test('ouvre le préparateur avec une backline et un intermédiaire', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();

    expect(document.querySelector('#transport-modal')).toBeTruthy();
    expect((document.querySelector('#transport-preview') as HTMLTextAreaElement).value).toBe('');
    expect((document.querySelector('#transport-add-line') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('#transport-modal')?.textContent).toContain('Load for this transport');
  });

  test('propose "Container/Shippable" par défaut, sans limite de capacité liée à un véhicule', () => {
    window.dispatchEvent(new CustomEvent('stockpile:paste-csv', {
      detail: { text: 'Basin - Kirknell - Storage Depot - 11e,now\nBasic Materials,400' },
    }));
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();

    const haulerSelect = document.querySelector<HTMLSelectElement>('#transport-mode')!;
    expect(haulerSelect.value).toBe('container');
    expect(haulerSelect.textContent).toContain('Container/Shippable');

    const row = [...document.querySelectorAll('#transport-modal tbody tr')].find(candidate => candidate.textContent?.includes('Basic Materials'))!;
    const maxButton = row.querySelector<HTMLButtonElement>('.transport-qty-max')!;
    const input = row.querySelector<HTMLInputElement>('.transport-qty')!;
    maxButton.click();

    // Aucune limite de véhicule : tout le stock disponible (400) peut être chargé, contrairement au plafond freighter (300).
    expect(input.value).toBe('400');
    expect(document.querySelector('#transport-load-meter')?.textContent).toContain('7 containers');
    expect((document.querySelector('#transport-add-line') as HTMLButtonElement).disabled).toBe(false);

    (document.querySelector('#transport-add-line') as HTMLButtonElement).click();
    // Un container ne mutualise qu'un seul type de caisse (60 max) : chaque item doit apparaître
    // sur sa propre ligne avec le nombre de containers réellement nécessaires (ceil(400/60) = 7).
    expect((document.querySelector('#transport-preview') as HTMLTextAreaElement).value).toMatch(/^A-Container of Basic Materials \(x7\)/m);
  });

  test('fusionne les conteneurs français et anglais dans Prepare transport', () => {
    window.dispatchEvent(new CustomEvent('stockpile:paste-csv', {
      detail: { text: 'Basin - Kirknell - Storage Depot - 11e,now\nResource Container,2\nContainer de ressources,3' },
    }));
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();

    const rows = [...document.querySelectorAll('#transport-modal tbody tr')]
      .filter(row => row.textContent?.includes('Resource Container'));
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('5');
    expect(document.querySelector('#transport-modal')?.textContent).not.toContain('Container de ressources');
  });

  test('filtre les lignes de cargo avec le champ de recherche sans perdre les quantités déjà saisies', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();

    const rowNames = () => [...document.querySelectorAll('#transport-cargo-rows tr')].map(row => row.textContent ?? '');
    expect(rowNames().some(text => text.includes('Dunne Transport'))).toBe(true);
    expect(rowNames().some(text => text.includes('Unlisted Cargo'))).toBe(true);

    // "Dunne Transport" a deux lignes (caisse et assemblé) : on cible la caisse.
    const dunneCrateRow = [...document.querySelectorAll('#transport-cargo-rows tr')]
      .find(row => row.textContent?.includes('Dunne Transport') && row.textContent?.includes('Crated shippable'))!;
    const dunneInput = dunneCrateRow.querySelector<HTMLInputElement>('.transport-qty')!;
    dunneInput.value = '1';
    dunneInput.dispatchEvent(new Event('input'));

    const searchInput = document.querySelector<HTMLInputElement>('#transport-item-search')!;
    searchInput.focus();
    searchInput.value = 'Dunne';
    searchInput.dispatchEvent(new Event('input'));

    // Les deux lignes "Dunne Transport" (caisse + assemblé) restent visibles, "Unlisted Cargo" disparaît.
    expect(rowNames()).toHaveLength(2);
    expect(rowNames().every(text => text.includes('Dunne Transport'))).toBe(true);
    expect(document.querySelector('#transport-summary')?.textContent).toContain('1 units planned');

    // Le champ conserve son focus et sa valeur, la quantité déjà saisie n'est pas perdue.
    expect(document.activeElement).toBe(searchInput);
    const preservedInput = [...document.querySelectorAll('#transport-cargo-rows tr')]
      .find(row => row.textContent?.includes('Crated shippable'))!
      .querySelector<HTMLInputElement>('.transport-qty')!;
    expect(preservedInput.value).toBe('1');

    searchInput.value = 'nothing-matches-this';
    searchInput.dispatchEvent(new Event('input'));
    expect(document.querySelector('#transport-cargo-rows')?.textContent).toContain('No item matches "nothing-matches-this"');
  });

  test('filtre les lignes de cargo par catégorie pour privilégier un type de chargement', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();

    const rowNames = () => [...document.querySelectorAll('#transport-cargo-rows tr')].map(row => row.textContent ?? '');
    const categorySelect = document.querySelector<HTMLSelectElement>('#transport-category-filter')!;

    categorySelect.value = 'assembled';
    categorySelect.dispatchEvent(new Event('change'));
    expect(rowNames()).toHaveLength(1);
    expect(rowNames()[0]).toContain('Dunne Transport');
    expect(rowNames()[0]).toContain('Assembled shippable');

    categorySelect.value = 'container-crate';
    categorySelect.dispatchEvent(new Event('change'));
    expect(rowNames().some(text => text.includes('7.92mm'))).toBe(true);
    expect(rowNames().some(text => text.includes('Unlisted Cargo'))).toBe(true);
    expect(rowNames().every(text => !text.includes('Assembled shippable') && !text.includes('Crated shippable'))).toBe(true);

    categorySelect.value = 'all';
    categorySelect.dispatchEvent(new Event('change'));
    expect(rowNames().some(text => text.includes('Dunne Transport'))).toBe(true);
    expect(rowNames().some(text => text.includes('7.92mm'))).toBe(true);
  });

  test('propose une section de catégories Foxhole (Small Arms, Vehicles...) en plus du type de stockage', () => {
    store.setIcons([
      { id: 'ammo', filename: 'AmmoLightIcon.png', displayName: '7.92mm', category: 'Small Arms', path: '/x' },
      { id: 'dunne', filename: 'TruckVehicleIcon.png', displayName: 'Dunne Transport', category: 'Vehicles', path: '/y' },
    ]);
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();

    const rowNames = () => [...document.querySelectorAll('#transport-cargo-rows tr')].map(row => row.textContent ?? '');
    const categorySelect = document.querySelector<HTMLSelectElement>('#transport-category-filter')!;
    const optionValues = [...categorySelect.querySelectorAll('option')].map(option => option.value);
    expect(optionValues).toContain('Small Arms');
    expect(optionValues).toContain('Vehicles');
    // Les catégories de jeu sans stock correspondant ne sont pas proposées (évite les choix qui ne mènent nulle part).
    expect(optionValues).not.toContain('Naval');

    categorySelect.value = 'Small Arms';
    categorySelect.dispatchEvent(new Event('change'));
    expect(rowNames().every(text => text.includes('7.92mm'))).toBe(true);
    expect(rowNames().some(text => text.includes('Dunne Transport'))).toBe(false);

    categorySelect.value = 'Vehicles';
    categorySelect.dispatchEvent(new Event('change'));
    expect(rowNames().every(text => text.includes('Dunne Transport'))).toBe(true);
    expect(rowNames().some(text => text.includes('7.92mm'))).toBe(false);

    categorySelect.value = 'all';
    categorySelect.dispatchEvent(new Event('change'));
    expect(rowNames().some(text => text.includes('Dunne Transport'))).toBe(true);
    expect(rowNames().some(text => text.includes('7.92mm'))).toBe(true);
  });

  test('applique et persiste les exclusions de transport personnalisées', () => {
    window.dispatchEvent(new CustomEvent('stockpile:paste-csv', {
      detail: { text: 'Basin - Kirknell - Storage Depot - 11e,now\nBasic Materials,500\nHeavy Explosive Powder,10\nRefined Materials,20\nRare Metal,5\nRare Alloys,3\n7.92mm,60' },
    }));
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();

    const bmatToggle = document.querySelector<HTMLInputElement>('.transport-exclusion-toggle[value="Basic Materials"]')!;
    expect(bmatToggle.checked).toBe(false);
    expect(document.querySelector<HTMLInputElement>('.transport-exclusion-toggle[value="Heavy Explosive Powder"]')!.checked).toBe(true);
    expect([...document.querySelectorAll('#transport-modal tbody tr')].some(row => row.textContent?.includes('Basic Materials'))).toBe(true);
    expect([...document.querySelectorAll('#transport-modal tbody tr')].some(row => row.textContent?.includes('Heavy Explosive Powder'))).toBe(false);

    bmatToggle.checked = true;
    bmatToggle.dispatchEvent(new Event('change'));

    expect([...document.querySelectorAll('#transport-modal tbody tr')].some(row => row.textContent?.includes('Basic Materials'))).toBe(false);
    expect(JSON.parse(localStorageMock.getItem('stockpile_transport_exclusions')!)).toContain('Basic Materials');

    (document.querySelector('#transport-close') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();
    expect(document.querySelector<HTMLInputElement>('.transport-exclusion-toggle[value="Basic Materials"]')!.checked).toBe(true);
  });

  test('le bouton Max charge la quantité la plus haute possible sans dépasser la capacité du transport', () => {
    window.dispatchEvent(new CustomEvent('stockpile:paste-csv', {
      detail: { text: 'Basin - Kirknell - Storage Depot - 11e,now\nBasic Materials,400' },
    }));
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();
    selectHaulerMode('freighter');

    const row = [...document.querySelectorAll('#transport-modal tbody tr')].find(candidate => candidate.textContent?.includes('Basic Materials'))!;
    const maxButton = row.querySelector<HTMLButtonElement>('.transport-qty-max')!;
    const input = row.querySelector<HTMLInputElement>('.transport-qty')!;

    maxButton.click();

    // 5 slots freighter x 60 caisses/slot = 300, malgré les 400 caisses disponibles en stock.
    expect(input.value).toBe('300');
    expect(document.querySelector('#transport-load-meter')?.textContent).toContain('5/5 used');
    expect((document.querySelector('#transport-add-line') as HTMLButtonElement).disabled).toBe(false);
  });

  test('planifie automatiquement tout le cargo sur plusieurs lignes', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();
    selectHaulerMode('freighter');
    (document.querySelector('#transport-auto-fill-all') as HTMLButtonElement).click();

    const preview = (document.querySelector('#transport-preview') as HTMLTextAreaElement).value;
    expect(document.querySelectorAll('.transport-remove-line')).toHaveLength(2);
    expect(preview).toMatch(/^A-One freighter/m);
    expect(preview).toMatch(/^B-One freighter/m);
  });

  test('propose d\'annuler le plan automatique en un clic, uniquement après avoir planifié automatiquement', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();
    selectHaulerMode('freighter');

    expect(document.querySelector('#transport-undo-auto-fill')).toBeNull();

    (document.querySelector('#transport-auto-fill-all') as HTMLButtonElement).click();
    expect(document.querySelectorAll('.transport-remove-line')).toHaveLength(2);
    expect(document.querySelector('#transport-undo-auto-fill')).toBeTruthy();

    (document.querySelector('#transport-undo-auto-fill') as HTMLButtonElement).click();
    expect(document.querySelectorAll('.transport-remove-line')).toHaveLength(0);
    expect(document.querySelector('#transport-undo-auto-fill')).toBeNull();
  });

  test('masque le bouton Undo dès qu\'une ligne est modifiée manuellement après le plan automatique', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();
    (document.querySelector('#transport-auto-fill-all') as HTMLButtonElement).click();
    expect(document.querySelector('#transport-undo-auto-fill')).toBeTruthy();

    (document.querySelector('.transport-remove-line') as HTMLButtonElement).click();
    expect(document.querySelector('#transport-undo-auto-fill')).toBeNull();
  });

  test('permet d’ajouter plusieurs lignes manuellement', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();
    selectHaulerMode('freighter');

    let quantity = document.querySelector<HTMLInputElement>('.transport-qty')!;
    quantity.value = '60';
    quantity.dispatchEvent(new Event('input'));
    (document.querySelector('#transport-add-line') as HTMLButtonElement).click();

    quantity = document.querySelector<HTMLInputElement>('.transport-qty')!;
    quantity.value = '60';
    quantity.dispatchEvent(new Event('input'));
    (document.querySelector('#transport-add-line') as HTMLButtonElement).click();

    expect(document.querySelectorAll('.transport-remove-line')).toHaveLength(2);
    expect((document.querySelector('#transport-preview') as HTMLTextAreaElement).value).toMatch(/^B-One freighter/m);
  });

  test('affiche en temps réel le remplissage et prévient pour un conteneur incomplet', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();
    selectHaulerMode('freighter');

    const quantity = document.querySelector<HTMLInputElement>('.transport-qty')!;
    quantity.value = '61';
    quantity.dispatchEvent(new Event('input'));

    expect(document.querySelector('#transport-load-meter')?.textContent).toContain('2/5 used');
    expect(document.querySelector('[data-container-warning]')?.textContent).toContain('Incomplete container: 1/60 crates.');
    expect((document.querySelector('#transport-add-line') as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector('#transport-load-meter')?.previousElementSibling?.classList.contains('overflow-y-auto')).toBe(true);
  });

  test('affiche le contenu de chaque slot au survol via un tooltip custom (pas le title natif)', () => {
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();
    selectHaulerMode('freighter');

    const ammoRow = [...document.querySelectorAll('#transport-cargo-rows tr')].find(row => row.textContent?.includes('7.92mm'))!;
    const ammoInput = ammoRow.querySelector<HTMLInputElement>('.transport-qty')!;
    ammoInput.value = '61';
    ammoInput.dispatchEvent(new Event('input'));

    const dunneCrateRow = [...document.querySelectorAll('#transport-cargo-rows tr')]
      .find(row => row.textContent?.includes('Dunne Transport') && row.textContent?.includes('Crated shippable'))!;
    const dunneInput = dunneCrateRow.querySelector<HTMLInputElement>('.transport-qty')!;
    dunneInput.value = '1';
    dunneInput.dispatchEvent(new Event('input'));

    // Aucun tooltip natif : les slots portent un data-attribute, pas un `title`.
    const slotSpans = [...document.querySelectorAll<HTMLElement>('#transport-load-meter [data-tooltip]')];
    expect(document.querySelectorAll('#transport-load-meter [title]')).toHaveLength(0);
    const tooltip = document.querySelector<HTMLElement>('#transport-slot-tooltip')!;
    expect(tooltip.classList.contains('hidden')).toBe(true);

    const shippableSlot = slotSpans.find(span => span.textContent?.includes('Shippable'))!;
    shippableSlot.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(tooltip.classList.contains('hidden')).toBe(false);
    expect(tooltip.textContent).toContain('Dunne Transport');

    shippableSlot.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    expect(tooltip.classList.contains('hidden')).toBe(true);

    const fullContainerSlot = slotSpans.find(span => span.textContent?.includes('60/60'))!;
    fullContainerSlot.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(tooltip.textContent).toContain('60 7.92mm');

    const partialContainerSlot = slotSpans.find(span => span.textContent?.includes('1/60'))!;
    partialContainerSlot.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(tooltip.textContent).toContain('1 7.92mm');

    (document.querySelector('#transport-close') as HTMLButtonElement).click();
    expect(document.querySelector('#transport-slot-tooltip')).toBeNull();
  });

  test('cumule une route backline vers intermédiaire et une route intermédiaire vers front', () => {
    window.dispatchEvent(new CustomEvent('stockpile:paste-csv', {
      detail: { text: 'Basin - Cinderwick - Seaport - 11e,now\n7.92mm,2' },
    }));
    setDepotRole(container, 'Cinderwick', 'front');

    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();
    selectHaulerMode('freighter');
    (document.querySelector('#transport-auto-fill-all') as HTMLButtonElement).click();

    const source = document.querySelector('#transport-source') as HTMLSelectElement;
    source.value = 'Mercy';
    source.dispatchEvent(new Event('change'));
    const destination = document.querySelector('#transport-destination') as HTMLSelectElement;
    destination.value = 'Cinderwick';
    destination.dispatchEvent(new Event('change'));

    const quantity = document.querySelector<HTMLInputElement>('.transport-qty')!;
    quantity.value = '10';
    quantity.dispatchEvent(new Event('input'));
    (document.querySelector('#transport-add-line') as HTMLButtonElement).click();

    const preview = (document.querySelector('#transport-preview') as HTMLTextAreaElement).value;
    expect(preview).toContain('__Kirknell -> Mercy__');
    expect(preview).toContain('__Mercy -> Cinderwick__');
    expect(document.querySelectorAll('.transport-remove-line')).toHaveLength(3);
  });

  test('demande confirmation avant de rétrograder l’ancien dépôt intermédiaire', async () => {
    const tab = [...container.querySelectorAll<HTMLButtonElement>('.depot-tab-btn')]
      .find(btn => btn.textContent === 'Kirknell');
    tab?.click();
    const select = container.querySelector('.depot-role-select[data-depot-name="Kirknell"]') as HTMLSelectElement;
    select.value = 'intermediate';
    select.dispatchEvent(new Event('change'));

    const confirmDialogEl = document.querySelector('#confirm-dialog-ok') as HTMLButtonElement;
    expect(confirmDialogEl).toBeTruthy();
    confirmDialogEl.click();
    await flushPromises();

    const intermediateRoles = [...container.querySelectorAll<HTMLSelectElement>('.depot-role-select')]
      .filter(s => s.value === 'intermediate');
    expect(intermediateRoles).toHaveLength(1);
    expect(intermediateRoles[0].getAttribute('data-depot-name')).toBe('Kirknell');
  });

  test('annuler la confirmation ne modifie aucun rôle', async () => {
    const tab = [...container.querySelectorAll<HTMLButtonElement>('.depot-tab-btn')]
      .find(btn => btn.textContent === 'Kirknell');
    tab?.click();
    const select = container.querySelector('.depot-role-select[data-depot-name="Kirknell"]') as HTMLSelectElement;
    select.value = 'intermediate';
    select.dispatchEvent(new Event('change'));

    (document.querySelector('#confirm-dialog-cancel') as HTMLButtonElement).click();
    await flushPromises();

    expect(select.value).toBe('backline');
    const intermediateRoles = [...container.querySelectorAll<HTMLSelectElement>('.depot-role-select')]
      .filter(s => s.value === 'intermediate');
    expect(intermediateRoles).toHaveLength(1);
    expect(intermediateRoles[0].getAttribute('data-depot-name')).toBe('Mercy');
  });
});
