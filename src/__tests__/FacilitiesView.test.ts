import { readFileSync } from 'node:fs';
import { FacilitiesView } from '../components/FacilitiesView';
import { Toolbar } from '../components/Toolbar';
import { store } from '../store';
import type { FacilitiesCatalog } from '../services/facilitiesCatalog';
import { defaultFacilityRecipe } from '../services/facilitiesCatalog';
import { emptyFacilityMission, emptyFacilityProfile } from '../services/facilitiesPlanner';
import { FACILITY_MISSION_KEY, FACILITY_PROFILE_KEY } from '../services/facilitiesStorage';

const catalog = JSON.parse(readFileSync('public/facilitiesData.json', 'utf8')) as FacilitiesCatalog;
const train = catalog.items.find(item => item.name === 'BMS Black Bolt')!;
const cmat = catalog.items.find(item => item.name === 'Construction Materials')!;
let view: FacilitiesView;
let container: HTMLElement;
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const input = (selector: string, value: string, event = 'change') => {
  const element = container.querySelector<HTMLInputElement>(selector)!;
  element.value = value; element.dispatchEvent(new Event(event, { bubbles: true }));
};
const openPicker = () => { if (!container.querySelector('#fc-search')) container.querySelector<HTMLButtonElement>('#fc-add-objective')!.click(); };
const addItem = (itemId: string) => {
  openPicker();
  const candidate = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-fc-add-item]')).find(button => button.dataset.fcAddItem === itemId)!;
  candidate.click();
};
const addTrain = () => addItem(train.id);
const settings = (tab: 'recipes' | 'stock' = 'recipes') => container.querySelector<HTMLButtonElement>(tab === 'stock' ? '#fc-open-stock' : '#fc-open-settings')!.click();

beforeEach(async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => catalog });
  global.confirm = jest.fn().mockReturnValue(true);
  container = document.createElement('div'); document.body.append(container);
  view = new FacilitiesView(); view.mount(container); await settle();
});

afterEach(() => { view.unmount(); document.body.innerHTML = ''; store.setViewMode('template'); });

test('opens its own objectives, collapsed settings and preview without legacy controls', () => {
  expect(container.querySelector('[data-fc-add-item] img')).not.toBeNull();
  expect(container.querySelector('#fc-settings')).toBeNull();
  expect(container.querySelector('#fc-discord')!.textContent).toContain('Add objectives');
  expect(container.querySelector('[data-fc-action="copy"]')!.hasAttribute('disabled')).toBe(true);
  expect(container.querySelector('#tl-title')).toBeNull();
});

test('adds goals, updates quantities live and persists without altering other modules', async () => {
  localStorage.setItem('todolist', '{"keep":true}'); localStorage.setItem('productionRun', '{"keep":true}');
  addTrain();
  expect(container.querySelectorAll('[data-fc-objective]')).toHaveLength(1);
  input('#fc-goal-0', '2', 'input');
  input('#fc-title', 'Two trains', 'input');
  expect(container.querySelector('#fc-discord')!.textContent).toContain('Task Force — Two trains');
  expect(container.querySelector('#fc-discord')!.textContent).toContain('2 BMS Black Bolt');
  expect(container.querySelector('#fc-discord u strong')!.textContent).toBe('Task Force — Two trains');
  expect(container.querySelector('#fc-discord')!.getAttribute('data-raw')).toContain('🇦・Produce ');
  expect(container.querySelector('#fc-discord')!.textContent).not.toContain('- [ ]');
  expect(JSON.parse(localStorage.getItem(FACILITY_MISSION_KEY)!).objectives[0].quantity).toBe(2);
  view.unmount(); view = new FacilitiesView(); view.mount(container); await settle();
  expect(container.querySelector<HTMLInputElement>('#fc-goal-0')!.value).toBe('2');
  expect(localStorage.getItem('todolist')).toBe('{"keep":true}');
  expect(localStorage.getItem('productionRun')).toBe('{"keep":true}');
});

test('recipe packaging determines the quantity input and briefing without a unit selector', async () => {
  const sniper = catalog.items.find(item => item.name === 'Clancy-Raca M4' && item.unit === 'crates')!;
  const candidates = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-fc-add-item]'))
    .filter(button => button.getAttribute('aria-label')!.includes('Clancy-Raca M4'));
  expect(candidates).toHaveLength(1);
  addItem(sniper.id);
  input('#fc-goal-0', '50', 'input');
  const objective = container.querySelector('[data-fc-objective="0"]')!;
  expect(objective.querySelector('label')!.textContent).toBe('crates');
  expect(objective.querySelector('select')).toBeNull();
  const stage = Array.from(container.querySelectorAll<HTMLElement>('[data-fc-step]')).find(row => row.dataset.fcStep === sniper.id)!;
  expect(stage.querySelector('strong')!.textContent).toBe('50 crates of Clancy-Raca M4');
  const briefing = container.querySelector<HTMLElement>('#fc-discord')!.dataset.raw!;
  expect(briefing).toContain('- 50 crates of Clancy-Raca M4');
  expect(briefing).toContain('Bring 50 crates of No.2 Loughcaster');
  addItem(catalog.items.find(item => item.name === 'Callahan')!.id);
  expect(container.querySelector('[data-fc-objective="1"] label')!.textContent).toBe('units');
  view.unmount(); view = new FacilitiesView(); view.mount(container); await settle();
  expect(container.querySelector<HTMLInputElement>('#fc-goal-0')!.value).toBe('50');
  expect(container.querySelector('[data-fc-objective="0"] label')!.textContent).toBe('crates');
});

