/**
 * Tests complémentaires du Store - couvrent les zones non testées :
 * - Background (setBackground, setBackgroundPresets, persistance)
 * - TodoList (CRUD items, faction, order count, clear, replace)
 * - TextBlock (add, update, remove)
 * - viewMode + mpfData
 * - filteredIcons en mode todolist
 * - load() : background + viewMode persistés
 * - importJSON avec background
 */

import { store } from '../store';
import {
  Icon,
  MpfDataEntry,
  TemplateBackground,
  BackgroundPreset,
  DEFAULT_BACKGROUND,
} from '../types';

function resetAll() {
  while (store.sections.length > 0) {
    store.deleteSection(store.sections[0].id);
  }
  store.setIcons([]);
  store.setSubtypes([]);
  store.setCategory('Toutes');
  store.setSearch('');
  store.setMpfData([]);
  store.setBackgroundPresets([]);
  store.setBackground(DEFAULT_BACKGROUND);
  store.clearTodoList();
  // setViewMode early-returns si identique : on bascule pour reset si besoin.
  if (store.viewMode !== 'template') {
    store.setViewMode('template');
  }
}

beforeEach(() => {
  localStorage.clear();
  resetAll();
  localStorage.clear();
});

// ============================================================
// Background
// ============================================================

describe('Store - Background', () => {
  test('setBackground accepte une couleur valide', () => {
    const bg: TemplateBackground = { kind: 'color', color: '#ff0000' };
    store.setBackground(bg);
    expect(store.background).toEqual(bg);
    expect(localStorage.getItem('templateBackground')).toBe(JSON.stringify(bg));
  });

  test('setBackground accepte un preset', () => {
    const bg: TemplateBackground = { kind: 'preset', path: '/assets/backgrounds/foo.png' };
    store.setBackground(bg);
    expect(store.background).toEqual(bg);
  });

  test('setBackground accepte un upload (data URL)', () => {
    const bg: TemplateBackground = { kind: 'upload', dataUrl: 'data:image/png;base64,AAA' };
    store.setBackground(bg);
    expect(store.background).toEqual(bg);
  });

  test('setBackground accepte une URL https', () => {
    const bg: TemplateBackground = { kind: 'url', url: 'https://example.com/img.png' };
    store.setBackground(bg);
    expect(store.background).toEqual(bg);
  });

  test('setBackground rejette un background invalide', () => {
    const before = store.background;
    // @ts-expect-error - test runtime invalide
    store.setBackground({ kind: 'color' });
    expect(store.background).toEqual(before);
  });

  test('setBackground gère une exception localStorage (quota)', () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    const bg: TemplateBackground = { kind: 'color', color: '#abcdef' };
    expect(() => store.setBackground(bg)).not.toThrow();
    expect(store.background).toEqual(bg);
    setItemSpy.mockRestore();
  });

  test('setBackgroundPresets met à jour la liste et émet', () => {
    const listener = jest.fn();
    const unsub = store.subscribe(listener);
    const presets: BackgroundPreset[] = [
      { name: 'A', path: '/a.png' },
      { name: 'B', path: '/b.png' },
    ];
    store.setBackgroundPresets(presets);
    expect(store.backgroundPresets).toEqual(presets);
    expect(listener).toHaveBeenCalled();
    unsub();
  });
});

// ============================================================
// viewMode + mpfData
// ============================================================

