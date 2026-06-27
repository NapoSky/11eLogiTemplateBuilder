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
});
