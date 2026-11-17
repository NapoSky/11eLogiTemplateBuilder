import { readFileSync } from 'node:fs';
import { store, ICON_SCALES } from '../store';
import type { Icon, IconScale, Section, SectionIcon, Template } from '../types';

const rifle: Icon = {
  id: 'rifle', filename: 'Textures/UI/ItemIcons/RifleW.png',
  displayName: 'Rifle', category: 'Small Arms', path: '/assets/icons/Textures/UI/ItemIcons/RifleW.png',
};
const crate = '/assets/icons/subtypes/SubtypeCrateIcon.png';
const placed = (id: string, gridRow = 0, gridCol = 0): SectionIcon => ({
  id, iconId: rifle.id, filename: rifle.filename, path: rifle.path,
  gridRow, gridCol, quantity: 7, subtype: crate,
});
const section = (id: string, icons: SectionIcon[] = [], width = 300): Section => ({
  id, title: id, color: '#fff', x: 0, y: 0, width, height: 300, icons,
});
const expectUniqueSlots = (icons: SectionIcon[]) => {
  expect(new Set(icons.map(icon => `${icon.gridRow},${icon.gridCol}`)).size).toBe(icons.length);
};

beforeEach(() => {
  store.sections = [];
  store.iconScale = 'medium';
  localStorage.clear();
});

test('a sidebar drop replaces an occupied slot without inheriting its quantity or overlay', () => {
  const neighbour = placed('neighbour', 0, 1);
  store.addSection(section('target', [placed('old'), neighbour]));
  const incoming = { ...rifle, id: 'new', filename: 'new.png', path: '/new.png' };

  store.addIconToSection('target', incoming, 0, 0);

  const icons = store.sections[0].icons;
  expect(icons).toHaveLength(2);
  expect(icons).toContainEqual(neighbour);
  expect(icons.find(icon => icon.gridCol === 0)).toMatchObject({
    iconId: incoming.id, filename: incoming.filename, path: incoming.path,
    quantity: 1, gridRow: 0, gridCol: 0,
  });
  expect(icons.find(icon => icon.gridCol === 0)?.subtype).toBeUndefined();
  expectUniqueSlots(icons);
  expect(JSON.parse(localStorage.getItem('template')!).sections[0].icons).toEqual(icons);
});

test.each(Object.keys(ICON_SCALES) as IconScale[])('automatic placement respects the visible %s grid', scale => {
  store.iconScale = scale;
  store.addSection(section('target', [placed('a'), placed('b', 0, 1)], 12 + 2 * ICON_SCALES[scale].cell));

  store.addIconToSection('target', rifle);

  expect(store.sections[0].icons[2]).toMatchObject({ gridRow: 1, gridCol: 0 });
  expectUniqueSlots(store.sections[0].icons);
});

test('a transfer replaces the destination while preserving the incoming asset and its settings', () => {
  const incoming = { ...placed('incoming'), quantity: 42 };
  const neighbour = placed('neighbour', 0, 1);
  store.addSection(section('source', [incoming]));
  store.addSection(section('target', [placed('old'), neighbour]));

  store.moveIconBetweenSections('source', 'target', incoming.id, 0, 0);

  expect(store.sections[0].icons).toEqual([]);
  expect(store.sections[1].icons).toEqual([neighbour, incoming]);
  expectUniqueSlots(store.sections[1].icons);
});

test('a transfer to the same section exchanges slots and a missing destination loses nothing', () => {
  const a = placed('a');
  const b = placed('b', 0, 1);
  store.addSection(section('source', [a, b]));

  store.moveIconBetweenSections('source', 'source', 'a', 0, 1);
  expect(store.sections[0].icons).toEqual([
    { ...a, gridCol: 1 }, { ...b, gridCol: 0 },
  ]);
  const before = store.exportJSON();
  store.moveIconBetweenSections('source', 'missing', 'a', 0, 0);
  expect(store.exportJSON()).toBe(before);
});

test.each(['import', 'reload'])('%s shifts a collision past reserved slots and wraps to the next row', source => {
  const original: Template = {
    iconScale: 'xlarge', sections: [section('target', [
      placed('a'), { ...placed('overlap'), quantity: 42 },
      placed('b', 0, 1), placed('c', 0, 2),
    ], 12 + 3 * ICON_SCALES.xlarge.cell)],
  };
  if (source === 'import') {
    expect(store.importJSON(JSON.stringify(original))).toBe(true);
  } else {
    localStorage.setItem('iconScale', 'xlarge');
    localStorage.setItem('template', JSON.stringify(original));
    store.load();
  }

  expect(store.sections[0].icons).toEqual([
    original.sections[0].icons[0],
    { ...original.sections[0].icons[1], gridRow: 1, gridCol: 0 },
    ...original.sections[0].icons.slice(2),
  ]);
  expectUniqueSlots(store.sections[0].icons);
  const repaired = store.exportJSON();
  expect(store.importJSON(repaired)).toBe(true);
  expect(store.exportJSON()).toBe(repaired);
});

test('missing or invalid positions cannot steal a later explicitly positioned asset slot', () => {
  const missing = placed('missing');
  delete (missing as Partial<SectionIcon>).gridRow;
  delete (missing as Partial<SectionIcon>).gridCol;
  const fixed = placed('fixed');
  expect(store.importJSON(JSON.stringify({ sections: [section('target', [
    missing, fixed, placed('invalid', -1, 0),
  ])] }))).toBe(true);

  expect(store.sections[0].icons.find(icon => icon.id === fixed.id)).toEqual(fixed);
  expectUniqueSlots(store.sections[0].icons);
  expect(store.sections[0].icons.every(icon => Number.isInteger(icon.gridRow) && icon.gridRow >= 0 &&
    Number.isInteger(icon.gridCol) && icon.gridCol >= 0)).toBe(true);
});

test('the actual Colonial reference overlap is repaired without losing assets or changing targets', () => {
  const template: Template = JSON.parse(readFileSync('public/referenceTemplateColonial.json', 'utf8'));
  const before = JSON.stringify(template);
  expect(store.importJSON(before)).toBe(true);
  for (const [index, current] of store.sections.entries()) {
    expectUniqueSlots(current.icons);
    expect(current.icons).toHaveLength(template.sections[index].icons.length);
    current.icons.forEach((icon, iconIndex) => {
      const { gridRow: _row, gridCol: _col, ...saved } = template.sections[index].icons[iconIndex];
      expect(icon).toMatchObject(saved);
    });
  }
  const exported = store.exportJSON();
  store.sections = [];
  store.load();
  expect(store.exportJSON()).toBe(exported);
});