describe('Store - viewMode et mpfData', () => {
  test('setViewMode bascule en mode todolist et persiste', () => {
    store.setViewMode('todolist');
    expect(store.viewMode).toBe('todolist');
    expect(localStorage.getItem('viewMode')).toBe('todolist');
  });

  test('setViewMode appelé avec le même mode est un no-op (pas d\'émission)', () => {
    store.setViewMode('todolist');
    const listener = jest.fn();
    const unsub = store.subscribe(listener);
    store.setViewMode('todolist');
    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  test('setMpfData stocke les données et émet', () => {
    const listener = jest.fn();
    const unsub = store.subscribe(listener);
    const data: MpfDataEntry[] = [
      {
        iconFilename: 'rifle.png',
        itemName: 'Rifle',
        itemCategory: 'small_arms',
        faction: ['neutral'],
        cost: { bmat: 50 },
        numberProduced: 8,
        maxCrates: 9,
      },
    ];
    store.setMpfData(data);
    expect(store.mpfData).toEqual(data);
    expect(listener).toHaveBeenCalled();
    unsub();
  });
});

// ============================================================
// TodoList - items
// ============================================================

describe('Store - TodoList items', () => {
  const mpfRifle: MpfDataEntry = {
    iconFilename: 'rifle.png',
    itemName: 'Rifle',
    itemCategory: 'small_arms',
    faction: ['neutral'],
    cost: { bmat: 50 },
    numberProduced: 8,
    maxCrates: 9,
  };
  const mpfWardenOnly: MpfDataEntry = {
    iconFilename: 'warden.png',
    itemName: 'Warden Gun',
    itemCategory: 'small_arms',
    faction: ['warden'],
    cost: { bmat: 60 },
    numberProduced: 6,
    maxCrates: 9,
  };

  beforeEach(() => {
    store.setMpfData([mpfRifle, mpfWardenOnly]);
  });

  test('setTodoListTitle met à jour le titre et persiste', () => {
    store.setTodoListTitle('Mon plan');
    expect(store.todolist.title).toBe('Mon plan');
    const raw = localStorage.getItem('todolist');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).title).toBe('Mon plan');
  });

  test('setTodoListAutoDate met à jour le flag', () => {
    store.setTodoListAutoDate(false);
    expect(store.todolist.autoDate).toBe(false);
  });

  test('setTodoListFaction met à jour la faction', () => {
    store.setTodoListFaction('warden');
    expect(store.todolist.faction).toBe('warden');
  });

  test('addTodoListItemFromIcon retourne "not-mpf" si non craftable', () => {
    expect(store.addTodoListItemFromIcon('inconnu.png')).toBe('not-mpf');
    expect(store.todolist.items).toHaveLength(0);
  });

  test('addTodoListItemFromIcon retourne "wrong-faction" si filtre incompatible', () => {
    store.setTodoListFaction('colonial');
    expect(store.addTodoListItemFromIcon('warden.png')).toBe('wrong-faction');
    expect(store.todolist.items).toHaveLength(0);
  });

  test('addTodoListItemFromIcon ajoute un nouvel item', () => {
    expect(store.addTodoListItemFromIcon('rifle.png')).toBe('added');
    expect(store.todolist.items).toHaveLength(1);
    expect(store.todolist.items[0].orderCount).toBe(1);
  });

  test('addTodoListItemFromIcon incrémente orderCount si l\'item existe déjà', () => {
    store.addTodoListItemFromIcon('rifle.png');
    expect(store.addTodoListItemFromIcon('rifle.png')).toBe('added');
    expect(store.todolist.items).toHaveLength(1);
    expect(store.todolist.items[0].orderCount).toBe(2);
  });

  test('setTodoListOrderCount applique floor et minimum 1', () => {
    store.addTodoListItemFromIcon('rifle.png');
    const id = store.todolist.items[0].id;

    store.setTodoListOrderCount(id, 5.7);
    expect(store.todolist.items[0].orderCount).toBe(5);

    store.setTodoListOrderCount(id, 0);
    expect(store.todolist.items[0].orderCount).toBe(1);

    store.setTodoListOrderCount(id, -10);
    expect(store.todolist.items[0].orderCount).toBe(1);
  });

  test('removeTodoListItem supprime l\'item ciblé', () => {
    store.addTodoListItemFromIcon('rifle.png');
    const id = store.todolist.items[0].id;
    store.removeTodoListItem(id);
    expect(store.todolist.items).toHaveLength(0);
  });

  test('reorderTodoListItems réordonne dans une catégorie et conserve les manquants', () => {
    store.setMpfData([
      { ...mpfRifle, iconFilename: 'a.png' },
      { ...mpfRifle, iconFilename: 'b.png' },
      { ...mpfRifle, iconFilename: 'c.png' },
      { ...mpfRifle, iconFilename: 'v.png', itemCategory: 'vehicles' },
    ]);
    store.addTodoListItemFromIcon('a.png');
    store.addTodoListItemFromIcon('b.png');
    store.addTodoListItemFromIcon('c.png');
    store.addTodoListItemFromIcon('v.png');

    const items = store.todolist.items;
    const aId = items.find(i => i.iconFilename === 'a.png')!.id;
    const bId = items.find(i => i.iconFilename === 'b.png')!.id;
    // Réordonner small_arms : on omet volontairement c.png (devra être conservé en fin)
    store.reorderTodoListItems('small_arms', [bId, aId]);

    const smallArms = store.todolist.items.filter(i => i.category === 'small_arms');
    expect(smallArms.map(i => i.iconFilename)).toEqual(['b.png', 'a.png', 'c.png']);
    // L'item vehicles est conservé
    expect(store.todolist.items.find(i => i.iconFilename === 'v.png')).toBeDefined();
  });

  test('clearTodoList remet la todolist à son état par défaut', () => {
    store.setTodoListTitle('X');
    store.addTodoListItemFromIcon('rifle.png');
    store.clearTodoList();
    expect(store.todolist.title).toBe('TODOLIST');
    expect(store.todolist.items).toHaveLength(0);
    expect(store.todolist.faction).toBe('all');
  });

  test('replaceTodoList remplace contenu mais conserve la faction courante', () => {
    store.setTodoListFaction('warden');
    store.replaceTodoList({
      title: 'Nouveau',
      autoDate: false,
      items: [
        {
          id: 'x',
          iconFilename: 'rifle.png',
          itemName: 'Rifle',
          category: 'small_arms',
          faction: ['neutral'],
          cost: { bmat: 50 },
          maxCrates: 9,
          numberProduced: 8,
          orderCount: 3,
        },
      ],
      textBlocks: [],
    });
    expect(store.todolist.title).toBe('Nouveau');
    expect(store.todolist.autoDate).toBe(false);
    expect(store.todolist.items).toHaveLength(1);
    expect(store.todolist.faction).toBe('warden');
  });
});

