import { store, IconScale, ICON_SCALES } from '../store';
import { bustBackgroundImageCache, inlineCrossOriginBackgrounds, neutralizeTaintingFilters } from '../services/html2canvasBgFix';

export class Toolbar {
  private container: HTMLElement | null = null;
  private helpModalVisible = false;
  private isExportingPng = false;
  private helpLang: 'en' | 'fr' = 'en';

  mount(container: HTMLElement): void {
    this.container = container;
    this.render();

    // Re-render on store changes (mostly viewMode), then re-update scale buttons
    let prevMode = store.viewMode;
    let prevTplSource = store.stockpileTplSource;
    let prevProductionWorkspace = store.productionWorkspace;
    store.subscribe(() => {
      const modeChanged = store.viewMode !== prevMode;
      const tplSourceChanged = store.stockpileTplSource !== prevTplSource;
      const workspaceChanged = store.productionWorkspace !== prevProductionWorkspace;
      if (modeChanged || tplSourceChanged || workspaceChanged) {
        prevMode = store.viewMode;
        prevTplSource = store.stockpileTplSource;
        prevProductionWorkspace = store.productionWorkspace;
        this.render();
      } else {
        this.updateScaleButtons();
      }
    });

    // Setup global keyboard shortcuts (once)
    this.setupKeyboardShortcuts();
  }