test('saved equipment missions retain their original unit quantities', async () => {
  view.unmount();
  const sniper = catalog.items.find(item => item.name === 'Clancy-Raca M4' && item.unit === 'units')!;
  const mission = { ...emptyFacilityMission(), objectives: [{ itemId: sniper.id, quantity: 50 }] };
  localStorage.setItem(FACILITY_MISSION_KEY, JSON.stringify(mission));
  view = new FacilitiesView(); view.mount(container); await settle();
  expect(container.querySelector<HTMLInputElement>('#fc-goal-0')!.value).toBe('50');
  expect(container.querySelector('[data-fc-objective="0"] label')!.textContent).toBe('units');
  expect(container.querySelector<HTMLElement>('#fc-discord')!.dataset.raw).toContain('Bring 17 crates of No.2 Loughcaster');
  expect(JSON.parse(localStorage.getItem(FACILITY_MISSION_KEY)!)).toEqual(mission);
});

test('the MPF-style preview copies the original Markdown rather than rendered text', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  addTrain();
  input('#fc-title', 'Test mission', 'input');
  const preview = container.querySelector<HTMLElement>('#fc-discord')!;
  const raw = preview.dataset.raw!;
  expect(preview.querySelector('u strong')!.textContent).toBe('Task Force — Test mission');
  expect(raw).toContain('__**Task Force — Test mission**__');
  expect(container.querySelector('#fc-char-count')!.textContent).toBe(`${raw.length} / 4000`);
  expect(container.querySelector('#fc-copy')!.classList.contains('bg-blue-600')).toBe(true);
  container.querySelector<HTMLButtonElement>('#fc-copy')!.click(); await settle();
  expect(writeText).toHaveBeenCalledWith(raw);
  expect(writeText).not.toHaveBeenCalledWith(preview.textContent);
  expect(document.body.textContent).toContain('Copied!');
});

test('liquid supplies show full cans in the plan and Discord, with exact litres in an accessible dark tooltip', async () => {
  view.unmount();
  const enriched = catalog.items.find(item => item.name === 'Enriched Oil' && item.unit === 'L')!;
  localStorage.setItem(FACILITY_MISSION_KEY, JSON.stringify({ ...emptyFacilityMission(), objectives: [{ itemId: enriched.id, quantity: 61 }] }));
  localStorage.setItem(FACILITY_PROFILE_KEY, JSON.stringify({ ...emptyFacilityProfile(), recipes: { [enriched.id]: 'supply' } }));
  view = new FacilitiesView(); view.mount(container); await settle();
  const supplies = container.querySelector('[data-fc-supply-group="liquids"]')!;
  expect(supplies.textContent).toContain('3 cans of Enriched Oil');
  expect(supplies.textContent).not.toContain('61 L Enriched Oil');
  expect(container.querySelector<HTMLElement>('#fc-discord')!.dataset.raw).toContain('Bring 3 cans of Enriched Oil');
  const label = supplies.querySelector<HTMLElement>('[data-quantity-tooltip]')!;
  label.focus();
  const tooltip = document.getElementById(label.getAttribute('aria-describedby')!)!;
  expect(tooltip.textContent).toContain('61 L required');
  expect(tooltip.textContent).toContain('30 L per full can');
  expect(tooltip.classList.contains('hidden')).toBe(false);
  view.unmount(); expect(tooltip.isConnected).toBe(false);
});