// ============================================================
// TextBlocks
// ============================================================

describe('Store - TextBlocks', () => {
  test('addTextBlock crée un bloc et retourne son id', () => {
    const id = store.addTextBlock({ kind: 'top' });
    expect(typeof id).toBe('string');
    expect(store.todolist.textBlocks).toHaveLength(1);
    expect(store.todolist.textBlocks[0].id).toBe(id);
    expect(store.todolist.textBlocks[0].anchor).toEqual({ kind: 'top' });
  });

  test('updateTextBlock met à jour content et anchor', () => {
    const id = store.addTextBlock({ kind: 'top' });
    store.updateTextBlock(id, { content: 'Hello' });
    expect(store.todolist.textBlocks[0].content).toBe('Hello');

    store.updateTextBlock(id, { anchor: { kind: 'footer' } });
    expect(store.todolist.textBlocks[0].anchor).toEqual({ kind: 'footer' });
  });

  test('removeTextBlock supprime le bloc', () => {
    const id1 = store.addTextBlock({ kind: 'top' });
    const id2 = store.addTextBlock({ kind: 'footer' });
    store.removeTextBlock(id1);
    expect(store.todolist.textBlocks).toHaveLength(1);
    expect(store.todolist.textBlocks[0].id).toBe(id2);
  });
});

// ============================================================
// filteredIcons en mode todolist
// ============================================================

describe('Store - filteredIcons en mode todolist', () => {
  const icons: Icon[] = [
    { id: '1', filename: 'rifle.png', displayName: 'Rifle', category: 'Small Arms', path: '/r.png' },
    { id: '2', filename: 'warden.png', displayName: 'Warden Gun', category: 'Small Arms', path: '/w.png' },
    { id: '3', filename: 'colonial.png', displayName: 'Colonial Gun', category: 'Small Arms', path: '/c.png' },
    { id: '4', filename: 'noncraft.png', displayName: 'Decor', category: 'Structures', path: '/d.png' },
  ];
  const mpf: MpfDataEntry[] = [
    {
      iconFilename: 'rifle.png',
      itemName: 'Rifle',
      itemCategory: 'small_arms',
      faction: ['neutral'],
      cost: { bmat: 50 },
      numberProduced: 8,
      maxCrates: 9,
    },
    {
      iconFilename: 'warden.png',
      itemName: 'W',
      itemCategory: 'small_arms',
      faction: ['warden'],
      cost: { bmat: 50 },
      numberProduced: 8,
      maxCrates: 9,
    },
    {
      iconFilename: 'colonial.png',
      itemName: 'C',
      itemCategory: 'small_arms',
      faction: ['colonial'],
      cost: { bmat: 50 },
      numberProduced: 8,
      maxCrates: 9,
    },
  ];

  beforeEach(() => {
    store.setIcons(icons);
    store.setMpfData(mpf);
    store.setViewMode('todolist');
  });

  test('mode todolist + faction "all" : seules les craftables sont visibles', () => {
    store.setTodoListFaction('all');
    const fnames = store.filteredIcons.map(i => i.filename).sort();
    expect(fnames).toEqual(['colonial.png', 'rifle.png', 'warden.png']);
  });

  test('mode todolist + faction "warden" : ne garde que les entries warden', () => {
    store.setTodoListFaction('warden');
    const fnames = store.filteredIcons.map(i => i.filename).sort();
    expect(fnames).toEqual(['warden.png']);
  });

  test('mode todolist + faction "colonial" : ne garde que les entries colonial', () => {
    store.setTodoListFaction('colonial');
    const fnames = store.filteredIcons.map(i => i.filename).sort();
    expect(fnames).toEqual(['colonial.png']);
  });
});

