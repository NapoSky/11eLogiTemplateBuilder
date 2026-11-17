import { getBaseUrl } from '../config';
import { iconAssetUrl } from '../services/iconPaths';
import { showToast } from '../services/toast';
import { createStockpileTooltip } from '../services/stockpileTooltip';
import { renderDiscordPreviewHtml } from '../services/discordPreview';
import { defaultFacilityRecipe, FACILITY_SOURCES, isFacilityObjective } from '../services/facilitiesCatalog';
import type { FacilitiesCatalog, FacilityItem, FacilityRecipe } from '../services/facilitiesCatalog';
import { canSupplyByPipeline, emptyFacilityMission, exportFacilityMission, facilityAmount, facilityDiscordChunks, facilityLiquidSupply, facilityStageAmount, facilitySupplyAmount, facilitySupplyTooltip, groupFacilitySupplies, planFacilities } from '../services/facilitiesPlanner';
import type { FacilityPlan } from '../services/facilitiesPlanner';
import { FacilitiesWorkspace, loadFacilitiesCatalog } from '../services/facilitiesStorage';

const html = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const field = 'w-full min-w-0 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400';
const button = 'px-3 py-2 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed';
const coreMaterials = new Set(['Construction Materials', 'Processed Construction Materials', 'Steel Construction Materials',
  'Assembly Materials I', 'Assembly Materials II', 'Assembly Materials III', 'Assembly Materials IV', 'Assembly Materials V',
  'Coke', 'Oil', 'Water', 'Diesel', 'Petrol', 'Heavy Oil', 'Enriched Oil', 'Rare Alloys', 'Thermal Shielding']);
const objectiveGroups = ['All', 'Vehicles', 'Equipment', 'Materials', 'Structures'] as const;
type ObjectiveGroup = (typeof objectiveGroups)[number];
const materialGroups = ['All', 'Raw Resources', 'Liquids', 'Materials', 'Assembly Materials', 'Parts & Assets'] as const;
type MaterialGroup = (typeof materialGroups)[number];
const rawResources = new Set(['Salvage', 'Components', 'Coal', 'Sulfur', 'Damaged Components', 'Aluminum', 'Iron', 'Copper', 'Rare Metal']);

export class FacilitiesView {
  private container: HTMLElement | null = null;
  private workspace = new FacilitiesWorkspace();
  private catalog: FacilitiesCatalog | null = null;
  private loadError = '';
  private search = '';
  private pickerOpen = true;
  private objectiveGroup: ObjectiveGroup = 'All';
  private activeDialog: 'settings' | 'stock' | null = null;
  private settingsSearch = '';
  private materialGroups: Record<'settings' | 'stock', MaterialGroup> = { settings: 'All', stock: 'All' };
  private allMaterials = false;
  private recipeDetailId = '';
  private settingsReturnFocus = 'fc-open-settings';
  private generation = 0;
  private rendering = false;
  private tooltip: ReturnType<typeof createStockpileTooltip> | null = null;
  private onClick = (event: Event) => { void this.click(event); };
  private onChange = (event: Event) => { void this.change(event); };
  private onInput = (event: Event) => this.input(event);
  private onExport = () => this.download(JSON.stringify({ version: 1, mission: this.workspace.mission, profile: this.workspace.profile }, null, 2), 'facility-mission.json', 'application/json');
  private onImport = () => this.container?.querySelector<HTMLInputElement>('#fc-load-mission')?.click();
  private onCancel = (event: Event) => {
    if ((event.target as HTMLElement).matches('dialog[data-fc-dialog]')) {
      event.preventDefault(); this.closeDialog();
    }
  };
  private onClear = () => {
    if (confirm('Clear this facility mission? Your facility profile will be kept.')) {
      this.workspace.mission = emptyFacilityMission(); this.pickerOpen = true; this.save();
    }
  };

  mount(container: HTMLElement): void {
    this.container = container;
    this.tooltip = createStockpileTooltip(container);
    this.workspace.load();
    this.pickerOpen = !this.workspace.mission.objectives.length;
    this.activeDialog = null;
    container.addEventListener('click', this.onClick);
    container.addEventListener('change', this.onChange);
    container.addEventListener('input', this.onInput);
    container.addEventListener('cancel', this.onCancel, true);
    window.addEventListener('facilities:clear-mission', this.onClear);
    window.addEventListener('facilities:export-mission', this.onExport);
    window.addEventListener('facilities:import-mission', this.onImport);
    void this.load();
  }

  unmount(): void {
    this.generation++;
    this.tooltip?.destroy(); this.tooltip = null;
    this.container?.removeEventListener('click', this.onClick);
    this.container?.removeEventListener('change', this.onChange);
    this.container?.removeEventListener('input', this.onInput);
    this.container?.removeEventListener('cancel', this.onCancel, true);
    window.removeEventListener('facilities:clear-mission', this.onClear);
    window.removeEventListener('facilities:export-mission', this.onExport);
    window.removeEventListener('facilities:import-mission', this.onImport);
    if (this.container) this.container.innerHTML = '';
    this.container = null;
  }

  private async load(): Promise<void> {
    const generation = ++this.generation;
    this.loadError = ''; this.render();
    try {
      const catalog = this.catalog ?? await loadFacilitiesCatalog();
      if (generation !== this.generation || !this.container) return;
      this.catalog = catalog;
    } catch (error) {
      if (generation !== this.generation || !this.container) return;
      this.loadError = error instanceof Error ? error.message : 'Facility recipes could not be loaded.';
    }
    this.render();
  }

