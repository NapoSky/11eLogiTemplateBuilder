import { parseTodoList } from '../services/todoListParser';
import { renderTodoList } from '../services/todoListExporter';
import { MpfDataEntry, TodoList } from '../types';

const mpf: MpfDataEntry[] = [
  {
    iconFilename: 'UI/ItemIcons/RifleCItemIcon.png',
    itemName: 'Argenti r.II Rifle',
    itemCategory: 'small_arms',
    faction: ['neutral', 'colonial'],
    cost: { bmat: 100 },
    numberProduced: 20,
    maxCrates: 9,
  },
  {
    iconFilename: 'UI/ItemIcons/MortarItemIcon.png',
    itemName: 'Cremari Mortar',
    itemCategory: 'heavy_arms',
    faction: ['neutral', 'colonial', 'warden'],
    cost: { bmat: 100, rmat: 25 },
    numberProduced: 5,
    maxCrates: 9,
  },
  {
    iconFilename: 'UI/ItemIcons/ATMortarItemIcon.png',
    itemName: 'Bonesaw MK.3',
    itemCategory: 'heavy_arms',
    faction: ['neutral', 'warden'],
    cost: { bmat: 100, rmat: 25 },
    numberProduced: 5,
    maxCrates: 9,
  },
  {
    iconFilename: 'UI/ItemIcons/ATMortarWTripodItemIcon.png',
    itemName: 'Mounted Bonesaw MK.3',
    itemCategory: 'heavy_arms',
    faction: ['neutral', 'warden'],
    cost: { bmat: 100, rmat: 5 },
    numberProduced: 5,
    maxCrates: 9,
  },
  {
    iconFilename: 'UI/ItemIcons/MaintenanceSuppliesIcon.png',
    itemName: 'Maintenance Supplies',
    itemCategory: 'supplies',
    faction: ['neutral', 'colonial', 'warden'],
    cost: { bmat: 250 },
    numberProduced: 100,
    maxCrates: 9,
  },
];

describe('parseTodoList', () => {
  it('parses title with date and sets autoDate', () => {
    const raw = '__**TODOLIST 02/03**__\n';
    const { result } = parseTodoList(raw, mpf);
    expect(result.title).toBe('TODOLIST');
    expect(result.autoDate).toBe(true);
  });

  it('parses title without date', () => {
    const { result } = parseTodoList('__**MA LISTE**__\n', mpf);
    expect(result.title).toBe('MA LISTE');
    expect(result.autoDate).toBe(false);
  });

  it('parses items with regional indicator + ・ separator', () => {
    const raw = '__**T**__\n\n__Small arms__\n🇦・Argenti r.II Rifle – 100 Bmats\n';
    const { result, warnings } = parseTodoList(raw, mpf);
    expect(warnings).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].itemName).toBe('Argenti r.II Rifle');
    expect(result.items[0].category).toBe('small_arms');
    expect(result.items[0].orderCount).toBe(1);
  });

  it('parses items with ASCII letter + - separator and (xN)', () => {
    const raw = '__**T**__\n\n__Supplies__\nH-Maintenance Supplies - 1375 Bmats (x5)\n';
    const { result } = parseTodoList(raw, mpf);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].itemName).toBe('Maintenance Supplies');
    expect(result.items[0].orderCount).toBe(5);
  });

  it('prefers longest matching item name (Mounted Bonesaw vs Bonesaw)', () => {
    const raw = '__**T**__\n\n__Heavy arms__\nA・Mounted Bonesaw MK.3 – 100 Bmats\nB・Bonesaw MK.3 – 100 Bmats\n';
    const { result } = parseTodoList(raw, mpf);
    expect(result.items.map(i => i.itemName)).toEqual([
      'Mounted Bonesaw MK.3',
      'Bonesaw MK.3',
    ]);
  });

  it('warns on unknown item and skips it', () => {
    const raw = '__**T**__\n\n__Small arms__\nA・Unknown Weapon 9000 – 50 Bmats\n';
    const { result, warnings } = parseTodoList(raw, mpf);
    expect(result.items).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Unknown Weapon 9000/);
  });

  it('captures top text blocks before any category', () => {
    const raw = '__**T**__\n\nFirst note\nSecond line\n\n__Small arms__\n';
    const { result } = parseTodoList(raw, mpf);
    expect(result.textBlocks).toHaveLength(1);
    expect(result.textBlocks[0].anchor).toEqual({ kind: 'top' });
    expect(result.textBlocks[0].content).toBe('First note\nSecond line');
  });

  it('captures category-anchored text block including alarm emoji verbatim', () => {
    const raw =
      '__**T**__\n\n__Heavy ammunition__\n<a:alarm:1308239734618984508> Heads up!\n--> link here\n\n__Small arms__\n';
    const { result } = parseTodoList(raw, mpf);
    expect(result.textBlocks).toHaveLength(1);
    expect(result.textBlocks[0].anchor).toEqual({
      kind: 'category',
      category: 'heavy_ammunition',
    });
    expect(result.textBlocks[0].content).toContain('<a:alarm:1308239734618984508>');
    expect(result.textBlocks[0].content).toContain('--> link here');
  });

  it('round-trips renderTodoList → parseTodoList preserving items and orderCount', () => {
    const tl: TodoList = {
      title: 'RT',
      autoDate: false,
      faction: 'all',
      items: [
        {
          id: 'x',
          iconFilename: 'UI/ItemIcons/RifleCItemIcon.png',
          itemName: 'Argenti r.II Rifle',
          category: 'small_arms',
          faction: ['neutral', 'colonial'],
          cost: { bmat: 100 },
          maxCrates: 9,
          numberProduced: 20,
          orderCount: 3,
        },
        {
          id: 'y',
          iconFilename: 'UI/ItemIcons/MortarItemIcon.png',
          itemName: 'Cremari Mortar',
          category: 'heavy_arms',
          faction: ['neutral', 'colonial', 'warden'],
          cost: { bmat: 100, rmat: 25 },
          maxCrates: 9,
          numberProduced: 5,
          orderCount: 1,
        },
      ],
      textBlocks: [],
    };

    const exported = renderTodoList(tl);
    const { result, warnings } = parseTodoList(exported, mpf);

    expect(warnings).toEqual([]);
    expect(result.title).toBe('RT');
    expect(result.items.map(i => ({ name: i.itemName, qty: i.orderCount }))).toEqual([
      { name: 'Argenti r.II Rifle', qty: 3 },
      { name: 'Cremari Mortar', qty: 1 },
    ]);
  });
});