  private render(): void {
    if (!this.container) return;

    const isTemplate = store.viewMode === 'template';
    const isTodolist = store.viewMode === 'todolist';
    const isRun = isTodolist && store.productionWorkspace === 'run';
    const isStockpile = store.viewMode === 'stockpile';
    const isFacilities = store.viewMode === 'facilities';

    const tplSource = store.stockpileTplSource;
    const tplFileName = store.stockpileTplFileName;
    const activeTplBtn = (src: typeof tplSource) =>
      tplSource === src ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300';

    const activeTab = (active: boolean) => active
      ? 'bg-blue-600 text-white'
      : 'bg-gray-700 hover:bg-gray-600 text-gray-300';

    this.container.className = 'flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700';
    this.container.innerHTML = `
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" class="h-8 w-8 object-contain">
          <h1 class="text-lg font-bold">11e Template Builder</h1>
        </div>

        <!-- Mode toggle -->
        <div data-mode-tabs class="flex items-center rounded overflow-hidden border border-gray-600">
          <button id="btn-mode-template" class="px-3 py-1.5 text-xs ${activeTab(isTemplate)} transition-colors">🎨 Template</button>
          <button id="btn-mode-todolist" class="px-3 py-1.5 text-xs ${activeTab(isTodolist)} transition-colors">📋 Production</button>
          <button id="btn-mode-stockpile" class="px-3 py-1.5 text-xs ${activeTab(isStockpile)} transition-colors">📦 Stockpile</button>
          <button id="btn-mode-facilities" class="px-3 py-1.5 text-xs ${activeTab(isFacilities)} transition-colors">🏭 Facilities</button>
        </div>

        ${isTemplate ? `
        <button id="btn-new-section" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          New Section
        </button>

        <!-- Sélecteur de taille d'icônes -->
        <div class="flex items-center gap-1 ml-2 border-l border-gray-600 pl-4">
          <span class="text-xs text-gray-400 mr-1">Size:</span>
          <button data-scale="small" class="icon-scale-btn px-2 py-1 text-xs rounded transition-colors" title="Small icons">S</button>
          <button data-scale="medium" class="icon-scale-btn px-2 py-1 text-xs rounded transition-colors" title="Medium icons">M</button>
          <button data-scale="large" class="icon-scale-btn px-2 py-1 text-xs rounded transition-colors" title="Large icons">L</button>
          <button data-scale="xlarge" class="icon-scale-btn px-2 py-1 text-xs rounded transition-colors" title="Very large icons">XL</button>
          <button data-scale="xxlarge" class="icon-scale-btn px-2 py-1 text-xs rounded transition-colors" title="Extra large icons">XXL</button>
        </div>

        <button id="btn-background" class="ml-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm flex items-center gap-1" title="Change template background">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          Background
        </button>
        ` : isTodolist && !isRun ? `
        <button id="btn-add-text" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm flex items-center gap-1" title="Add text block">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Text
        </button>
        ` : isStockpile ? `
        <button id="btn-load-stockpile" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm cursor-pointer flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
          </svg>
          Load Stockpile CSV
        </button>
        <div class="flex items-center gap-2 border-l border-gray-600 pl-3">
          <span class="text-xs text-gray-400">Template:</span>
          <div class="flex rounded overflow-hidden border border-gray-600">
            <button id="btn-tpl-current" class="px-2 py-1 text-xs transition-colors ${activeTplBtn('current')}">Current</button>
            <button id="btn-tpl-official" class="px-2 py-1 text-xs transition-colors border-l border-gray-600 ${activeTplBtn('official')}">Official (W)</button>
            <button id="btn-tpl-official-colonial" class="px-2 py-1 text-xs transition-colors border-l border-gray-600 ${activeTplBtn('official-colonial')}">Official (C)</button>
            <label class="px-2 py-1 text-xs cursor-pointer transition-colors border-l border-gray-600 ${activeTplBtn('file')}">
              Load file
              <input type="file" accept=".json" id="tpl-upload-toolbar" class="hidden" />
            </label>
          </div>
          ${tplSource === 'official'
            ? '<span class="text-xs text-green-400">✓ official (W)</span>'
            : tplSource === 'official-colonial'
              ? '<span class="text-xs text-green-400">✓ official (C)</span>'
              : tplSource === 'file' && tplFileName
                ? `<span class="text-xs text-green-400">✓ <span class="text-gray-400">(${tplFileName})</span></span>`
                : tplSource === 'file'
                  ? '<span class="text-xs text-green-400">✓ file loaded</span>'
                  : ''
          }
        </div>
        ` : ''}
      </div>

      <div class="flex items-center gap-2">
        <!-- Helper button -->
        <button id="btn-help" class="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm flex items-center gap-1" title="Help & Shortcuts">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span class="text-xs">?</span>
        </button>

        <div class="border-l border-gray-600 h-6 mx-1"></div>

        ${isTemplate ? `
        <button id="btn-export-png" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm flex items-center gap-1" title="Ctrl+E">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          PNG
        </button>
        ` : ''}
        ${isTemplate || isFacilities ? `
        <button id="btn-export-json" class="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 rounded text-sm flex items-center gap-1" title="Ctrl+S">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
          </svg>
          Export JSON
        </button>
        <button id="btn-load-template" class="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 rounded text-sm flex items-center gap-1" title="Ctrl+O">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
          </svg>
          Load
        </button>
        ` : ''}
        ${isTodolist && !isRun ? `
        <button id="btn-tl-load" class="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 rounded text-sm flex items-center gap-1" title="Import a Discord todolist">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
          </svg>
          Load
        </button>
        ` : ''}
        ${!isStockpile ? `
        <button id="btn-clear" class="px-3 py-1.5 bg-red-600/50 hover:bg-red-600 rounded text-sm">
          ${isFacilities ? 'Clear mission' : isRun ? 'Clear calculator' : 'Clear'}
        </button>
        ` : `
        <button id="btn-clear-tpl" class="px-3 py-1.5 bg-red-600/50 hover:bg-red-600 rounded text-sm">
          Clear template
        </button>
        <button id="btn-clear-csv" class="px-3 py-1.5 bg-red-600/50 hover:bg-red-600 rounded text-sm">
          Clear CSV
        </button>
        `}
      </div>

      <!-- Help Modal -->
      <div id="help-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div class="bg-gray-800 rounded-lg shadow-2xl border border-gray-600 p-5 max-w-md max-h-[85vh] overflow-y-auto w-full mx-4">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-white flex items-center gap-2">
              <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Help & Shortcuts
            </h2>
            <div class="flex items-center gap-2">
              <div class="flex rounded overflow-hidden border border-gray-600" title="Switch language">
                <button id="btn-help-lang-en" class="px-2 py-1 text-xs transition-colors ${this.helpLang === 'en' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}">🇬🇧 EN</button>
                <button id="btn-help-lang-fr" class="px-2 py-1 text-xs transition-colors ${this.helpLang === 'fr' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}">🇫🇷 FR</button>
              </div>
              <button id="btn-close-help" class="text-gray-400 hover:text-white transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          <div id="help-body">${this.renderHelpBody()}</div>

          <div class="mt-5 pt-4 border-t border-gray-700 space-y-2">
            <div class="text-center">
              <span class="text-xs text-gray-500">11eRC-FL Template Builder v3.0</span>
            </div>
            <div class="text-center">
              <a href="https://github.com/NapoSky/11eLogiTemplateBuilder" target="_blank" rel="noopener noreferrer" class="text-xs text-blue-400 hover:text-blue-300 underline transition-colors">
                🔗 Contribute on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    `;

    if (isTemplate) this.updateScaleButtons();

    this.attachEvents();
  }