test('liquid stages show complete cans and pipeline supply can be toggled, persisted and reversed without losing recipes', async () => {
  const enriched = catalog.items.find(item => item.name === 'Enriched Oil' && item.unit === 'L')!;
  const heavy = catalog.items.find(item => item.name === 'Heavy Oil' && item.unit === 'L')!;
  const oil = catalog.items.find(item => item.name === 'Oil' && item.unit === 'L')!;
  addItem(enriched.id); input('#fc-goal-0', '72', 'input');
  const stage = (id: string) => Array.from(container.querySelectorAll<HTMLElement>('[data-fc-step]')).find(row => row.dataset.fcStep === id);
  const supply = (id: string) => Array.from(container.querySelectorAll<HTMLElement>('[data-fc-supply]')).find(row => row.dataset.fcSupply === id);
  expect(stage(heavy.id)!.querySelector('strong')!.textContent).toBe('3 cans of Heavy Oil');
  expect(stage(enriched.id)!.querySelector('strong')!.textContent).toBe('3 cans of Enriched Oil');
  expect(stage(heavy.id)!.querySelector('[data-quantity-tooltip]')!.getAttribute('data-quantity-tooltip')).toContain('90 L');
  const recipeBefore = JSON.parse(localStorage.getItem(FACILITY_PROFILE_KEY)!).recipes[heavy.id];
  supply(oil.id)!.querySelector<HTMLButtonElement>('[data-fc-pipeline]')!.click();
  stage(heavy.id)!.querySelector<HTMLButtonElement>('[data-fc-pipeline]')!.click();
  expect(stage(heavy.id)).toBeUndefined(); expect(supply(oil.id)).toBeUndefined();
  const piped = container.querySelector('[data-fc-piped-supplies]')!;
  expect(piped.textContent).toContain('Heavy Oil');
  expect(piped.querySelectorAll('[data-fc-pipeline]')).toHaveLength(2);
  expect(Array.from(piped.querySelectorAll<HTMLElement>('span[data-quantity-tooltip]')).map(label => label.textContent)).toEqual(['Heavy Oil', 'Oil']);
  expect(piped.querySelector('[data-fc-pipeline]')!.getAttribute('aria-pressed')).toBe('true');
  expect(piped.querySelector('[data-fc-pipeline]')!.classList.contains('bg-blue-700')).toBe(true);
  const activePipeline = piped.querySelector<HTMLButtonElement>('[data-fc-pipeline]')!;
  expect(activePipeline.hasAttribute('title')).toBe(false);
  activePipeline.focus();
  expect(document.getElementById(activePipeline.getAttribute('aria-describedby')!)!.textContent).toContain('Remove pipeline supply');
  expect(document.getElementById(activePipeline.getAttribute('aria-describedby')!)!.textContent).toContain('Pipeline supply is active.');
  expect(stage(enriched.id)!.textContent).toContain('Heavy Oil (pipeline)');
  const raw = container.querySelector<HTMLElement>('#fc-discord')!.dataset.raw!;
  expect(raw).toContain('__Already allocated — do not gather again__');
  expect(raw).toContain('- Heavy Oil (Piped)'); expect(raw).toContain('- Oil (Piped)');
  expect(raw).not.toContain('__Supplied by pipeline__'); expect(raw).not.toContain('Produce 3 cans of Heavy Oil');
  settings(); input('#fc-settings-search', 'Heavy Oil', 'input');
  const row = () => Array.from(container.querySelectorAll<HTMLElement>('[data-fc-settings-item]')).find(row => row.dataset.fcSettingsItem === heavy.id)!;
  expect(row().querySelector<HTMLSelectElement>('select')!.disabled).toBe(true);
  row().querySelector<HTMLButtonElement>('[data-fc-pipeline]')!.click();
  expect(row().querySelector<HTMLSelectElement>('select')!.value).toBe(recipeBefore);
  expect(row().querySelector<HTMLSelectElement>('select')!.disabled).toBe(false);
  expect(stage(heavy.id)).toBeDefined(); expect(supply(oil.id)).toBeUndefined();
  row().querySelector<HTMLButtonElement>('[data-fc-pipeline]')!.click();
  view.unmount(); view = new FacilitiesView(); view.mount(container); await settle();
  expect(container.querySelector('[data-fc-piped-supplies]')!.textContent).toContain('Heavy Oil');
  expect(container.querySelectorAll('[data-fc-piped-supplies] [data-fc-pipeline]')).toHaveLength(2);
  expect(JSON.parse(localStorage.getItem(FACILITY_PROFILE_KEY)!).recipes[heavy.id]).toBe(recipeBefore);
  expect(JSON.parse(localStorage.getItem(FACILITY_MISSION_KEY)!).objectives[0].quantity).toBe(72);
});

test('raw supplies round up to whole Resource Containers in the plan and Discord, preserving exact units in the hover and cache', async () => {
  view.unmount();
  const coal = catalog.items.find(item => item.name === 'Coal')!;
  const mission = { ...emptyFacilityMission(), objectives: [{ itemId: coal.id, quantity: 15_000 }], available: { [coal.id]: 2_500 } };
  localStorage.setItem(FACILITY_MISSION_KEY, JSON.stringify(mission));
  view = new FacilitiesView(); view.mount(container); await settle();
  const supplies = container.querySelector('[data-fc-supply-group="raw"]')!;
  const label = supplies.querySelector<HTMLElement>('[data-quantity-tooltip]')!;
  expect(label.textContent).toBe('3 Resource Containers of Coal');
  expect(supplies.textContent).toContain('5,000 units per Resource Container');
  expect(container.querySelector<HTMLElement>('#fc-discord')!.dataset.raw).toContain('Bring 1 Resource Containers of Coal (x3)');
  label.focus();
  const tooltip = document.getElementById(label.getAttribute('aria-describedby')!)!;
  expect(tooltip.textContent).toContain('12,500 units required');
  expect(tooltip.textContent).toContain('Rounded up for delivery');
  expect(tooltip.classList.contains('hidden')).toBe(false);
  expect(JSON.parse(localStorage.getItem(FACILITY_MISSION_KEY)!)).toEqual(mission);
});