  private icon(item: FacilityItem): string {
    const grade = item.name.match(/^Assembly Materials (I|II|III|IV|V)$/)?.[1];
    if (grade) return `<span class="relative inline-flex w-8 h-8 shrink-0" data-assembly-grade="${grade}">
      <img src="${html(iconAssetUrl('Textures/UI/ItemIcons/FacilityMaterials4Icon.png', getBaseUrl()))}" alt="" class="w-8 h-8 object-contain">
      <span aria-hidden="true" class="absolute -right-1 -bottom-0.5 rounded bg-gray-900 border border-gray-500 px-0.5 text-[9px] font-semibold leading-3 text-white">${grade}</span>
    </span>`;
    return item.icon ? `<img src="${html(iconAssetUrl(item.icon, getBaseUrl()))}" alt="" class="w-8 h-8 shrink-0 object-contain">`
      : '<span aria-hidden="true" class="w-8 h-8 shrink-0 rounded bg-gray-700 flex items-center justify-center text-gray-400">·</span>';
  }

  private recipeName(recipe: FacilityRecipe): string {
    return `${recipe.source}${recipe.category ? ` — ${recipe.category}` : ''}`;
  }

  private amount(amount: number, item: FacilityItem): string {
    return html(facilityAmount(amount, item));
  }

  private stageAmount(amount: number, item: FacilityItem, output = false, piped = false): string {
    if (piped) return `${html(item.name)} <span class="text-blue-300">(pipeline)</span>`;
    const liquid = facilityLiquidSupply(amount, item);
    if (!liquid) return this.amount(amount, item);
    const remainder = amount % liquid.litresPerCan;
    const detail = `${amount.toLocaleString('en-GB', { maximumFractionDigits: 3 })} L\n${liquid.litresPerCan} L per full can${output && remainder ? `\n${remainder.toLocaleString('en-GB', { maximumFractionDigits: 3 })} L outside full cans` : ''}`;
    return `<span tabindex="0" data-quantity-tooltip="${html(detail)}" class="border-b border-dotted border-gray-500 cursor-help">${html(facilityStageAmount(amount, item, output))}</span>`;
  }

  private pipelineButton(item: FacilityItem, settings = false): string {
    const active = this.workspace.profile.piped?.includes(item.id) ?? false;
    if (!canSupplyByPipeline(item) && !active) return '';
    const detail = active ? 'Remove pipeline supply\nPipeline supply is active. Click to remove this option and restore the saved recipe or delivery requirement.'
      : 'Enable pipeline supply\nAssume a continuous external supply. Production and deliveries for this liquid will be excluded.';
    return `<button type="button" id="${html(this.controlId(settings ? 'pipeline-settings' : 'pipeline-plan', item))}" data-fc-pipeline="${html(item.id)}" aria-label="Pipeline supply for ${html(item.name)}" aria-pressed="${active}" data-quantity-tooltip="${html(detail)}" class="inline-flex items-center justify-center gap-1.5 ${active ? 'px-3 py-2 rounded text-xs bg-blue-700 hover:bg-blue-600 text-white' : `${button} text-blue-300`}">${active ? `<svg aria-hidden="true" class="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 10 4 4 8-8"/></svg><span>Pipeline supplied</span><svg aria-hidden="true" class="w-3 h-3 shrink-0 opacity-80" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 4 8 8m0-8-8 8"/></svg>` : 'Use pipeline'}</button>`;
  }

  private setPipelineSupply(itemId: string, enabled: boolean): void {
    const item = this.catalog?.items.find(item => item.id === itemId);
    const piped = new Set(this.workspace.profile.piped ?? []);
    if (!item || (!canSupplyByPipeline(item) && !(piped.has(itemId) && !enabled))) return;
    if (enabled) piped.add(itemId); else piped.delete(itemId);
    this.workspace.profile.piped = [...piped]; this.save();
  }

  private plan(): FacilityPlan {
    return planFacilities(this.catalog!, this.workspace.mission, this.workspace.profile);
  }