// ============================================================
// load() : background, viewMode, todolist persistés
// ============================================================

describe('Store - load() persistance étendue', () => {
  test('load() restaure un background valide', () => {
    const bg: TemplateBackground = { kind: 'color', color: '#123456' };
    localStorage.setItem('templateBackground', JSON.stringify(bg));
    store.load();
    expect(store.background).toEqual(bg);
  });

  test('load() ignore un background invalide et conserve le default', () => {
    localStorage.setItem('templateBackground', JSON.stringify({ kind: 'color' }));
    const before = store.background;
    store.load();
    expect(store.background).toEqual(before);
  });

  test('load() gère un background JSON malformé sans crash', () => {
    localStorage.setItem('templateBackground', '{not json');
    expect(() => store.load()).not.toThrow();
  });

  test('load() restaure viewMode persisté', () => {
    localStorage.setItem('viewMode', 'todolist');
    store.load();
    expect(store.viewMode).toBe('todolist');
  });

  test('load() ignore une valeur viewMode invalide', () => {
    localStorage.setItem('viewMode', 'bidon');
    store.setViewMode('template');
    store.load();
    expect(store.viewMode).toBe('template');
  });

  test('load() restaure une todolist persistée', () => {
    const saved = {
      title: 'Persisted',
      autoDate: false,
      faction: 'warden',
      items: [],
      textBlocks: [],
    };
    localStorage.setItem('todolist', JSON.stringify(saved));
    store.load();
    expect(store.todolist.title).toBe('Persisted');
    expect(store.todolist.faction).toBe('warden');
    expect(store.todolist.autoDate).toBe(false);
  });

  test('load() comble items/textBlocks manquants depuis le défaut', () => {
    localStorage.setItem('todolist', JSON.stringify({ title: 'X' }));
    store.load();
    expect(store.todolist.items).toEqual([]);
    expect(store.todolist.textBlocks).toEqual([]);
  });

  test('load() gère une todolist JSON corrompue sans crash', () => {
    localStorage.setItem('todolist', '{invalide');
    expect(() => store.load()).not.toThrow();
  });
});

// ============================================================
// importJSON : background variants
// ============================================================

describe('Store - importJSON background', () => {
  test('importJSON sans background applique le default', () => {
    store.setBackground({ kind: 'color', color: '#abcdef' });
    const tpl = { sections: [] };
    store.importJSON(JSON.stringify(tpl));
    expect(store.background).toEqual(DEFAULT_BACKGROUND);
  });

  test('importJSON avec background valide le restaure', () => {
    const bg: TemplateBackground = { kind: 'color', color: '#deadbe' };
    const tpl = { sections: [], background: bg };
    store.importJSON(JSON.stringify(tpl));
    expect(store.background).toEqual(bg);
  });

  test('importJSON avec background invalide retombe sur default', () => {
    const tpl = { sections: [], background: { kind: 'color' } };
    store.importJSON(JSON.stringify(tpl));
    expect(store.background).toEqual(DEFAULT_BACKGROUND);
  });

  test('importJSON tolère une exception localStorage sur le background', () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string) => {
      if (key === 'templateBackground') throw new Error('quota');
    });
    const bg: TemplateBackground = { kind: 'color', color: '#112233' };
    const tpl = { sections: [], background: bg };
    expect(() => store.importJSON(JSON.stringify(tpl))).not.toThrow();
    expect(store.background).toEqual(bg);
    setItemSpy.mockRestore();
  });

  test('importJSON applique iconScale valide', () => {
    const tpl = { sections: [], iconScale: 'large' };
    store.importJSON(JSON.stringify(tpl));
    expect(store.iconScale).toBe('large');
    expect(localStorage.getItem('iconScale')).toBe('large');
  });

  test('importJSON ignore iconScale invalide', () => {
    store.setIconScale('medium');
    const tpl = { sections: [], iconScale: 'enorme' };
    store.importJSON(JSON.stringify(tpl));
    expect(store.iconScale).toBe('medium');
  });
});