test('Available stock pipeline checkboxes sync with the plan and preserve the finite stock quantity when checked and unchecked', () => {
  const enriched = catalog.items.find(item => item.name === 'Enriched Oil' && item.unit === 'L')!;
  const heavy = catalog.items.find(item => item.name === 'Heavy Oil' && item.unit === 'L')!;
  addItem(enriched.id); input('#fc-goal-0', '72', 'input'); settings('stock');
  const stockRow = (id: string) => Array.from(container.querySelectorAll<HTMLElement>('[data-fc-settings-item]')).find(row => row.dataset.fcSettingsItem === id)!;
  const checkbox = () => stockRow(heavy.id).querySelector<HTMLInputElement>('[data-fc-stock-pipeline]')!;
  const stock = () => stockRow(heavy.id).querySelector<HTMLInputElement>('[data-fc-stock]')!;
  stock().value = '30'; stock().dispatchEvent(new Event('input', { bubbles: true }));
  expect(checkbox().checked).toBe(false); expect(stock().disabled).toBe(false);
  const sulfur = catalog.items.find(item => item.name === 'Sulfur')!;
  expect(stockRow(sulfur.id).querySelector('[data-fc-stock-pipeline]')).toBeNull();
  checkbox().click();
  expect(checkbox().checked).toBe(true); expect(stock().disabled).toBe(true); expect(stock().value).toBe('30');
  expect(container.querySelector<HTMLElement>('#fc-discord')!.dataset.raw).toContain('- Heavy Oil (Piped)');
  expect(container.querySelector('[data-fc-piped-supplies]')!.textContent).toContain('Heavy Oil');
  expect(JSON.parse(localStorage.getItem(FACILITY_MISSION_KEY)!).available[heavy.id]).toBe(30);
  checkbox().click();
  expect(checkbox().checked).toBe(false); expect(stock().disabled).toBe(false); expect(stock().value).toBe('30');
  const stage = () => Array.from(container.querySelectorAll<HTMLElement>('[data-fc-step]')).find(row => row.dataset.fcStep === heavy.id)!;
  expect(stage().querySelector('strong')!.textContent).toBe('2 cans of Heavy Oil');
  container.querySelector<HTMLButtonElement>('[data-fc-action="close-dialog"]')!.click();
  stage().querySelector<HTMLButtonElement>('[data-fc-pipeline]')!.click();
  settings('stock');
  expect(checkbox().checked).toBe(true); expect(stock().value).toBe('30');
  expect(JSON.parse(localStorage.getItem(FACILITY_PROFILE_KEY)!).piped).toContain(heavy.id);
});

test('long briefings retain full Markdown copy alongside the optional message copies', async () => {
  view.unmount();
  const objectives = catalog.items.filter(defaultFacilityRecipe).slice(0, 40).map(item => ({ itemId: item.id, quantity: 1 }));
  localStorage.setItem(FACILITY_MISSION_KEY, JSON.stringify({ ...emptyFacilityMission(), objectives }));
  view = new FacilitiesView(); view.mount(container); await settle();
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const raw = container.querySelector<HTMLElement>('#fc-discord')!.dataset.raw!;
  expect(raw.length).toBeGreaterThan(4000);
  expect(container.querySelector('#fc-char-count')!.classList.contains('text-red-400')).toBe(true);
  container.querySelector<HTMLButtonElement>('#fc-copy')!.click(); await settle();
  expect(writeText).toHaveBeenLastCalledWith(raw);
  const part = container.querySelector<HTMLButtonElement>('[data-fc-part="0"]')!;
  expect(part.classList.contains('bg-blue-600')).toBe(true);
  part.click(); await settle();
  expect(writeText.mock.lastCall![0].length).toBeLessThanOrEqual(1900);
  expect(writeText.mock.lastCall![0]).toContain('__**Task Force');
});

test('search keeps typing focus and adding the same objective increases its quantity', () => {
  const search = container.querySelector<HTMLInputElement>('#fc-search')!;
  search.focus(); input('#fc-search', 'Black Bolt', 'input');
  expect(document.activeElement).toBe(search);
  expect(container.querySelectorAll('[data-fc-add-item]')).toHaveLength(1);
  addTrain(); addTrain();
  expect(container.querySelectorAll('[data-fc-objective]')).toHaveLength(1);
  expect(container.querySelector<HTMLInputElement>('#fc-goal-0')!.value).toBe('2');
});

test('visual category filters keep the catalogue and mission data unchanged', () => {
  addTrain();
  const saved = localStorage.getItem(FACILITY_MISSION_KEY);
  openPicker();
  container.querySelector<HTMLButtonElement>('[data-fc-group="Materials"]')!.click();
  const candidates = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[data-fc-add-item]'));
  expect(candidates().some(button => button.dataset.fcAddItem === cmat.id)).toBe(true);
  expect(candidates().some(button => button.dataset.fcAddItem === train.id)).toBe(false);
  container.querySelector<HTMLButtonElement>('[data-fc-group="Vehicles"]')!.click();
  expect(candidates().every(button => catalog.items.find(item => item.id === button.dataset.fcAddItem)!.kind === 'vehicle')).toBe(true);
  expect(candidates().some(button => button.dataset.fcAddItem === train.id)).toBe(true);
  expect(localStorage.getItem(FACILITY_MISSION_KEY)).toBe(saved);
});