  private renderHelpBody(): string {
    const fr = this.helpLang === 'fr';
    const shortcuts = `
      <div class="pt-3 border-t border-gray-700">
        <h3 class="text-xs font-semibold uppercase text-gray-500 mb-2">${fr ? 'Raccourcis' : 'Shortcuts'}</h3>
        <div class="flex flex-wrap gap-2 text-xs text-gray-400">
          <span><kbd class="px-1.5 py-0.5 bg-gray-900 rounded font-mono">Ctrl S</kbd> ${fr ? 'Sauver' : 'Save'}</span>
          <span><kbd class="px-1.5 py-0.5 bg-gray-900 rounded font-mono">Ctrl O</kbd> ${fr ? 'Charger' : 'Load'}</span>
          <span><kbd class="px-1.5 py-0.5 bg-gray-900 rounded font-mono">Esc</kbd> ${fr ? 'Fermer' : 'Close'}</span>
        </div>
      </div>
    `;

    if (store.viewMode === 'facilities') {
      return `<div class="space-y-3 text-sm"><h3 class="font-semibold text-gray-200">🏭 Facilities</h3>
        <ul class="text-gray-400 space-y-2">
          <li>• ${fr ? 'Filtrez le catalogue illustré, cliquez sur un objet, puis réglez sa quantité en unités, litres ou caisses.' : 'Filter the illustrated catalogue, click an item, then set its quantity in units, litres or crates.'}</li>
          <li>• <span class="text-gray-200">Facility settings</span> ${fr ? 'ouvre les recettes et le lieu de dépôt dans une fenêtre compacte. Le bouton i détaille les ingrédients ; All materials affiche aussi les autres matériaux.' : 'opens recipes and the delivery location in a compact window. The i button reveals ingredients; All materials includes other materials.'}</li>
          <li>• <span class="text-gray-200">Available stock</span> ${fr ? 'permet de déduire les quantités déjà affectées à cette mission. Les deux fenêtres proposent des filtres de matériaux et masquent les objectifs finaux.' : 'deducts quantities already allocated to this mission. Both dialogs offer material filters and hide final objectives.'}</li>
          <li>• <span class="text-gray-200">Supply from outside</span> ${fr ? 'arrête le calcul de la chaîne pour cette ressource : elle sera demandée à l’approvisionnement.' : 'stops that production chain and adds the item to the supply list.'}</li>
          <li>• ${fr ? 'Le plan regroupe les besoins, calcule des lots complets et ordonne les étapes. Les surplus et coproduits sont affichés ; les coproduits ne sont pas déduits.' : 'The plan combines requirements, rounds whole batches and orders the stages. Surplus and byproducts are shown; byproducts are not deducted.'}</li>
          <li>• ${fr ? 'Copiez la mission sur Discord ou exportez-la en .txt. Le profil et la mission sont sauvegardés séparément et partageables en JSON.' : 'Copy the mission to Discord or export .txt. Profiles and missions are saved separately and can be shared as JSON.'}</li>
          <li>• ${fr ? 'Le carburant de production électrique, la maintenance et les trajets sont exclus. Une recette enregistrée qui change doit être choisie à nouveau.' : 'Power generation fuel, maintenance and transport are excluded. Changed saved recipes need to be selected again.'}</li>
        </ul>${shortcuts}</div>`;
    }

    if (store.viewMode === 'stockpile') {
      return `
        <div class="space-y-3 text-sm">
          <div>
            <h3 class="font-semibold text-gray-200 mb-2">📦 ${fr ? 'Stocks et transports' : 'Stock and transport'}</h3>
            <ol class="space-y-2 text-gray-400">
              <li><span class="text-blue-400 font-semibold">1.</span> ${fr ? 'Ouvrez Load Stockpile CSV, collez les relevés successifs (Ctrl+V) ou ajoutez plusieurs fichiers. Vérifiez les rôles par dépôt, puis importez le lot. Les doublons et relevés anciens sont signalés.' : 'Open Load Stockpile CSV, paste successive exports (Ctrl+V) or add several files. Check each depot’s role, then import the batch. Duplicates and older snapshots are flagged.'}</li>
              <li><span class="text-blue-400 font-semibold">2.</span> ${fr ? 'Regroupez les relevés par dépôt puis attribuez les rôles Backline, Intermediate et Front.' : 'Group snapshots by depot, then assign Backline, Intermediate, and Front roles.'}</li>
              <li><span class="text-blue-400 font-semibold">3.</span> <span class="text-gray-200">MPF production needs</span> ${fr ? 'compare les stocks hors Front au template et génère la Todolist MPF.' : 'compares non-Front stock against the template and generates the MPF Todolist.'}</li>
              <li><span class="text-blue-400 font-semibold">4.</span> <span class="text-gray-200">Transport planning</span> ${fr ? 'compare les dépôts à l’Intermediate. Les filtres et la readiness utilisent ses objectifs.' : 'compares depots against the Intermediate. Filters and readiness use its targets.'}</li>
              <li><span class="text-blue-400 font-semibold">5.</span> <span class="text-gray-200">Prepare transport</span> ${fr ? ': choisissez chaque route, planifiez-la automatiquement ou saisissez le chargement par trajet, puis ajoutez-la. Les routes précédentes restent dans la même liste.' : ': choose each route, plan it automatically or enter its load per trip, then add it. Previous routes remain in the same list.'}</li>
            </ol>
          </div>
          <p class="rounded border border-amber-800/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">${fr ? 'La jauge et la liste partagent le même remplissage : jusqu’à 60 caisses de types différents par conteneur. Les quantités précèdent les noms et décrivent un seul chargement, en caisses (en unités pour les véhicules assemblés). Le facteur (xN) répète les chargements identiques ; les véhicules et conteneurs incomplets restent distincts. Les dépôts Front restent exclus des totaux calculés.' : 'The meter and list share the same packing: up to 60 crates of mixed item types per container. Quantities precede names and describe one load, in crates (units for assembled shippables). The (xN) factor repeats identical loads; incomplete containers and vehicles remain distinct. Front depots remain excluded from calculated totals.'}</p>
          ${shortcuts}
        </div>
      `;
    }

    if (store.viewMode === 'todolist') {
      return `
        <div class="space-y-3 text-sm">
          <div>
            <h3 class="font-semibold text-gray-200 mb-2">📋 Production</h3>
            <ul class="text-gray-400 space-y-1.5">
              <li>• <span class="text-gray-200">MPF Todolist</span> ${fr ? 'conserve la liste du régiment et son export Discord. Le catalogue est limité à la MPF.' : 'keeps the regiment list and its Discord export. Its catalogue is MPF-only.'}</li>
              <li>• <span class="text-gray-200">Logi Calculator</span> ${fr ? 'possède un brouillon Factory et un brouillon MPF indépendants, conservés en changeant de bâtiment.' : 'has independent Factory and MPF drafts, retained when switching buildings.'}</li>
              <li>• <span class="text-gray-200">Factory 1 / Factory 2 / MPF</span> ${fr ? 'ouvrent directement leurs productions sauvegardées. Les deux usines gardent leurs assets et quantités indépendants. Clear efface uniquement la production affichée.' : 'open their saved production directly. Both factories keep independent assets and quantities. Clear applies only to the displayed production.'}</li>
              <li>• <span class="text-gray-200">Load both factories</span> ${fr ? 'cumule les matériaux des deux profils Factory pour une tournée : jusqu’à 8 caisses par catégorie, avec 4 maximum dans chaque usine. Le total et le warning passent en orange si le chargement dépasse les 15 slots du camion.' : 'combines both Factory profiles for one run: up to 8 crates per category, with at most 4 in each factory. The total and warning turn orange when the load exceeds the truck’s 15 slots.'}</li>
              <li>• ${fr ? 'En MPF, une seule ligne par catégorie de production : choisir un autre objet remplace la ligne de cette catégorie.' : 'In MPF, one line per production category: choosing another item replaces that category’s line.'}</li>
              <li>• ${fr ? 'Dans Logi Calculator, choisissez Factory ou MPF, puis glissez une icône ou faites un double-clic dessus.' : 'In Logi Calculator, choose Factory or MPF, then drag or double-click an icon.'}</li>
              <li>• ${fr ? 'Dans MPF Todolist, le compteur × indique le nombre de commandes complètes.' : 'In MPF Todolist, the × counter sets the number of full orders.'}</li>
              <li>• <span class="text-gray-200">Crates − / +</span> ${fr ? 'règle directement les caisses d’une seule queue dans Logi Calculator : Factory 1–4, MPF 3–9 (3–5 pour véhicules et shippables).' : 'directly sets crates for one queue in Logi Calculator: Factory 1–4, MPF 3–9 (3–5 for vehicles and shippables).'}</li>
              <li>• ${fr ? 'Factory accepte plusieurs assets dans une même catégorie, pour un total de 4 caisses maximum. Réduisez une quantité pour ajouter un autre asset. MPF conserve un seul asset par catégorie.' : 'Factory accepts multiple assets in the same category, up to 4 crates total. Reduce a quantity to add another asset. MPF retains one asset per category.'}</li>
              <li>• <span class="text-gray-200">Loading</span> ${fr ? 'autorise le camion pour Factory et MPF ; le flatbed avec conteneur est réservé à la MPF.' : 'allows a truck for Factory and MPF; a flatbed with container is MPF-only.'}</li>
              <li>• <span class="text-gray-200">+ Text</span> ${fr ? 'ajoute une note Markdown Discord dans MPF Todolist.' : 'adds a Discord Markdown note in MPF Todolist.'}</li>
              <li>• <span class="text-gray-200">Discord → Copy / .txt</span> ${fr ? 'exporte la todolist. Clear calculator efface uniquement le brouillon du bâtiment affiché.' : 'exports the todolist. Clear calculator clears only the displayed building’s draft.'}</li>
            </ul>
          </div>
          ${shortcuts}
        </div>
      `;
    }

    return `
      <div class="space-y-3 text-sm">
        <div>
          <h3 class="text-sm font-semibold text-gray-300 mb-2">🖱️ ${fr ? 'Mode Template — Actions souris' : 'Template Mode — Mouse Actions'}</h3>
          <ul class="text-gray-400 space-y-1">
            <li>• <span class="text-gray-300">${fr ? 'Double-clic' : 'Double-click'}</span> ${fr ? 'sur le canvas → Nouvelle section' : 'on canvas → New section'}</li>
            <li>• <span class="text-gray-300">${fr ? 'Glisser' : 'Drag'}</span> ${fr ? 'une icône vers une section → Ajouter' : 'an icon to a section → Add'}</li>
            <li>• <span class="text-gray-300">${fr ? 'Glisser' : 'Drag'}</span> ${fr ? 'dans la grille → Réorganiser' : 'in grid → Reorder'}</li>
            <li>• <span class="text-gray-300">${fr ? 'Clic droit' : 'Right-click'}</span> ${fr ? "sur une icône → Quantité & sous-type" : 'an icon → Quantity & subtype'}</li>
            <li>• <span class="text-gray-300">${fr ? 'Maintenir Shift' : 'Hold Shift'}</span> ${fr ? 'en déplaçant/redimensionnant une section → Accroche à la grille de 10px' : 'while dragging/resizing a section → Snaps to a 10px grid'}</li>
            <li>• <span class="text-gray-300">S / M / L</span> ${fr ? 'ajuste la taille des icônes.' : 'adjusts icon size.'}</li>
          </ul>
        </div>
        ${shortcuts}
      </div>
    `;
  }