  private render(): void {
    if (!this.container || this.rendering) return;
    this.rendering = true;
    try {
      this.tooltip?.hide();
      const active = document.activeElement as HTMLInputElement | null;
      const focusId = active && this.container.contains(active) ? active.id : '';
      const selection = active?.tagName === 'INPUT' && ['text', 'search'].includes(active.type)
        ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
      const scroll = this.container.querySelector('#fc-scroll')?.scrollTop ?? 0;
      const settingsScroll = this.container.querySelector('[data-fc-dialog-list]')?.scrollTop ?? 0;
      if (!this.catalog) {
        this.container.innerHTML = `<div class="p-6 text-sm ${this.loadError ? 'text-amber-300' : 'text-gray-400'}" role="status">${html(this.loadError || 'Loading facility recipes…')}${this.loadError ? `<button class="${button} ml-3" data-fc-action="retry">Try again</button>` : ''}</div>`;
        return;
      }
      const { mission, profile } = this.workspace;
      const plan = this.plan();
      const discord = exportFacilityMission(this.catalog, mission, profile, plan);
      const chunks = facilityDiscordChunks(discord);
      this.container.innerHTML = `<div id="fc-scroll" class="h-full overflow-y-auto">
        <div class="max-w-[1600px] mx-auto p-4 sm:p-6">
          <div class="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div><h2 class="text-xl font-semibold">Facilities</h2><p class="text-sm text-gray-400 mt-1">Turn production objectives into a task force plan.</p></div>
          </div>
          <input id="fc-load-mission" type="file" accept=".json" class="hidden" aria-label="Load facility mission">
          ${this.workspace.warning ? `<p role="status" class="text-sm text-amber-300 mb-4">${html(this.workspace.warning)}</p>` : ''}
          <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
            <div class="min-w-0 space-y-4">
              <section class="rounded-lg border border-gray-700 bg-gray-800 p-4" aria-labelledby="fc-objectives-title">
                <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 id="fc-objectives-title" class="font-semibold">Objectives</h3>
                  <div role="group" aria-label="Faction" class="flex gap-1">
                    ${(['all', 'warden', 'colonial'] as const).map(faction => `<button type="button" data-fc-faction="${faction}" aria-pressed="${mission.faction === faction}" class="px-3 py-1.5 rounded text-xs ${mission.faction === faction ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}">${faction === 'all' ? 'All' : faction === 'warden' ? 'Warden' : 'Colonial'}</button>`).join('')}
                  </div>
                </div>
                <label for="fc-title" class="block text-xs text-gray-400 mb-1">Task force name</label>
                <input id="fc-title" type="text" maxlength="150" value="${html(mission.title)}" placeholder="e.g. Two logistics trains" class="${field} mb-3">
                ${mission.objectives.map((goal, index) => {
                  const item = this.catalog!.items.find(item => item.id === goal.itemId);
                  return `<div class="grid grid-cols-[32px_minmax(0,1fr)_72px_24px] sm:grid-cols-[32px_minmax(0,1fr)_96px_24px] items-center gap-2 py-3 border-t border-gray-700" data-fc-objective="${index}">
                    ${item ? this.icon(item) : '<span></span>'}<span class="min-w-0 text-sm font-medium">${html(item?.name ?? 'Unavailable item')}</span>
                    <label class="text-xs text-gray-400">${html(item?.unit ?? 'units')}<input id="fc-goal-${index}" data-fc-quantity="${index}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="7" autocomplete="off" value="${goal.quantity}" class="block w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 mt-1 text-sm text-white tabular-nums"></label>
                    <button class="text-red-400 hover:text-red-300 px-2 py-1" data-fc-remove="${index}" aria-label="Remove ${html(item?.name ?? 'objective')}">×</button>
                  </div>`;
                }).join('')}
                <button id="fc-add-objective" type="button" data-fc-action="toggle-picker" aria-expanded="${this.pickerOpen}" aria-controls="fc-picker-panel" class="${button} mt-2 text-blue-200">${this.pickerOpen ? 'Close item selection' : '+ Add objective'}</button>
                ${this.pickerOpen ? `<div id="fc-picker-panel" class="mt-3 rounded border border-gray-700 bg-gray-900/50 p-3">
                  <label for="fc-search" class="sr-only">Search objectives</label>
                  <input id="fc-search" type="search" value="${html(this.search)}" placeholder="Search vehicles, equipment or materials…" class="${field}">
                  <div role="group" aria-label="Objective category" class="flex flex-wrap gap-1 mt-2">
                    ${objectiveGroups.map(group => `<button type="button" id="fc-filter-${group}" data-fc-group="${group}" aria-pressed="${this.objectiveGroup === group}" class="px-2 py-1 text-xs rounded ${this.objectiveGroup === group ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}">${group}</button>`).join('')}
                  </div>
                  <div id="fc-picker" class="mt-2">${this.renderPicker()}</div>
                </div>` : ''}
              </section>
              <section class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3" aria-label="Facility profile">
                <div class="min-w-0"><p class="text-sm font-medium break-words">${html(profile.name)}</p><p class="text-xs text-gray-400 mt-0.5 break-words">${html(profile.location || 'Set your recipes and delivery location')}</p></div>
                <div class="flex flex-wrap gap-2">
                  <button id="fc-open-settings" class="${button}" data-fc-action="open-settings">Facility Settings</button>
                  <button id="fc-open-stock" class="${button}" data-fc-action="open-stock">Available Stock${plan.stock.length ? ` (${plan.stock.length})` : ''}</button>
                </div>
              </section>
              ${plan.errors.length ? `<section role="alert" class="rounded-lg border border-amber-700 bg-amber-950/20 text-amber-200 p-4 text-sm"><strong>Review this mission</strong><ul class="list-disc pl-5 mt-2 space-y-1">${plan.errors.map(error => `<li>${html(error)}</li>`).join('')}</ul></section>` : this.renderPlan(plan)}
            </div>
            <aside class="min-w-0 xl:sticky xl:top-4 rounded-lg border border-gray-700 bg-gray-800 overflow-hidden" aria-label="Discord preview">
              <h3 class="px-4 py-3 border-b border-gray-700 text-sm">Discord Preview</h3>
              <div class="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-gray-700">
                <span id="fc-char-count" class="text-xs font-mono ${discord.length > 4000 ? 'text-red-400 font-bold' : 'text-gray-400'}">${discord.length} / 4000</span>
                <button id="fc-copy" type="button" class="ml-auto px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed" data-fc-action="copy" ${discord ? '' : 'disabled'}>📋 Copy</button>
                <button id="fc-download" type="button" class="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed" data-fc-action="text" ${discord ? '' : 'disabled'}>⬇️ .txt</button>
              </div>
              ${chunks.length > 1 ? `<div class="px-4 pt-3"><p class="text-xs text-gray-400 mb-2">Or copy as ${chunks.length} Discord messages:</p><div class="flex flex-wrap gap-2">${chunks.map((_, index) => `<button type="button" class="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs" data-fc-action="copy" data-fc-part="${index}">📋 Copy ${index + 1}/${chunks.length}</button>`).join('')}</div></div>` : ''}
              <pre id="fc-discord" data-raw="${html(discord)}" class="p-4 text-xs whitespace-pre-wrap break-words font-mono text-gray-200 max-h-[65vh] overflow-auto">${renderDiscordPreviewHtml(discord || 'Add objectives to generate your task force briefing.')}</pre>
            </aside>
          </div>
          <p class="text-xs text-gray-500 mt-5">Material plan · Power generation fuel, maintenance and transport excluded · Wiki data ${html(this.catalog.capturedOn)}</p>
        </div>
      </div>${this.activeDialog ? this.renderDialog(plan) : ''}`;
      this.container.querySelector('#fc-scroll')!.scrollTop = scroll;
      const dialog = this.container.querySelector<HTMLDialogElement>('dialog[data-fc-dialog]');
      if (dialog) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        const list = this.container.querySelector('[data-fc-dialog-list]');
        if (list) list.scrollTop = settingsScroll;
      }
      if (focusId) {
        const target = Array.from(this.container.querySelectorAll<HTMLElement>('[id]')).find(element => element.id === focusId) as HTMLInputElement | undefined;
        target?.focus({ preventScroll: true });
        if (selection && target && ['text', 'search'].includes(target.type)) target.setSelectionRange(selection.start, selection.end, selection.direction ?? undefined);
      }
    } finally {
      this.rendering = false;
    }
  }

  private itemLabel(item: FacilityItem): string {
    return `${item.name}${item.unit === 'crates' ? ' (crate)' : ''}`;
  }

  private itemGroup(item: FacilityItem): ObjectiveGroup {
    if (item.kind === 'vehicle') return 'Vehicles';
    if (item.kind === 'structure') return 'Structures';
    if (coreMaterials.has(item.name) || item.recipes.some(recipe => ['Materials Factory', 'Metalworks Factory', 'Coal Refinery', 'Oil Refinery', 'Aircraft Maintenance Factory', 'Concrete Mixer', 'Water Pump'].includes(recipe.source))) return 'Materials';
    return 'Equipment';
  }

  private renderPicker(): string {
    const faction = this.workspace.mission.faction;
    const query = this.search.trim().toLowerCase();
    const candidates = this.catalog!.items.filter(item => isFacilityObjective(item) &&
      (faction === 'all' || !item.factions.length || item.factions.includes(faction)) &&
      (this.objectiveGroup === 'All' || this.itemGroup(item) === this.objectiveGroup) && this.itemLabel(item).toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));
    return `<p class="text-xs text-gray-400 mb-2" aria-live="polite">${candidates.length} ${candidates.length === 1 ? 'item' : 'items'} · Click an item to add it</p>
      <div class="max-h-56 overflow-y-auto overscroll-contain pr-1" aria-label="Available objectives">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${candidates.map((item, index) => {
            const quantity = this.workspace.mission.objectives.filter(goal => goal.itemId === item.id).reduce((sum, goal) => sum + goal.quantity, 0);
            return `<button type="button" id="fc-candidate-${index}" data-fc-add-item="${html(item.id)}" aria-label="Add ${html(this.itemLabel(item))}" title="${html(this.itemLabel(item))}" class="flex items-center gap-3 text-left min-w-0 rounded border border-gray-700 bg-gray-800 p-2 hover:bg-gray-700 hover:border-blue-500 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-40" ${this.workspace.mission.objectives.length >= 100 ? 'disabled' : ''}>
              ${this.icon(item)}<span class="flex-1 min-w-0"><span class="block text-xs sm:text-sm">${html(this.itemLabel(item))}</span><span class="block text-[11px] text-gray-400 mt-0.5">${quantity ? `In mission: ${quantity}` : this.itemGroup(item)}</span></span><span aria-hidden="true" class="text-blue-300 px-1">+</span>
            </button>`;
          }).join('') || '<p class="text-sm text-gray-400 py-4 col-span-full">No matching items. Try another search or filter.</p>'}
        </div>
      </div>`;
  }

  private missionItems(plan: FacilityPlan): FacilityItem[] {
    const ids = new Set(this.workspace.mission.objectives.map(goal => goal.itemId));
    if (plan.errors.length) plan.relevant.forEach(item => ids.add(item.id));
    for (const step of plan.steps) {
      ids.add(step.item.id);
      step.inputs.forEach(input => ids.add(input.item.id));
    }
    [...plan.supplies, ...plan.stock, ...plan.piped].forEach(row => ids.add(row.item.id));
    return this.catalog!.items.filter(item => ids.has(item.id));
  }

  private controlId(type: string, item: FacilityItem): string {
    return `fc-${type}-${encodeURIComponent(item.id)}`;
  }

  private materialGroup(item: FacilityItem): Exclude<MaterialGroup, 'All'> {
    if (item.unit === 'L') return 'Liquids';
    if (rawResources.has(item.name)) return 'Raw Resources';
    if (/^Assembly Materials (I|II|III|IV|V)$/.test(item.name)) return 'Assembly Materials';
    if (item.kind === 'item' && (coreMaterials.has(item.name) || item.recipes.some(recipe =>
      ['Materials Factory', 'Metalworks Factory', 'Coal Refinery', 'Oil Refinery', 'Refinery', 'Concrete Mixer'].includes(recipe.source)))) return 'Materials';
    return 'Parts & Assets';
  }

  private renderDialog(plan: FacilityPlan): string {
    const { profile, mission } = this.workspace;
    const isStock = this.activeDialog === 'stock';
    const dialogId = isStock ? 'fc-stock' : 'fc-settings';
    const title = isStock ? 'Available Stock' : 'Facility Settings';
    const action = isStock ? 'stock' : 'recipes';
    const selectedGroup = this.materialGroups[isStock ? 'stock' : 'settings'];
    const objectives = new Set(mission.objectives.map(goal => goal.itemId));
    const needed = new Set(this.missionItems(plan).map(item => item.id));
    const showAll = this.allMaterials || !mission.objectives.length;
    const query = this.settingsSearch.trim().toLowerCase();
    const candidates = this.catalog!.items.filter(item => {
      if (objectives.has(item.id)) return false;
      if (isStock) return needed.has(item.id) || (mission.available[item.id] ?? 0) > 0;
      return (item.recipes.length > 0 || canSupplyByPipeline(item) || profile.piped?.includes(item.id) || (Object.hasOwn(profile.recipes, item.id) && profile.recipes[item.id] !== 'supply')) &&
        (needed.has(item.id) || (showAll && (coreMaterials.has(item.name) || Object.hasOwn(profile.recipes, item.id))));
    });
    const items = candidates.filter(item => (selectedGroup === 'All' || this.materialGroup(item) === selectedGroup) &&
      `${this.itemLabel(item)} ${item.recipes.map(recipe => this.recipeName(recipe)).join(' ')}`.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));
    return `<dialog id="${dialogId}" data-fc-dialog="${this.activeDialog}" aria-labelledby="${dialogId}-title" class="m-auto p-0 w-[calc(100%-2rem)] max-w-4xl max-h-[85vh] rounded-xl border border-gray-600 bg-gray-800 text-white shadow-2xl backdrop:bg-black/60">
      <div class="flex flex-col max-h-[85vh]">
        <header class="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-700 shrink-0">
          <h3 id="${dialogId}-title" class="font-semibold">${title}</h3>
          <button type="button" id="fc-clear-${action}" data-fc-action="clear-${action}" aria-label="${isStock ? 'Clear all available stock' : 'Reset all recipes to defaults'}" title="${isStock ? 'Clear every allocated quantity, including filtered items. Keeps recipes and pipeline connections.' : 'Reset every recipe choice, including filtered items. Keeps allocated stock and pipeline connections.'}" class="ml-auto px-3 py-2 rounded text-xs bg-red-600/50 hover:bg-red-600 text-white">Clear</button>
          <button type="button" id="fc-close-${this.activeDialog}" data-fc-action="close-dialog" aria-label="Close ${title}" class="text-xl text-gray-400 hover:text-white px-2">×</button>
        </header>
        <div class="px-4 py-3 shrink-0 space-y-3">
          ${!isStock ? `<div class="grid sm:grid-cols-2 gap-3">
            <label class="text-xs text-gray-400">Facility profile<input id="fc-profile-name" type="text" maxlength="150" value="${html(profile.name)}" class="${field} mt-1"></label>
            <label class="text-xs text-gray-400">Delivery location<input id="fc-location" type="text" maxlength="300" value="${html(profile.location)}" placeholder="Region / facility / drop-off" class="${field} mt-1"></label>
          </div><div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs text-gray-400">Choose your production method, or supply the item from elsewhere.</p>
            <div class="flex gap-2"><button type="button" class="${button}" data-fc-action="save-profile">Export profile</button><label class="${button} cursor-pointer">Import profile<input id="fc-load-profile" type="file" accept=".json" class="sr-only"></label></div>
          </div>` : '<p class="text-xs text-gray-400">Enter stock already set aside for this mission. It will be deducted before calculating production. For connected liquids, select Supplied by pipeline to assume a continuous supply.</p>'}
          <div class="flex flex-wrap items-center gap-3">
            <label for="${dialogId}-search" class="sr-only">Search ${isStock ? 'available stock' : 'recipes'}</label>
            <input id="${dialogId}-search" type="search" value="${html(this.settingsSearch)}" placeholder="Search ${isStock ? 'mission items' : 'materials or buildings'}…" class="${field} flex-1 min-w-[160px]">
            ${!isStock && mission.objectives.length ? `<label class="flex items-center gap-2 text-xs text-gray-300"><input id="fc-all-materials" type="checkbox" ${this.allMaterials ? 'checked' : ''} class="accent-blue-500">All materials</label>` : ''}
          </div>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter ${isStock ? 'available stock' : 'recipes'} by material type">
            ${materialGroups.map((group, index) => {
              const count = candidates.filter(item => group === 'All' || this.materialGroup(item) === group).length;
              return `<button type="button" id="${dialogId}-filter-${index}" data-fc-material-group="${html(group)}" aria-pressed="${selectedGroup === group}" class="px-2 py-1 text-xs rounded ${selectedGroup === group ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}">${html(group)} <span class="opacity-60">${count}</span></button>`;
            }).join('')}
          </div>
        </div>
        <div id="${dialogId}-list" data-fc-dialog-list class="px-4 overflow-y-auto overscroll-contain min-h-0 max-h-[40vh]" aria-label="${isStock ? 'Allocated stock' : 'Production recipes'}">
          ${items.map(item => isStock ? this.renderStockRow(item) : this.renderRecipeRow(item)).join('') || `<p class="text-sm text-gray-400 py-6 text-center">${!mission.objectives.length && isStock && !candidates.length ? 'Add objectives before allocating stock.' : query || selectedGroup !== 'All' ? 'No matching items. Try another search or filter.' : 'No items to configure for this mission.'}</p>`}
        </div>
        <footer class="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-700 shrink-0">
          <span class="text-xs ${this.workspace.warning ? 'text-amber-300' : 'text-gray-400'}">${html(this.workspace.warning || 'Changes are saved automatically in this browser.')}</span>
          <button type="button" class="${button}" data-fc-action="close-dialog">Done</button>
        </footer>
      </div>
    </dialog>`;
  }

  private renderStockRow(item: FacilityItem): string {
    const id = this.controlId('stock', item);
    const piped = this.workspace.profile.piped?.includes(item.id) ?? false;
    return `<div class="grid grid-cols-[32px_minmax(0,1fr)_88px] items-center gap-3 py-2 border-t border-gray-700" data-fc-settings-item="${html(item.id)}">
      ${this.icon(item)}<div class="min-w-0"><label for="${html(id)}" class="text-sm">${html(this.itemLabel(item))}</label><span class="block text-xs text-gray-400">Available (${html(item.unit)})</span>
        ${canSupplyByPipeline(item) || piped ? `<label class="flex items-center gap-2 mt-1 text-xs text-blue-300 cursor-pointer"><input id="${html(this.controlId('stock-pipeline', item))}" data-fc-stock-pipeline="${html(item.id)}" type="checkbox" aria-label="Pipeline supply for ${html(item.name)}" ${piped ? 'checked' : ''} class="accent-blue-500 shrink-0">Supplied by pipeline</label>` : ''}
      </div>
      <input id="${html(id)}" aria-label="Available ${html(item.unit)} of ${html(item.name)}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="7" autocomplete="off" data-fc-stock="${html(item.id)}" value="${this.workspace.mission.available[item.id] ?? 0}" class="${field} tabular-nums disabled:opacity-50" ${piped ? 'disabled' : ''}>
    </div>`;
  }

  private renderRecipeRow(item: FacilityItem): string {
    const choice = this.workspace.profile.recipes[item.id];
    const piped = this.workspace.profile.piped?.includes(item.id) ?? false;
    const recipe = choice === 'supply' ? undefined : item.recipes.find(recipe => recipe.id === choice) ?? (choice ? undefined : defaultFacilityRecipe(item));
    const stale = !piped && choice && choice !== 'supply' && !recipe;
    const id = this.controlId('recipe', item);
    const expanded = this.recipeDetailId === item.id;
    return `<div class="py-2 border-t ${stale ? 'border-amber-700' : 'border-gray-700'}" data-fc-settings-item="${html(item.id)}">
      <div class="grid grid-cols-1 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] gap-2 items-center">
        <label for="${html(id)}" class="flex items-center gap-3 min-w-0">${this.icon(item)}<span class="min-w-0 text-sm">${html(this.itemLabel(item))}</span></label>
        <div class="flex items-center gap-2 min-w-0">
          <select id="${html(id)}" data-fc-recipe="${html(item.id)}" class="${field} disabled:opacity-50" ${piped ? 'disabled' : ''}>
            ${stale ? `<option value="${html(choice)}" selected>Saved recipe changed — choose again</option>` : ''}
            <option value="" ${!choice ? 'selected' : ''}>Default: ${html(defaultFacilityRecipe(item) ? this.recipeName(defaultFacilityRecipe(item)!) : 'Supply from outside')}</option>
            <option value="supply" ${choice === 'supply' ? 'selected' : ''}>Supply from outside</option>
            ${item.recipes.map(recipe => `<option value="${html(recipe.id)}" ${recipe.id === choice ? 'selected' : ''}>${html(this.recipeName(recipe))} (${recipe.amount} ${html(item.unit)}/batch)</option>`).join('')}
          </select>
          <button type="button" id="${html(this.controlId('info', item))}" data-fc-recipe-info="${html(item.id)}" aria-label="Recipe inputs for ${html(item.name)}" aria-expanded="${expanded}" class="w-7 h-7 shrink-0 rounded-full border border-gray-600 text-xs text-blue-300 hover:bg-gray-700 disabled:opacity-30" ${recipe && !piped ? '' : 'disabled'}>i</button>
        </div>
      </div>
      ${canSupplyByPipeline(item) || piped ? `<div class="flex flex-wrap items-center gap-2 mt-2">${this.pipelineButton(item, true)}${piped ? '<span class="text-xs text-gray-400">Continuous supply assumed; production and deliveries excluded.</span>' : ''}</div>` : ''}
      ${recipe && expanded && !piped ? `<p class="text-xs text-gray-400 rounded bg-gray-900/50 p-2 mt-2">${recipe.inputs.map(input => this.amount(input.amount, this.catalog!.items.find(item => item.id === input.itemId)!)).join(' + ') || 'No material input'} → ${this.amount(recipe.amount, item)}${recipe.power ? ` · ${recipe.power} MW` : ''}</p>` : ''}
    </div>`;
  }

  private closeDialog(): void {
    this.activeDialog = null; this.render();
    this.container?.querySelector<HTMLButtonElement>(`#${this.settingsReturnFocus}`)?.focus({ preventScroll: true });
  }

  private renderPlan(plan: FacilityPlan): string {
    if (!this.workspace.mission.objectives.length) return '<div class="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center text-sm text-gray-400">Add what you want to produce. Your supply list and production stages will appear here.</div>';
    const groups = [...new Set(plan.steps.map(step => step.level))];
    return `<section class="rounded-lg border border-gray-700 bg-gray-800 p-4" aria-label="Supplies to bring">
      <h3 class="text-sm font-semibold mb-3">Supplies to bring</h3>
      ${groupFacilitySupplies(plan.supplies).map(group => `<div class="mt-3" data-fc-supply-group="${group.id}">
        <h4 class="border-l-2 pl-2 text-xs font-semibold ${group.id === 'raw' ? 'border-amber-400 text-amber-300' : group.id === 'liquids' ? 'border-blue-400 text-blue-300' : 'border-gray-500 text-gray-300'}">${group.label}</h4>
        ${group.id === 'raw' ? '<p class="text-xs text-gray-400 mt-1">5,000 units per Resource Container. Rounded up for delivery.</p>' : ''}
        ${group.id === 'liquids' ? '<p class="text-xs text-gray-400 mt-1">Full cans, rounded up. Hover or focus for litres.</p>' : ''}
        ${group.items.map(row => {
          const external = this.workspace.profile.recipes[row.item.id] === 'supply' && defaultFacilityRecipe(row.item);
          const detail = facilitySupplyTooltip(row.amount, row.item);
          return `<div class="flex flex-wrap items-center gap-2 py-2 border-b border-gray-700 text-sm" data-fc-supply="${html(row.item.id)}">
            ${this.icon(row.item)}<div class="flex-1 min-w-0"><span ${detail ? `tabindex="0" data-quantity-tooltip="${html(detail)}" class="border-b border-dotted border-gray-500 cursor-help"` : ''}>${html(facilitySupplyAmount(row.amount, row.item))}</span>${external ? '<p class="text-xs text-amber-300 mt-0.5">External supply selected in Facility settings</p>' : ''}</div>
            ${external ? `<button type="button" class="${button} text-blue-300" data-fc-produce="${html(row.item.id)}" aria-label="Produce ${html(row.item.name)} here" title="${html(this.recipeName(external))}">Produce here</button>` : ''}
            ${this.pipelineButton(row.item)}
          </div>`;
        }).join('')}
      </div>`).join('') || '<p class="text-sm text-gray-400">No additional supplies needed.</p>'}
      ${plan.piped.length ? `<div class="mt-4" data-fc-piped-supplies>
        <h4 class="text-sm font-medium text-blue-300">Supplied by pipeline</h4><p class="text-xs text-gray-400 mt-1">Continuous supply assumed. Excluded from gathering and upstream production; flow and power are not checked.</p>
        ${plan.piped.map(row => `<div class="flex flex-wrap items-center gap-2 py-2">${this.icon(row.item)}<span class="flex-1 text-sm"><span tabindex="0" class="border-b border-dotted border-gray-500 cursor-help" data-quantity-tooltip="${html(row.amount > 0 ? `${row.amount.toLocaleString('en-GB')} L required\nContinuous pipeline supply assumed.` : 'Configured pipeline supply\nNo direct consumption in the current production stages.')}">${html(row.item.name)}</span></span>${this.pipelineButton(row.item)}</div>`).join('')}
      </div>` : ''}
      ${plan.stock.length ? `<p class="text-xs text-gray-400 mt-3">Already allocated: ${plan.stock.map(row => this.amount(row.amount, row.item)).join(' · ')}</p>` : ''}
    </section>
    ${groups.map(level => `<section class="rounded-lg border border-gray-700 bg-gray-800 overflow-hidden" data-fc-stage="${level}">
      <h3 class="px-4 py-3 text-sm font-semibold border-b border-gray-700">Stage ${level}</h3>
      ${plan.steps.filter(step => step.level === level).map(step => `<div class="px-4 py-3 border-b border-gray-700 last:border-b-0" data-fc-step="${html(step.item.id)}">
        <div class="flex items-center gap-2">${this.icon(step.item)}<strong class="text-sm">${this.stageAmount(step.produced, step.item, true)}</strong><span class="ml-auto text-xs text-gray-400 shrink-0">${step.batches} batch${step.batches === 1 ? '' : 'es'}</span></div>
        <div class="flex flex-wrap items-center gap-2 mt-1"><p class="text-xs text-blue-300">${html(this.recipeName(step.recipe))}${step.recipe.power ? ` · ${step.recipe.power} MW` : ''}</p>${this.pipelineButton(step.item)}</div>
        <p class="text-xs text-gray-400 mt-1">Inputs: ${step.inputs.map(input => this.stageAmount(input.amount, input.item, false, this.workspace.profile.piped?.includes(input.item.id))).join(' + ') || 'None'}</p>
        ${step.surplus ? `<p class="text-xs text-gray-400 mt-1">${this.stageAmount(step.needed, step.item)} needed · Surplus: ${this.stageAmount(step.surplus, step.item, true)}</p>` : ''}
        ${step.byproducts.length ? `<p class="text-xs text-gray-400 mt-1">Byproducts, not deducted: ${step.byproducts.map(output => this.stageAmount(output.amount, output.item, true)).join(' + ')}</p>` : ''}
      </div>`).join('')}
    </section>`).join('')}
    ${!plan.steps.length ? '<p class="text-sm text-gray-400">Objectives covered by allocated stock or external supplies.</p>' : ''}`;
  }

  private save(): void {
    if (this.catalog) {
      // Freeze the displayed defaults on first use so wiki updates require review.
      for (const item of this.plan().relevant) {
        if (!Object.hasOwn(this.workspace.profile.recipes, item.id)) this.workspace.profile.recipes[item.id] = defaultFacilityRecipe(item)?.id ?? 'supply';
      }
    }
    this.workspace.save(); this.render();
  }

  private input(event: Event): void {
    if (this.rendering) return;
    const target = event.target as HTMLInputElement;
    if (target.id === 'fc-search') {
      this.search = target.value;
      this.container!.querySelector('#fc-picker')!.innerHTML = this.renderPicker();
    } else if (target.id === 'fc-settings-search' || target.id === 'fc-stock-search') {
      this.settingsSearch = target.value; this.render();
    } else if (target.id === 'fc-title') {
      this.workspace.mission.title = target.value; this.save();
    } else if (target.id === 'fc-profile-name' || target.id === 'fc-location' || target.dataset.fcQuantity !== undefined || target.dataset.fcStock !== undefined) {
      if ((target.dataset.fcQuantity !== undefined || target.dataset.fcStock !== undefined) &&
        (!/^\d+$/.test(target.value.trim()) || !Number.isSafeInteger(Number(target.value)) || Number(target.value) < (target.dataset.fcQuantity !== undefined ? 1 : 0) || Number(target.value) > 1_000_000)) return;
      void this.change(event);
    }
  }

  private async change(event: Event): Promise<void> {
    if (this.rendering) return;
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target.dataset.fcStockPipeline !== undefined) {
      this.setPipelineSupply(target.dataset.fcStockPipeline, (target as HTMLInputElement).checked); return;
    }
    if (target.id === 'fc-all-materials') { this.allMaterials = (target as HTMLInputElement).checked; this.render(); return; }
    if (target.id === 'fc-load-profile' || target.id === 'fc-load-mission') {
      const file = (target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        if (file.size > 2_000_000) throw new Error('The file is too large.');
        const type = target.id === 'fc-load-profile' ? 'profile' : 'mission';
        this.workspace.importDocument(await file.text(), type);
        this.activeDialog = type === 'profile' ? 'settings' : null;
        this.materialGroups = { settings: 'All', stock: 'All' };
        this.settingsSearch = '';
        this.pickerOpen = !this.workspace.mission.objectives.length;
        this.render();
      } catch (error) { showToast(error instanceof Error ? error.message : 'Could not import the file.', { type: 'error' }); target.value = ''; }
      return;
    }
    if (target.id === 'fc-profile-name') this.workspace.profile.name = target.value;
    else if (target.id === 'fc-location') this.workspace.profile.location = target.value;
    else if (target.dataset.fcRecipe !== undefined) {
      if (target.value) this.workspace.profile.recipes[target.dataset.fcRecipe] = target.value;
      else delete this.workspace.profile.recipes[target.dataset.fcRecipe];
      this.recipeDetailId = target.dataset.fcRecipe;
    } else if (target.dataset.fcQuantity !== undefined || target.dataset.fcStock !== undefined) {
      const value = Number(target.value);
      const minimum = target.dataset.fcQuantity !== undefined ? 1 : 0;
      if (!/^\d+$/.test(target.value.trim()) || !Number.isSafeInteger(value) || value < minimum || value > 1_000_000) {
        target.value = String(target.dataset.fcStock !== undefined ? this.workspace.mission.available[target.dataset.fcStock] ?? 0 : this.workspace.mission.objectives[Number(target.dataset.fcQuantity)]?.quantity ?? 1);
        return;
      }
      if (target.dataset.fcStock !== undefined) this.workspace.mission.available[target.dataset.fcStock] = value;
      else this.workspace.mission.objectives[Number(target.dataset.fcQuantity)].quantity = value;
    } else return;
    this.save();
  }

  private download(contents: string, filename: string, type: string): void {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement('a'); link.href = url; link.download = filename;
    link.click(); URL.revokeObjectURL(url);
  }

  private async click(event: Event): Promise<void> {
    if ((event.target as HTMLElement).matches('dialog[data-fc-dialog]')) { this.closeDialog(); return; }
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-fc-action], [data-fc-remove], [data-fc-faction], [data-fc-add-item], [data-fc-group], [data-fc-material-group], [data-fc-recipe-info], [data-fc-produce], [data-fc-pipeline]');
    if (!target || !this.container?.contains(target)) return;
    if (target.dataset.fcMaterialGroup && this.activeDialog) {
      this.materialGroups[this.activeDialog] = target.dataset.fcMaterialGroup as MaterialGroup;
      this.render(); return;
    }
    if (target.dataset.fcPipeline) {
      this.setPipelineSupply(target.dataset.fcPipeline, !this.workspace.profile.piped?.includes(target.dataset.fcPipeline));
      return;
    }
    if (target.dataset.fcProduce) {
      const item = this.catalog?.items.find(item => item.id === target.dataset.fcProduce);
      const recipe = item && defaultFacilityRecipe(item);
      if (item && recipe) { this.workspace.profile.recipes[item.id] = recipe.id; this.save(); }
      return;
    }
    if (target.dataset.fcAddItem) {
      this.addObjective(target.dataset.fcAddItem); return;
    }
    if (target.dataset.fcGroup) {
      this.objectiveGroup = target.dataset.fcGroup as ObjectiveGroup; this.render(); return;
    }
    if (target.dataset.fcRecipeInfo) {
      this.recipeDetailId = this.recipeDetailId === target.dataset.fcRecipeInfo ? '' : target.dataset.fcRecipeInfo;
      this.render(); return;
    }
    if (target.dataset.fcFaction) {
      this.workspace.mission.faction = target.dataset.fcFaction as 'all' | 'warden' | 'colonial'; this.save(); return;
    }
    if (target.dataset.fcRemove !== undefined) {
      this.workspace.mission.objectives.splice(Number(target.dataset.fcRemove), 1); this.save(); return;
    }
    switch (target.dataset.fcAction) {
      case 'retry': await this.load(); break;
      case 'toggle-picker':
        this.pickerOpen = !this.pickerOpen; this.render();
        if (this.pickerOpen) this.container?.querySelector<HTMLInputElement>('#fc-search')?.focus({ preventScroll: true });
        break;
      case 'open-settings': case 'open-stock':
        this.settingsReturnFocus = target.id;
        this.activeDialog = target.dataset.fcAction === 'open-stock' ? 'stock' : 'settings';
        this.settingsSearch = ''; this.recipeDetailId = ''; this.render();
        break;
      case 'close-dialog': this.closeDialog(); break;
      case 'clear-recipes':
        this.workspace.profile.recipes = {}; this.recipeDetailId = ''; this.save();
        showToast('Recipes reset to defaults.'); break;
      case 'clear-stock':
        this.workspace.mission.available = {}; this.save();
        showToast('Allocated stock cleared.'); break;
      case 'save-profile': this.download(JSON.stringify(this.workspace.profile, null, 2), 'facility-profile.json', 'application/json'); break;
      case 'copy': case 'text': {
        if (!this.catalog) return;
        const text = this.container?.querySelector<HTMLElement>('#fc-discord')?.dataset.raw ?? '';
        if (!text) return;
        if (target.dataset.fcAction === 'text') this.download(text, 'facility-todo.txt', 'text/plain;charset=utf-8');
        else try {
          const part = target.dataset.fcPart;
          await navigator.clipboard.writeText(part === undefined ? text : facilityDiscordChunks(text)[Number(part)]);
          showToast(part === undefined ? 'Copied!' : `Message ${Number(part) + 1} copied.`, { type: 'success' });
        }
        catch { showToast('Could not copy. Use the .txt export instead.', { type: 'error' }); }
        break;
      }
    }
  }

  private addObjective(id: string): void {
    if (this.workspace.mission.objectives.length >= 100) return;
    const item = this.catalog?.items.find(item => item.id === id);
    if (!item || !isFacilityObjective(item)) return;
    const faction = this.workspace.mission.faction;
    if (faction !== 'all' && item.factions.length && !item.factions.includes(faction)) return;
    if (!defaultFacilityRecipe(item) && !Object.hasOwn(this.workspace.profile.recipes, item.id)) {
      this.workspace.profile.recipes[item.id] = item.recipes.find(recipe => FACILITY_SOURCES.has(recipe.source))!.id;
    }
    const existing = this.workspace.mission.objectives.find(goal => goal.itemId === id);
    if (existing) existing.quantity = Math.min(1_000_000, existing.quantity + 1);
    else this.workspace.mission.objectives.push({ itemId: id, quantity: 1 });
    this.pickerOpen = false; this.search = ''; this.save();
    const index = this.workspace.mission.objectives.findIndex(goal => goal.itemId === id);
    this.container?.querySelector<HTMLInputElement>(`#fc-goal-${index}`)?.focus({ preventScroll: true });
  }
}