test('Available Stock and Facility Settings hide objectives but keep their ingredients and stored quantities', async () => {
  const callahan = catalog.items.find(item => item.name === 'Callahan')!;
  view.unmount();
  localStorage.setItem(FACILITY_MISSION_KEY, JSON.stringify({ ...emptyFacilityMission(), objectives: [{ itemId: callahan.id, quantity: 2 }], available: { [callahan.id]: 1, [cmat.id]: 10 } }));
  view = new FacilitiesView(); view.mount(container); await settle();
  settings('stock');
  const ids = () => Array.from(container.querySelectorAll<HTMLElement>('[data-fc-settings-item]')).map(row => row.dataset.fcSettingsItem);
  expect(ids()).not.toContain(callahan.id);
  expect(ids()).toContain(cmat.id);
  expect(ids()).toContain(callahan.recipes[0].inputs[0].itemId);
  input('#fc-stock-search', 'Callahan', 'input');
  expect(ids()).toHaveLength(0);
  expect(JSON.parse(localStorage.getItem(FACILITY_MISSION_KEY)!).available).toEqual({ [callahan.id]: 1, [cmat.id]: 10 });
  container.querySelector<HTMLButtonElement>('#fc-close-stock')!.click(); settings();
  expect(ids()).not.toContain(callahan.id);
  expect(ids()).toContain(callahan.recipes[0].inputs[0].itemId);
  const allMaterials = container.querySelector<HTMLInputElement>('#fc-all-materials')!;
  allMaterials.checked = true; allMaterials.dispatchEvent(new Event('change', { bubbles: true }));
  expect(ids()).not.toContain(callahan.id);
  input('#fc-settings-search', 'Callahan', 'input');
  expect(ids()).toHaveLength(0);
});

test('both dialogs filter materials without modifying data, combine search and retain independent selections', () => {
  const callahan = catalog.items.find(item => item.name === 'Callahan')!;
  const find = (name: string) => catalog.items.find(item => item.name === name)!;
  addItem(callahan.id); settings('stock');
  const missionBefore = localStorage.getItem(FACILITY_MISSION_KEY);
  const profileBefore = localStorage.getItem(FACILITY_PROFILE_KEY);
  const filter = (group: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('[data-fc-material-group]')).find(button => button.dataset.fcMaterialGroup === group)!;
  const ids = () => Array.from(container.querySelectorAll<HTMLElement>('[data-fc-settings-item]')).map(row => row.dataset.fcSettingsItem);
  for (const [group, name] of [['Raw Resources', 'Rare Metal'], ['Liquids', 'Heavy Oil'], ['Materials', 'Construction Materials'], ['Assembly Materials', 'Assembly Materials II'], ['Parts & Assets', 'Naval Hull Segments']]) {
    filter(group).click();
    expect(filter(group).getAttribute('aria-pressed')).toBe('true');
    expect(ids()).toContain(find(name).id);
    expect(ids()).not.toContain(callahan.id);
    for (const other of ['Rare Metal', 'Heavy Oil', 'Construction Materials', 'Assembly Materials II', 'Naval Hull Segments'].filter(other => other !== name)) expect(ids()).not.toContain(find(other).id);
  }
  const countBefore = filter('Parts & Assets').textContent;
  input('#fc-stock-search', 'Hull', 'input');
  expect(ids()).toEqual([find('Naval Hull Segments').id]);
  expect(filter('Parts & Assets').textContent).toBe(countBefore);
  input('#fc-stock-search', 'nothing matches', 'input');
  expect(ids()).toHaveLength(0);
  expect(container.querySelector('#fc-stock-list')!.textContent).toContain('Try another search or filter');
  container.querySelector<HTMLButtonElement>('#fc-close-stock')!.click(); settings();
  expect(filter('All').getAttribute('aria-pressed')).toBe('true');
  filter('Liquids').click();
  expect(ids().length).toBeGreaterThan(0);
  expect(ids().every(id => catalog.items.find(item => item.id === id)!.unit === 'L')).toBe(true);
  input('#fc-settings-search', 'Heavy Oil', 'input');
  expect(ids()).toEqual([find('Heavy Oil').id]);
  container.querySelector<HTMLButtonElement>('#fc-close-settings')!.click(); settings('stock');
  expect(filter('Parts & Assets').getAttribute('aria-pressed')).toBe('true');
  expect(ids()).toContain(find('Naval Hull Segments').id);
  expect(localStorage.getItem(FACILITY_MISSION_KEY)).toBe(missionBefore);
  expect(localStorage.getItem(FACILITY_PROFILE_KEY)).toBe(profileBefore);
});

test('Assembly Materials grades use the shared icon with a distinct I–V badge throughout the page', () => {
  input('#fc-search', 'Assembly Materials', 'input');
  expect(container.querySelectorAll('[data-fc-add-item] [data-assembly-grade]')).toHaveLength(5);
  for (const grade of ['I', 'II', 'III', 'IV', 'V']) {
    const image = container.querySelector<HTMLImageElement>(`[data-fc-add-item] [data-assembly-grade="${grade}"] img`)!;
    expect(image.getAttribute('src')).toBe('/assets/icons/Textures/UI/ItemIcons/FacilityMaterials4Icon.png');
  }
  const assembly = catalog.items.find(item => item.name === 'Assembly Materials I')!;
  addItem(assembly.id);
  expect(container.querySelector('[data-fc-objective] [data-assembly-grade="I"]')).not.toBeNull();
  expect(container.querySelector('[data-fc-step] [data-assembly-grade="I"]')).not.toBeNull();
});