  private updateScaleButtons(): void {
    if (!this.container) return;
    const currentScale = store.iconScale;
    this.container.querySelectorAll('.icon-scale-btn').forEach(btn => {
      const scale = btn.getAttribute('data-scale') as IconScale;
      if (scale === currentScale) {
        btn.className = 'icon-scale-btn px-2 py-1 text-xs rounded transition-colors bg-blue-600 text-white';
      } else {
        btn.className = 'icon-scale-btn px-2 py-1 text-xs rounded transition-colors bg-gray-600 hover:bg-gray-500 text-gray-300';
      }
    });
  }

  private attachEvents(): void {
    if (!this.container) return;

    // Mode toggle
    this.container.querySelector('#btn-mode-template')?.addEventListener('click', () => {
      store.setViewMode('template');
    });
    this.container.querySelector('#btn-mode-todolist')?.addEventListener('click', () => {
      store.setViewMode('todolist');
    });
    this.container.querySelector('#btn-mode-stockpile')?.addEventListener('click', () => {
      store.setViewMode('stockpile');
    });
    this.container.querySelector('#btn-mode-facilities')?.addEventListener('click', () => {
      store.setViewMode('facilities');
    });

    // New section
    this.container.querySelector('#btn-new-section')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('open-section-modal', { detail: { x: 100, y: 100 } }));
    });

    // Add text block (todolist mode)
    this.container.querySelector('#btn-add-text')?.addEventListener('click', () => {
      const id = store.addTextBlock({ kind: 'top' });
      window.dispatchEvent(new CustomEvent('focus-text-block', { detail: { id } }));
    });

    // Stockpile CSV upload — accumulate files and pastes in one import basket.
    this.container.querySelector('#btn-load-stockpile')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('stockpile:open-load-modal'));
    });

    // Stockpile CSV clear
    this.container.querySelector('#btn-clear-csv')?.addEventListener('click', () => {
      if (confirm('Clear the loaded stockpile CSV?')) {
        window.dispatchEvent(new CustomEvent('stockpile:clear-csv'));
      }
    });

    // Stockpile template source
    this.container.querySelector('#btn-tpl-current')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('stockpile:set-tpl-current'));
    });
    this.container.querySelector('#btn-tpl-official')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('stockpile:set-tpl-official'));
    });
    this.container.querySelector('#btn-tpl-official-colonial')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('stockpile:set-tpl-official-colonial'));
    });
    this.container.querySelector('#tpl-upload-toolbar')?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      window.dispatchEvent(new CustomEvent('stockpile:load-tpl', { detail: { file } }));
      (e.target as HTMLInputElement).value = '';
    });

    // Stockpile clear template
    this.container.querySelector('#btn-clear-tpl')?.addEventListener('click', () => {
      if (confirm('Clear the loaded template file?')) {
        window.dispatchEvent(new CustomEvent('stockpile:set-tpl-current'));
      }
    });

    // Icon scale buttons
    this.container.querySelectorAll('.icon-scale-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const scale = btn.getAttribute('data-scale') as IconScale;
        if (scale) {
          store.setIconScale(scale);
        }
      });
    });
    
    // Help modal
    const helpModal = this.container.querySelector('#help-modal') as HTMLElement;
    this.container.querySelector('#btn-help')?.addEventListener('click', () => {
      this.toggleHelpModal(true);
    });
    this.container.querySelector('#btn-close-help')?.addEventListener('click', () => {
      this.toggleHelpModal(false);
    });
    // Help lang split buttons
    const setHelpLang = (lang: 'en' | 'fr') => {
      this.helpLang = lang;
      const btnEn = this.container?.querySelector('#btn-help-lang-en');
      const btnFr = this.container?.querySelector('#btn-help-lang-fr');
      if (btnEn) btnEn.className = `px-2 py-1 text-xs transition-colors ${lang === 'en' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`;
      if (btnFr) btnFr.className = `px-2 py-1 text-xs transition-colors ${lang === 'fr' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`;
      const body = this.container?.querySelector('#help-body');
      if (body) body.innerHTML = this.renderHelpBody();
    };
    this.container.querySelector('#btn-help-lang-en')?.addEventListener('click', () => setHelpLang('en'));
    this.container.querySelector('#btn-help-lang-fr')?.addEventListener('click', () => setHelpLang('fr'));
    // Close on backdrop click
    helpModal?.addEventListener('click', (e) => {
      if (e.target === helpModal) {
        this.toggleHelpModal(false);
      }
    });

    // Export PNG
    this.container.querySelector('#btn-export-png')?.addEventListener('click', () => this.exportPng());

    // Export JSON
    this.container.querySelector('#btn-export-json')?.addEventListener('click', () => {
      if (store.viewMode === 'facilities') window.dispatchEvent(new CustomEvent('facilities:export-mission'));
      else this.exportJson();
    });

    // Load template (open modal)
    this.container.querySelector('#btn-load-template')?.addEventListener('click', () => {
      if (store.viewMode === 'facilities') { window.dispatchEvent(new CustomEvent('facilities:import-mission')); return; }
      window.dispatchEvent(new CustomEvent('open-template-load-modal'));
    });

    // Clear
    this.container.querySelector('#btn-clear')?.addEventListener('click', () => {
      if (store.viewMode === 'facilities') {
        window.dispatchEvent(new CustomEvent('facilities:clear-mission'));
      } else if (store.viewMode === 'todolist') {
        const isRun = store.productionWorkspace === 'run';
        const building = store.productionRunSource === 'factory' ? `Factory ${store.productionRunProfile}` : 'MPF';
        if (confirm(isRun ? `Clear your ${building} calculator draft? Your other calculator profiles and MPF Todolist will stay unchanged.` : 'Clear the entire MPF todolist? Your Logi Calculator drafts will stay unchanged.')) {
          if (isRun) store.clearProductionRun(); else store.clearTodoList();
        }
      } else if (store.viewMode === 'template') {
        if (confirm('Clear the entire template?')) {
          store.sections.forEach(s => store.deleteSection(s.id));
          store.useCrateEquivalentQuantities();
        }
      }
    });

    // Open todolist load modal (todolist mode only)
    this.container.querySelector('#btn-tl-load')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('open-tl-load-modal'));
    });

    // Open background modal (template mode only)
    this.container.querySelector('#btn-background')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('open-background-modal'));
    });
  }
  
  private toggleHelpModal(show: boolean): void {
    const helpModal = this.container?.querySelector('#help-modal') as HTMLElement;
    if (helpModal) {
      if (show) {
        helpModal.classList.remove('hidden');
        this.helpModalVisible = true;
      } else {
        helpModal.classList.add('hidden');
        this.helpModalVisible = false;
      }
    }
  }
  
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Ignorer si on est dans un input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      
      // Escape pour fermer le modal d'aide
      if (e.key === 'Escape' && this.helpModalVisible) {
        this.toggleHelpModal(false);
        return;
      }
      
      // Ctrl/Cmd + S : Sauvegarder (Export JSON)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (store.viewMode === 'facilities') { window.dispatchEvent(new CustomEvent('facilities:export-mission')); return; }
        this.exportJson();
        return;
      }
      
      // Ctrl/Cmd + O : Ouvrir (Import JSON)
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        if (store.viewMode === 'facilities') { window.dispatchEvent(new CustomEvent('facilities:import-mission')); return; }
        this.triggerImport();
        return;
      }
      
      // Ctrl/Cmd + E : Exporter PNG
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        this.exportPng();
        return;
      }
      
      // ? pour afficher l'aide
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        this.toggleHelpModal(!this.helpModalVisible);
        return;
      }
    });
  }
  
  private triggerImport(): void {
    window.dispatchEvent(new CustomEvent('open-template-load-modal'));
  }

  private async exportPng(): Promise<void> {
    if (this.isExportingPng) return;
    const canvas = document.getElementById('template-canvas');
    if (!canvas) return;

    const btn = this.container?.querySelector('#btn-export-png') as HTMLButtonElement | null;
    const originalBtnHtml = btn?.innerHTML ?? '';
    this.isExportingPng = true;
    if (btn) {
      btn.disabled = true;
      btn.classList.add('opacity-70', 'cursor-wait');
      btn.innerHTML = `
        <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        Exporting…
      `;
    }

    try {
      // Clone the canvas to avoid modifying original
      const clone = canvas.cloneNode(true) as HTMLElement;
      clone.style.position = 'absolute';
      clone.style.left = '-9999px';
      // Annuler le fit-to-screen éventuellement appliqué sur l'original :
      // l'export doit toujours capturer le canvas à sa taille canonique 1920x1080.
      clone.style.transform = 'none';
      clone.style.transformOrigin = '';
      document.body.appendChild(clone);

      // Hide section controls (edit/delete buttons) for export
      clone.querySelectorAll('.section-controls').forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });

      // html2canvas-pro 2.2.3 corrige #214 (parseCache) et #215 (maxCacheSize).
      // #216/#218 (filter: drop-shadow() teintait le canvas -> SecurityError au
      // toDataURL) est corrigé nativement depuis 2.2.4 (parsing paren-balanced
      // dans FilterEffect, vérifié empiriquement en 2.3.1 : plus de SecurityError).
      // neutralizeTaintingFilters() est conservé en defense-in-depth (coût nul,
      // ne change pas le rendu : la lib ne dessine de toute façon pas encore
      // l'ombre visuellement malgré le shadowOffsetX/Blur/Color calculé).
      await inlineCrossOriginBackgrounds(clone);
      neutralizeTaintingFilters(clone);
      bustBackgroundImageCache(clone);

      // html2canvas-pro supports oklab/oklch natively - no color conversion needed!
      // width/height/windowWidth/windowHeight forcés à 1920x1080 pour garantir un export
      // déterministe indépendant de la résolution écran et de la taille de la fenêtre.
      const { default: html2canvas } = await import('html2canvas-pro');
      // html2canvas-pro plafonne son cache d'images à 100 entrées (LRU). Au-delà,
      // les premières icônes parsées sont évincées et n'apparaissent pas dans l'export.
      // On dimensionne le cache au nombre réel d'images du template (+ marge).
      const maxCacheSize = Math.max(
        clone.querySelectorAll('img').length +
          clone.querySelectorAll('[style*="background-image"]').length +
          50,
        256
      );
      const result = await html2canvas(clone, {
        backgroundColor: null,
        useCORS: true,
        scale: 1,
        width: 1920,
        height: 1080,
        windowWidth: 1920,
        windowHeight: 1080,
        maxCacheSize,
        logging: false
      });
      
      // Clean up
      document.body.removeChild(clone);
      
      const link = document.createElement('a');
      link.download = 'template.png';
      link.href = result.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export PNG failed:', err);
      if (err instanceof DOMException && err.name === 'SecurityError') {
        alert(
          "PNG export failed: the background image is hosted on another site that "
          + "blocks cross-origin access (CORS). Use a preset or upload the image instead."
        );
      } else {
        alert('PNG export failed');
      }
    } finally {
      this.isExportingPng = false;
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-wait');
        btn.innerHTML = originalBtnHtml;
      }
    }
  }

  private exportJson(): void {
    const json = store.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    link.download = `template_${dd}${mm}${yyyy}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }
}