test('Facility Settings and Available Stock have separate dialogs, no internal navigation and restore their own trigger focus', () => {
  addTrain();
  expect(container.querySelectorAll('[data-fc-recipe]')).toHaveLength(0);
  settings();
  const dialog = container.querySelector<HTMLDialogElement>('#fc-settings')!;
  expect(dialog.open).toBe(true);
  expect(container.querySelector('#fc-settings-title')!.textContent).toBe('Facility Settings');
  expect(container.querySelector('#fc-stock')).toBeNull();
  expect(container.querySelector('[data-fc-settings-tab]')).toBeNull();
  expect(dialog.querySelector('#fc-clear-recipes')).not.toBeNull();
  expect(dialog.querySelector('#fc-clear-stock')).toBeNull();
  expect(dialog.querySelector('[data-fc-stock]')).toBeNull();
  const details = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-fc-recipe-info]')).find(button => button.dataset.fcRecipeInfo === cmat.id)!;
  details.click();
  expect(container.querySelector('#fc-settings-list')!.textContent).toContain('10 Salvage');
  input('#fc-settings-search', 'Construction Materials', 'input');
  expect(container.querySelectorAll('[data-fc-recipe]')).toHaveLength(2);
  const allMaterials = container.querySelector<HTMLInputElement>('#fc-all-materials')!;
  allMaterials.checked = true; allMaterials.dispatchEvent(new Event('change', { bubbles: true }));
  expect(container.querySelectorAll('[data-fc-recipe]')).toHaveLength(3);
  container.querySelector<HTMLDialogElement>('#fc-settings')!.dispatchEvent(new Event('cancel', { cancelable: true }));
  expect(container.querySelector('#fc-settings')).toBeNull();
  expect(document.activeElement?.id).toBe('fc-open-settings');
  settings('stock');
  expect(container.querySelector('#fc-settings')).toBeNull();
  const stock = container.querySelector<HTMLDialogElement>('#fc-stock')!;
  expect(stock.open).toBe(true);
  expect(container.querySelector('#fc-stock-title')!.textContent).toBe('Available Stock');
  expect(stock.querySelector('#fc-profile-name')).toBeNull();
  expect(stock.querySelector('#fc-clear-stock')).not.toBeNull();
  expect(stock.querySelector('#fc-clear-recipes')).toBeNull();
  expect(stock.querySelector('[data-fc-settings-tab]')).toBeNull();
  expect(container.querySelector('[data-fc-stock]')).not.toBeNull();
  expect(container.querySelector('[data-fc-recipe]')).toBeNull();
  stock.dispatchEvent(new Event('cancel', { cancelable: true }));
  expect(container.querySelector('#fc-stock')).toBeNull();
  expect(document.activeElement?.id).toBe('fc-open-stock');
});

test('invalid quantity edits keep the last valid plan and used default recipes are pinned', () => {
  addTrain();
  const profile = JSON.parse(localStorage.getItem(FACILITY_PROFILE_KEY)!);
  expect(profile.recipes[cmat.id]).toBe(cmat.recipes[0].id);
  input('#fc-goal-0', '', 'input');
  expect(JSON.parse(localStorage.getItem(FACILITY_MISSION_KEY)!).objectives[0].quantity).toBe(1);
  input('#fc-goal-0', '');
  expect(container.querySelector<HTMLInputElement>('#fc-goal-0')!.value).toBe('1');
  input('#fc-goal-0', '0');
  expect(container.querySelector<HTMLInputElement>('#fc-goal-0')!.value).toBe('1');
});

test('objective quantities preserve the caret and selection during direct edits and allow clearing before retyping', () => {
  addTrain();
  let quantity = container.querySelector<HTMLInputElement>('#fc-goal-0')!;
  expect(quantity.inputMode).toBe('numeric');
  quantity.focus(); quantity.value = '12345'; quantity.setSelectionRange(1, 4);
  quantity.dispatchEvent(new Event('input', { bubbles: true }));
  quantity = container.querySelector<HTMLInputElement>('#fc-goal-0')!;
  expect(document.activeElement).toBe(quantity);
  expect([quantity.selectionStart, quantity.selectionEnd]).toEqual([1, 4]);
  input('#fc-goal-0', '', 'input');
  expect(container.querySelector<HTMLInputElement>('#fc-goal-0')!.value).toBe('');
  input('#fc-goal-0', '250', 'input');
  expect(JSON.parse(localStorage.getItem(FACILITY_MISSION_KEY)!).objectives[0].quantity).toBe(250);
});

test('available stock supports direct replacement, paste and editing in the middle of a quantity', () => {
  addTrain(); settings('stock');
  const findStock = () => Array.from(container.querySelectorAll<HTMLInputElement>('[data-fc-stock]')).find(input => input.dataset.fcStock === cmat.id)!;
  let stock = findStock();
  expect(stock.inputMode).toBe('numeric');
  stock.focus(); stock.value = ''; stock.dispatchEvent(new Event('input', { bubbles: true }));
  expect(findStock().value).toBe('');
  stock.value = '12345'; stock.setSelectionRange(2, 2); stock.dispatchEvent(new Event('input', { bubbles: true }));
  stock = findStock();
  expect(document.activeElement).toBe(stock); expect(stock.selectionStart).toBe(2);
  stock.setRangeText('9', 2, 3, 'end'); stock.dispatchEvent(new Event('input', { bubbles: true }));
  expect(findStock().value).toBe('12945');
  expect(JSON.parse(localStorage.getItem(FACILITY_MISSION_KEY)!).available[cmat.id]).toBe(12945);
});

test('recipe and stock choices recalculate the plan and clear only resets the mission', () => {
  addTrain();
  settings();
  const choice = Array.from(container.querySelectorAll<HTMLSelectElement>('[data-fc-recipe]')).find(select => select.dataset.fcRecipe === cmat.id)!;
  choice.value = 'supply'; choice.dispatchEvent(new Event('change', { bubbles: true }));
  expect(container.querySelector('[aria-label="Supplies to bring"]')!.textContent).toContain('Construction Materials');
  container.querySelector<HTMLButtonElement>('#fc-close-settings')!.click(); settings('stock');
  const stock = Array.from(container.querySelectorAll<HTMLInputElement>('[data-fc-stock]')).find(input => input.dataset.fcStock === cmat.id)!;
  stock.value = '1000'; stock.dispatchEvent(new Event('input', { bubbles: true }));
  expect(container.querySelectorAll('[data-fc-step]')).not.toHaveLength(0);
  expect(Array.from(container.querySelectorAll<HTMLElement>('[data-fc-supply]')).some(row => row.dataset.fcSupply === cmat.id)).toBe(false);
  expect(container.querySelector('#fc-discord')!.textContent).toContain('Already allocated');
  container.querySelector<HTMLButtonElement>('#fc-close-stock')!.click();
  window.dispatchEvent(new CustomEvent('facilities:clear-mission'));
  expect(container.querySelectorAll('[data-fc-objective]')).toHaveLength(0);
  expect(JSON.parse(localStorage.getItem(FACILITY_PROFILE_KEY)!).recipes[cmat.id]).toBe('supply');
});

test('Recipes Clear resets every recipe choice while retaining stocks, objectives, pipeline connections and profile details', async () => {
  view.unmount();
  const hidden = catalog.items.find(item => item.name === 'Maintenance Supplies')!;
  const oil = catalog.items.find(item => item.name === 'Oil' && item.unit === 'L')!;
  const mission = { ...emptyFacilityMission(), objectives: [{ itemId: train.id, quantity: 1 }], available: { [cmat.id]: 7 } };
  const profile = { ...emptyFacilityProfile(), name: 'Test facility', location: 'Outpost', recipes: { [cmat.id]: 'supply', [hidden.id]: 'supply' }, piped: [oil.id] };
  localStorage.setItem(FACILITY_MISSION_KEY, JSON.stringify(mission)); localStorage.setItem(FACILITY_PROFILE_KEY, JSON.stringify(profile));
  view = new FacilitiesView(); view.mount(container); await settle();
  settings(); input('#fc-settings-search', 'Construction Materials', 'input');
  expect(Array.from(container.querySelectorAll<HTMLElement>('[data-fc-settings-item]')).some(row => row.dataset.fcSettingsItem === hidden.id)).toBe(false);
  const clear = container.querySelector<HTMLButtonElement>('#fc-clear-recipes')!;
  expect(clear.classList.contains('bg-red-600/50')).toBe(true);
  clear.click();
  const saved = JSON.parse(localStorage.getItem(FACILITY_PROFILE_KEY)!);
  expect(saved.recipes[cmat.id]).toBe(defaultFacilityRecipe(cmat)!.id);
  expect(saved.recipes[hidden.id]).toBeUndefined();
  expect(saved).toMatchObject({ name: profile.name, location: profile.location, piped: [oil.id] });
  expect(JSON.parse(localStorage.getItem(FACILITY_MISSION_KEY)!)).toEqual(mission);
  expect(container.querySelector<HTMLDialogElement>('#fc-settings')!.open).toBe(true);
});

test('Available stock Clear empties all quantities including filtered entries without changing recipes or pipelines', async () => {
  view.unmount();
  const oil = catalog.items.find(item => item.name === 'Oil' && item.unit === 'L')!;
  const mission = { ...emptyFacilityMission(), objectives: [{ itemId: train.id, quantity: 1 }], available: { [cmat.id]: 7, [oil.id]: 50 } };
  const profile = { ...emptyFacilityProfile(), recipes: { [cmat.id]: 'supply' }, piped: [oil.id] };
  localStorage.setItem(FACILITY_MISSION_KEY, JSON.stringify(mission)); localStorage.setItem(FACILITY_PROFILE_KEY, JSON.stringify(profile));
  view = new FacilitiesView(); view.mount(container); await settle();
  settings('stock'); input('#fc-stock-search', 'Construction Materials', 'input');
  const clear = container.querySelector<HTMLButtonElement>('#fc-clear-stock')!;
  expect(clear.classList.contains('bg-red-600/50')).toBe(true);
  clear.click();
  const saved = JSON.parse(localStorage.getItem(FACILITY_MISSION_KEY)!);
  expect(saved.available).toEqual({}); expect(saved.objectives).toEqual(mission.objectives);
  expect(JSON.parse(localStorage.getItem(FACILITY_PROFILE_KEY)!)).toMatchObject(profile);
  expect(Array.from(container.querySelectorAll<HTMLInputElement>('[data-fc-stock]')).every(input => input.value === '0')).toBe(true);
  expect(container.querySelector<HTMLDialogElement>('#fc-stock')!.open).toBe(true);
});

test('Callahan external Assembly Materials II can be switched back to a production stage from the supply list', async () => {
  view.unmount();
  const callahan = catalog.items.find(item => item.name === 'Callahan')!;
  const assembly = catalog.items.find(item => item.name === 'Assembly Materials II')!;
  localStorage.setItem(FACILITY_MISSION_KEY, JSON.stringify({ ...emptyFacilityMission(), objectives: [{ itemId: callahan.id, quantity: 1 }] }));
  localStorage.setItem(FACILITY_PROFILE_KEY, JSON.stringify({ ...emptyFacilityProfile(), recipes: { [assembly.id]: 'supply' } }));
  view = new FacilitiesView(); view.mount(container); await settle();
  expect(container.querySelector('[data-fc-supply-group="raw"]')!.textContent).toContain('Components');
  expect(container.querySelector('[data-fc-supply-group="liquids"]')!.textContent).toContain('cans of Oil');
  const row = Array.from(container.querySelectorAll<HTMLElement>('[data-fc-supply]')).find(row => row.dataset.fcSupply === assembly.id)!;
  expect(row.closest('[data-fc-supply-group]')!.getAttribute('data-fc-supply-group')).toBe('other');
  expect(row.textContent).toContain('External supply selected');
  row.querySelector<HTMLButtonElement>('[data-fc-produce]')!.click();
  expect(Array.from(container.querySelectorAll<HTMLElement>('[data-fc-supply]')).some(row => row.dataset.fcSupply === assembly.id)).toBe(false);
  const step = Array.from(container.querySelectorAll<HTMLElement>('[data-fc-step]')).find(row => row.dataset.fcStep === assembly.id)!;
  expect(step.textContent).toContain('840 Assembly Materials II');
  expect(step.textContent).toContain('Materials Factory — Forge');
  expect(JSON.parse(localStorage.getItem(FACILITY_PROFILE_KEY)!).recipes[assembly.id]).toBe(defaultFacilityRecipe(assembly)!.id);
  expect(container.querySelector('#fc-discord')!.getAttribute('data-raw')).not.toContain('Bring 840 Assembly Materials II');
});

test('a changed saved recipe blocks copying and exposes an explicit replacement choice', async () => {
  view.unmount();
  localStorage.setItem(FACILITY_MISSION_KEY, JSON.stringify({ ...emptyFacilityMission(), objectives: [{ itemId: train.id, quantity: 1 }] }));
  localStorage.setItem(FACILITY_PROFILE_KEY, JSON.stringify({ ...emptyFacilityProfile(), recipes: { [cmat.id]: 'removed' } }));
  view = new FacilitiesView(); view.mount(container); await settle();
  expect(container.querySelector('[role="alert"]')!.textContent).toContain('Saved recipe for Construction Materials has changed');
  expect(container.querySelector('[data-fc-action="copy"]')!.hasAttribute('disabled')).toBe(true);
  settings();
  const choice = Array.from(container.querySelectorAll<HTMLSelectElement>('[data-fc-recipe]')).find(select => select.dataset.fcRecipe === cmat.id)!;
  expect(choice.value).toBe('removed');
  choice.value = ''; choice.dispatchEvent(new Event('change', { bubbles: true }));
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test('faction filtering preserves the objectives and blocks an incompatible plan', () => {
  const goal = catalog.items.find(item => item.factions.length === 1 && item.factions[0] === 'warden' && item.recipes.some(recipe => recipe.source === 'Large Assembly Station'))!;
  addItem(goal.id);
  container.querySelector<HTMLButtonElement>('[data-fc-faction="colonial"]')!.click();
  expect(container.querySelectorAll('[data-fc-objective]')).toHaveLength(1);
  expect(container.querySelector('[role="alert"]')!.textContent).toContain('selected faction');
  openPicker();
  expect(Array.from(container.querySelectorAll<HTMLButtonElement>('[data-fc-add-item]')).some(button => button.dataset.fcAddItem === goal.id)).toBe(false);
});

test('failed loading offers retry and an unmounted pending request cannot overwrite the next view', async () => {
  view.unmount();
  (fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
  view = new FacilitiesView(); view.mount(container); await settle();
  expect(container.textContent).toContain('could not be loaded');
  container.querySelector<HTMLButtonElement>('[data-fc-action="retry"]')!.click(); await settle();
  expect(container.querySelector('[data-fc-add-item] img')).not.toBeNull();
  view.unmount();
  let resolve: (response: unknown) => void;
  (fetch as jest.Mock).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  view = new FacilitiesView(); view.mount(container); view.unmount(); container.textContent = 'Another view';
  resolve!({ ok: true, json: async () => catalog }); await settle();
  expect(container.textContent).toBe('Another view');
});

test('the fourth main tab selects Facilities and restores it after reloading the store', () => {
  const toolbarContainer = document.createElement('div'); document.body.append(toolbarContainer);
  const toolbar = new Toolbar(); toolbar.mount(toolbarContainer);
  toolbarContainer.querySelector<HTMLButtonElement>('#btn-mode-facilities')!.click();
  expect(store.viewMode).toBe('facilities');
  expect(toolbarContainer.querySelector('#btn-clear')!.textContent).toContain('Clear mission');
  store.viewMode = 'template'; store.load();
  expect(store.viewMode).toBe('facilities');
});
