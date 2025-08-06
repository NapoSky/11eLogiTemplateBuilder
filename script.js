// Configuration des icônes et catégories
const iconCategories = {
    weapons: ['rifle', 'gun', 'pistol', 'carbine', 'rpg', 'launcher', 'mortar', 'machine', 'sniper', 'assault', 'revolver', 'shotgun', 'smg', 'automatic', 'bayonet', 'mace', 'sword'],
    ammo: ['ammo', 'round', 'shell', 'bullet', 'grenade', 'charge', 'mine', 'torpedo', 'depth'],
    uniforms: ['uniform', 'armour', 'armor'],
    materials: ['material', 'concrete', 'metal', 'beam', 'wire', 'bag', 'coal', 'coke', 'sulfur', 'water', 'oil', 'fuel', 'salvage', 'component', 'aluminum', 'iron', 'copper'],
    medical: ['bandage', 'aid', 'plasma', 'trauma', 'medic'],
    vehicles: ['tank', 'vehicle', 'train', 'ship', 'submarine'],
    other: []
};

class TemplateBuilder {
    constructor() {
        this.icons = [];
        this.sections = [];
        this.currentSection = null;
        this.draggedItem = null;
        
        this.init();
        this.loadIcons();
        this.bindEvents();
    }

    init() {
        this.iconsGrid = document.getElementById('iconsGrid');
        this.canvas = document.getElementById('canvas');
        this.searchInput = document.getElementById('searchIcons');
        this.categoryBtns = document.querySelectorAll('.category-btn');
        this.quantityModal = document.getElementById('quantityModal');
        this.sectionModal = document.getElementById('sectionModal');
    }

    async loadIcons() {
        try {
            // Simulation du chargement des icônes depuis le dossier assets/icons
            const response = await fetch('/assets/icons/');
            const iconFiles = [
                'AmmoUniformWIcon.png', 'AntiTankMineItemIcon.png', 'ArmourUniformC.png', 'ArmourUniformW.png',
                'AssaultRifleAmmoItemIcon.png', 'AssaultRifleHeavyCItemIcon.png', 'AssaultRifleHeavyWItemIcon.png',
                'AssaultRifleItemIcon.png', 'ATAmmoIcon.png', 'ATGrenadeWIcon.png', 'ATLaunchedGrenadeWIcon.png',
                'ATMortarAmmoItemIcon.png', 'ATMortarItemIcon.png', 'ATMortarWTripodItemIcon.png', 'ATRifleAmmoItemIcon.png',
                'ATRifleAssaultWIcontga.png', 'ATRifleAutomaticWItemIcon.png', 'ATRifleItemIcon.png', 'ATRifleLightCIcon.png',
                'ATRifleSniperCIcontga.png', 'ATRifleTCIcon.png', 'ATRpgAmmoItemIcon.png', 'ATRPGCItemIcon.png',
                'ATRPGHeavyWIcon.png', 'ATRpgItemIcon.png', 'ATRPGLightCItemIcon.png', 'ATRPGTWIcon.png',
                'BandagesItemIcon.png', 'BannerTCItemIcon.png', 'BannerTWItemIcon.png', 'BarbedWireMaterialItemIcon.png',
                'BasicMaterialsIcon.png', 'BattleTankAmmoItemIcon.png', 'BayonetIcon.png', 'BinocularsItemIcon.png',
                'BloodPlasmaItemIcon.png', 'BunkerSuppliesIcon.png', 'CarbineItemIcon.png', 'ClothItemIcon.png',
                'CoalIcon.png', 'CokeIcon.png', 'ComponentsDamagedIcon.png', 'ComponentsIcon.png', 'ConcreteBagIcon.png',
                'DeadlyGas01Icon.png', 'DeployableTripodItemIcon.png', 'DepthChargeIcon.png', 'EngineerUniformCIcon.png',
                'EngineerUniformWIcon.png', 'ExplosiveMaterialIcon.png', 'ExplosiveTripodIcon.png', 'FacilityMaterials09Icon.png',
                'FacilityMaterials10Icon.png', 'FacilityMaterials11Icon.png', 'FacilityMaterials4Icon.png', 'FacilityOil1Icon.png',
                'FacilityOil2Icon.png', 'FirstAidKitItem.png', 'FlameAmmoIcon.png', 'FlamegunCICon.png', 'FlamegunWICon.png',
                'FlamePackCIcon.png', 'FlamePackWIcon.png', 'FlameRocketAmmoIcon.png', 'GasMaskFilterIcon.png',
                'GasmaskIcon.png', 'GrenadeAdapterIcon.png', 'GrenadeCItemIcon.png', 'GrenadeItemIcon.png',
                'GrenadeLauncherCItemIcon.png', 'GrenadeLauncherTCIcon.png', 'GrenadeUniformCIcon.png', 'GroundMaterialsIcon.png',
                'HammerIcon.png', 'HeavyArtilleryAmmoItemIcon.png', 'HeavyMachineGunIcon.png', 'HEGrenadeItemIcon.png',
                'HELaunchedGrenadeItemIcon.png', 'HERocketAmmoIcon.png', 'InfantryMineIcon.png', 'InfantrySupportGunItemIcon.png',
                'LRArtilleryAmmoItemIcon.png', 'LargeShipSubmarineCIcon.png', 'LightArtilleryAmmoItemIcon.png',
                'LightMachineGunIcon.png', 'LightTankAmmoItemIcon.png', 'ListeningKitIcon.png', 'MGCItemIcon.png',
                'MGHeavyTWItemIcon.png', 'MGWItemIcon.png', 'MachineGunAmmoIcon.png', 'MaintenanceSuppliesIcon.png',
                'MaterialPlatformItemIcon.png', 'MedicUniformCIcon.png', 'MedicUniformWIcon.png', 'MetalBeamMaterialItemIcon.png',
                'MiniTankAmmoItemIcon.png', 'MortarAmmoIcon.png', 'MortarItemIcon.png', 'MortarTankIcon.png',
                'OfficerUniformCIcon.png', 'OfficerUniformWIcon.png', 'PistolAmmoItemIcon.png', 'PistolItemIcon.png',
                'PistolLightWItemIcon.png', 'PistolWItemIcon.png', 'PrototypeKitIcon.png', 'RadioBackpackItemIcon.png',
                'RadioItemIcon.png', 'RainUniformCIcon.png', 'RareMaterialsIcon.png', 'RefinedFuelIcon.png',
                'RefinedMaterialsIcon.png', 'RelicMaterialItemIcon.png', 'ResouceAluminumIcon.png', 'ResouceAluminumRefinedIcon.png',
                'ResouceIronIcon.png', 'ResouceIronRefinedIcon.png', 'ResourceCopperIcon.png', 'ResourceCopperRefinedIcon.png',
                'RevolverAmmoItemIcon.png', 'RevolverItemIcon.png', 'RevolvingRifleWItemIcon.png', 'RifleAmmoItemIcon.png',
                'RifleAutomaticCIcon.png', 'RifleAutomaticW.png', 'RifleCItemIcon.png', 'RifleHeavyCItemIcon.png',
                'RifleLightCItemIcon.png', 'RifleLongC.png', 'RifleLongW.png', 'RifleShortWIcon.png', 'RifleW.png',
                'RocketPartBottomIcon.png', 'RocketPartCenterIcon.png', 'RocketPartTopIcon.png', 'RpgAmmoItemIcon.png',
                'RpgItemIcon.png', 'SMGCItemIcon.png', 'SMGHeavyCItemIcon.png', 'SMGHeavyWItemIcon.png', 'Salvage02Icon.png',
                'SalvageIcon.png', 'SandbagMaterialItemIcon.png', 'SatchelChargeTIcon.png', 'ScoutUniformCIcon.png',
                'ScoutUniformWIcon.png', 'SeaMineIcon.png', 'ShotgunAmmoItemIcon.png', 'ShotgunCItemIcon.png',
                'ShotgunWItemIcon.png', 'ShovelIcon.png', 'SledgeHammerItemIcon.png', 'Smokegrenadeicon1.png',
                'SniperRifleAmmoItemIcon.png', 'SniperRifleCItemIcon.png', 'SniperRifleItemIcon.png', 'SnowUniformCIcon.png',
                'SnowUniformWIcon.png', 'SoldierUniformCIcon.png', 'SoldierUniformWIcon.png', 'StickyBombIcon.png',
                'StilSwordCIcon.png', 'SubMachineGunAmmoIcon.png', 'SubMachineGunIcon.png', 'SulfurIcon.png',
                'TankUniformCIcon.png', 'TankUniformWIcon.png', 'TorpedoIcon.png', 'TrainHospitalItemIcon.png',
                'TraumaKitItemIcon.png', 'TrenchMaceWIcon.png', 'WaterIcon.png', 'WindsockItemIcon.png', 'WorkWrench.png'
            ];

            this.icons = iconFiles.map(filename => ({
                filename,
                name: this.formatIconName(filename),
                category: this.categorizeIcon(filename),
                path: `assets/icons/${filename}`
            }));

            this.renderIcons();
        } catch (error) {
            console.error('Erreur lors du chargement des icônes:', error);
        }
    }

    formatIconName(filename) {
        return filename
            .replace(/\.png$/i, '')
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    categorizeIcon(filename) {
        const lowercaseFilename = filename.toLowerCase();
        
        for (const [category, keywords] of Object.entries(iconCategories)) {
            if (keywords.some(keyword => lowercaseFilename.includes(keyword))) {
                return category;
            }
        }
        
        return 'other';
    }

    renderIcons(filter = 'all', searchTerm = '') {
        this.iconsGrid.innerHTML = '';
        
        const filteredIcons = this.icons.filter(icon => {
            const matchesCategory = filter === 'all' || icon.category === filter;
            const matchesSearch = searchTerm === '' || 
                icon.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                icon.filename.toLowerCase().includes(searchTerm.toLowerCase());
            
            return matchesCategory && matchesSearch;
        });

        filteredIcons.forEach(icon => {
            const iconElement = this.createIconElement(icon);
            this.iconsGrid.appendChild(iconElement);
        });
    }

    createIconElement(icon) {
        const iconDiv = document.createElement('div');
        iconDiv.className = 'icon-item';
        iconDiv.draggable = true;
        iconDiv.dataset.icon = JSON.stringify(icon);
        
        iconDiv.innerHTML = `
            <img src="${icon.path}" alt="${icon.name}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yNCAxNkMyMC42ODYgMTYgMTggMTguNjg2IDE4IDIyQzE4IDI1LjMxNCAyMC42ODYgMjggMjQgMjhDMjcuMzE0IDI4IDMwIDI1LjMxNCAzMCAyMkMzMCAxOC42ODYgMjcuMzE0IDE2IDI0IDE2WiIgZmlsbD0iIzlDQTNBRiIvPgo8L3N2Zz4K'">
            <span>${icon.name}</span>
        `;

        return iconDiv;
    }

    bindEvents() {
        // Recherche
        this.searchInput.addEventListener('input', (e) => {
            const activeCategory = document.querySelector('.category-btn.active').dataset.category;
            this.renderIcons(activeCategory, e.target.value);
        });

        // Filtres de catégorie
        this.categoryBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.categoryBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.renderIcons(e.target.dataset.category, this.searchInput.value);
            });
        });

        // Drag & Drop
        this.iconsGrid.addEventListener('dragstart', this.handleDragStart.bind(this));
        this.canvas.addEventListener('dragover', this.handleDragOver.bind(this));
        this.canvas.addEventListener('drop', this.handleDrop.bind(this));

        // Boutons d'action
        document.getElementById('addSection').addEventListener('click', () => this.showSectionModal());
        document.getElementById('clearCanvas').addEventListener('click', () => this.clearCanvas());
        document.getElementById('exportTemplate').addEventListener('click', () => this.exportTemplate());
        document.getElementById('saveTemplate').addEventListener('click', () => this.saveTemplate());
        document.getElementById('loadTemplate').addEventListener('click', () => this.loadTemplate());
        document.getElementById('loadPreset').addEventListener('click', () => this.showPresetModal());

        // Modales
        this.bindModalEvents();
    }

    bindModalEvents() {
        // Modal de quantité
        const quantityModal = this.quantityModal;
        const sectionModal = this.sectionModal;
        const presetModal = document.getElementById('presetModal');

        // Fermeture des modales
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.remove('active');
            });
        });

        // Clic en dehors de la modale
        [quantityModal, sectionModal, presetModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // Boutons de confirmation
        document.getElementById('confirmQuantity').addEventListener('click', () => this.confirmQuantity());
        document.getElementById('confirmSection').addEventListener('click', () => this.createSection());
        
        // Boutons d'annulation
        document.getElementById('cancelQuantity').addEventListener('click', () => {
            quantityModal.classList.remove('active');
        });
        document.getElementById('cancelSection').addEventListener('click', () => {
            sectionModal.classList.remove('active');
        });
        document.getElementById('cancelPreset').addEventListener('click', () => {
            presetModal.classList.remove('active');
        });

        // Templates prédéfinis
        document.querySelectorAll('.preset-item').forEach(item => {
            item.addEventListener('click', () => {
                const presetType = item.dataset.preset;
                this.loadPreset(presetType);
                presetModal.classList.remove('active');
            });
        });
    }

    showPresetModal() {
        document.getElementById('presetModal').classList.add('active');
    }

    loadPreset(presetType) {
        // Vider le canvas sans demander confirmation
        this.clearCanvas(false);

        const presets = {
            operation: {
                title: '11eRC-FL Stockpile operation',
                subtitle: 'This is the content of Operational Stockpiles that the 11eRC-FL expect for each operation made by the regiment.',
                sections: [
                    { name: 'Equipment (Crate)', color: 'blue', x: 100, y: 200 },
                    { name: 'Uniforms (Crate)', color: 'gray', x: 600, y: 200 },
                    { name: 'Medical / Supplies (Crate)', color: 'green', x: 100, y: 500 },
                    { name: 'Materials (Crate)', color: 'orange', x: 600, y: 500 }
                ]
            },
            weapons: {
                title: '11eRC-FL Stockpile Template',
                subtitle: 'This is the content of Operational Stockpiles that the 11eRC-FL expect for each operation made by the regiment.',
                sections: [
                    { name: 'Small Arms (Crate)', color: 'blue', x: 100, y: 200 },
                    { name: 'Heavy Arms (Crate)', color: 'blue', x: 600, y: 200 },
                    { name: 'H.Ammo (Crate)', color: 'red', x: 350, y: 450 }
                ]
            },
            logistics: {
                title: '11eRC-FL Stockpile Template',
                subtitle: 'This is the content of Operational Stockpiles that the 11eRC-FL expect for each operation made by the regiment.',
                sections: [
                    { name: 'Materials (Facility)', color: 'orange', x: 100, y: 200 },
                    { name: 'Materials (Crate)', color: 'orange', x: 600, y: 200 },
                    { name: 'Emplacements (Crate/Stockpile)', color: 'purple', x: 350, y: 450 }
                ]
            }
        };

        const preset = presets[presetType];
        if (!preset) return;

        // Appliquer le titre et sous-titre
        document.getElementById('templateTitle').value = preset.title;
        document.getElementById('templateSubtitle').value = preset.subtitle;

        // Créer les sections
        preset.sections.forEach(sectionData => {
            const section = this.createSectionElement(sectionData.name, sectionData.color);
            section.style.left = sectionData.x + 'px';
            section.style.top = sectionData.y + 'px';
            this.canvas.appendChild(section);
        });
    }

    handleDragStart(e) {
        if (e.target.classList.contains('icon-item')) {
            this.draggedItem = JSON.parse(e.target.dataset.icon);
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'copy';
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        
        const section = e.target.closest('.template-section');
        if (section) {
            section.classList.add('drop-target');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        
        // Nettoyer les classes de drag
        document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        
        if (!this.draggedItem) return;

        const section = e.target.closest('.template-section');
        if (section) {
            this.addItemToSection(section, this.draggedItem);
        } else {
            // Créer une nouvelle section par défaut
            this.createDefaultSection(this.draggedItem);
        }

        this.draggedItem = null;
    }

    addItemToSection(sectionElement, icon) {
        const sectionContent = sectionElement.querySelector('.section-content');
        const existingItem = sectionContent.querySelector(`[data-icon-path="${icon.path}"]`);

        if (existingItem) {
            // Incrémenter la quantité
            const quantityEl = existingItem.querySelector('.quantity');
            const currentQuantity = parseInt(quantityEl.textContent) || 1;
            quantityEl.textContent = currentQuantity + 1;
        } else {
            // Ajouter un nouvel item
            const itemElement = this.createSectionItem(icon);
            sectionContent.appendChild(itemElement);
        }
    }

    createSectionItem(icon, quantity = 1) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'section-item';
        itemDiv.dataset.iconPath = icon.path;
        
        itemDiv.innerHTML = `
            <img src="${icon.path}" alt="${icon.name}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1zbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yNCAxNkMyMC42ODYgMTYgMTggMTguNjg2IDE4IDIyQzE4IDI1LjMxNCAyMC42ODYgMjggMjQgMjhDMjcuMzE0IDI4IDMwIDI1LjMxNCAzMCAyMkMzMCAxOC42ODYgMjcuMzE0IDE2IDI0IDE2WiIgZmlsbD0iIzlDQTNBRiIvPgo8L3N2Zz4K'">
            <div class="quantity">${quantity}</div>
        `;

        itemDiv.addEventListener('click', () => this.showQuantityModal(itemDiv, icon));
        
        return itemDiv;
    }

    createDefaultSection(icon) {
        const sectionName = this.getSectionNameForCategory(icon.category);
        const sectionColor = this.getSectionColorForCategory(icon.category);
        
        const section = this.createSectionElement(sectionName, sectionColor);
        this.canvas.appendChild(section);
        
        this.addItemToSection(section, icon);
    }

    getSectionNameForCategory(category) {
        const categoryNames = {
            weapons: 'Small Arms (Crate)',
            ammo: 'H.Ammo (Crate)', 
            uniforms: 'Uniforms (Crate)',
            materials: 'Materials (Crate)',
            medical: 'Medical / Supplies (Crate)',
            vehicles: 'Heavy Arms (Crate)',
            other: 'Equipment (Crate)'
        };
        
        return categoryNames[category] || 'Equipment (Crate)';
    }

    getSectionColorForCategory(category) {
        const categoryColors = {
            weapons: 'blue',
            ammo: 'red',
            uniforms: 'gray',
            materials: 'orange',
            medical: 'green',
            vehicles: 'blue',
            other: 'blue'
        };
        
        return categoryColors[category] || 'blue';
    }

    showSectionModal() {
        this.sectionModal.classList.add('active');
        document.getElementById('sectionName').focus();
    }

    createSection() {
        const sectionName = document.getElementById('sectionName').value.trim();
        const sectionColor = document.getElementById('sectionColor').value;
        
        if (!sectionName) {
            alert('Veuillez entrer un nom pour la section');
            return;
        }

        const section = this.createSectionElement(sectionName, sectionColor);
        this.canvas.appendChild(section);
        
        this.sectionModal.classList.remove('active');
        document.getElementById('sectionName').value = '';
    }

    createSectionElement(name, color) {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = `template-section ${color}`;
        sectionDiv.style.top = '50px';
        sectionDiv.style.left = '50px';
        
        sectionDiv.innerHTML = `
            <div class="section-header">${name}</div>
            <div class="section-content"></div>
        `;

        // Toujours appeler makeDraggable lors de la création
        this.makeDraggable(sectionDiv);
        
        return sectionDiv;
    }

    makeDraggable(element) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        const header = element.querySelector('.section-header');
        
        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(element.style.left) || 0;
            startTop = parseInt(element.style.top) || 0;
            
            element.style.zIndex = '1000';
            header.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            element.style.left = Math.max(0, startLeft + deltaX) + 'px';
            element.style.top = Math.max(0, startTop + deltaY) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                element.style.zIndex = '';
                header.style.cursor = 'move';
            }
        });
    }

    showQuantityModal(itemElement, icon) {
        const currentQuantity = parseInt(itemElement.querySelector('.quantity').textContent) || 1;
        
        document.getElementById('itemQuantity').value = currentQuantity;
        document.getElementById('previewIcon').src = icon.path;
        document.getElementById('previewName').textContent = icon.name;
        
        this.currentItemElement = itemElement;
        this.quantityModal.classList.add('active');
        document.getElementById('itemQuantity').focus();
    }

    confirmQuantity() {
        const newQuantity = parseInt(document.getElementById('itemQuantity').value) || 1;
        
        if (newQuantity <= 0) {
            // Supprimer l'item
            this.currentItemElement.remove();
        } else {
            // Mettre à jour la quantité
            this.currentItemElement.querySelector('.quantity').textContent = newQuantity;
        }
        
        this.quantityModal.classList.remove('active');
        this.currentItemElement = null;
    }

    clearCanvas(askConfirmation = true) {
        if (askConfirmation && !confirm('Êtes-vous sûr de vouloir vider le canvas ?')) {
            return;
        }
        
        const sections = this.canvas.querySelectorAll('.template-section');
        sections.forEach(section => section.remove());
    }

    async exportTemplate() {
        try {
            // Créer un canvas pour l'export
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Définir la taille du canvas (format HD)
            canvas.width = 1920;
            canvas.height = 1080;
            
            // Fond dégradé sombre comme dans l'exemple
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            gradient.addColorStop(0, '#1a1a1a');
            gradient.addColorStop(0.5, '#2d2d2d');
            gradient.addColorStop(1, '#1a1a1a');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Ajouter du grain/texture
            ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
            for (let i = 0; i < 1000; i++) {
                ctx.fillRect(
                    Math.random() * canvas.width,
                    Math.random() * canvas.height,
                    1, 1
                );
            }
            
            // Décorations sur les côtés (rectangles stylisés pour représenter des véhicules)
            this.drawSideDecorations(ctx, canvas.width, canvas.height);
            
            // Bordure du template
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 4;
            ctx.setLineDash([10, 5]);
            ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);
            ctx.setLineDash([]);
            
            // Zone de titre avec fond semi-transparent
            const titleBg = ctx.createLinearGradient(0, 40, 0, 160);
            titleBg.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
            titleBg.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
            ctx.fillStyle = titleBg;
            ctx.fillRect(300, 40, canvas.width - 600, 120);
            
            // Bordure du titre
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.strokeRect(300, 40, canvas.width - 600, 120);
            
            // Titre principal
            ctx.fillStyle = 'white';
            ctx.font = 'bold 42px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            
            const title = document.getElementById('templateTitle').value || '11eRC-FL Stockpile Template';
            ctx.fillText(title, canvas.width / 2, 85);
            
            // Sous-titre
            ctx.font = '20px Arial, sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            const subtitle = document.getElementById('templateSubtitle').value || 
                'This is the content of Operational Stockpiles that the 11eRC-FL expect for each operation made by the regiment.';
            this.wrapText(ctx, subtitle, canvas.width / 2, 115, canvas.width - 400, 22);
            
            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Attendre que toutes les images soient chargées et dessiner les sections
            await this.drawSectionsOnCanvas(ctx, canvas.width, canvas.height);
            
            // Ajouter la date en bas à droite
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '16px Arial, sans-serif';
            ctx.textAlign = 'right';
            const currentDate = new Date().toLocaleDateString('fr-FR', { 
                year: 'numeric', 
                month: 'long' 
            });
            ctx.fillText(currentDate, canvas.width - 80, canvas.height - 30);
            
            // Télécharger l'image
            const link = document.createElement('a');
            link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
            link.href = canvas.toDataURL('image/png', 1.0);
            link.click();
            
        } catch (error) {
            console.error('Erreur lors de l\'export:', error);
            alert('Erreur lors de l\'export du template');
        }
    }

    drawSideDecorations(ctx, width, height) {
        // Silhouettes de véhicules/équipements sur les côtés
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        
        // Côté gauche - forme de véhicule stylisée
        ctx.beginPath();
        ctx.moveTo(50, 200);
        ctx.lineTo(180, 200);
        ctx.lineTo(200, 220);
        ctx.lineTo(200, 280);
        ctx.lineTo(180, 300);
        ctx.lineTo(50, 300);
        ctx.closePath();
        ctx.fill();
        
        // Détails du véhicule gauche
        ctx.fillRect(70, 220, 100, 30);
        ctx.fillRect(85, 210, 70, 10);
        
        // Côté droit - forme de véhicule stylisée (miroir)
        ctx.beginPath();
        ctx.moveTo(width - 50, 200);
        ctx.lineTo(width - 180, 200);
        ctx.lineTo(width - 200, 220);
        ctx.lineTo(width - 200, 280);
        ctx.lineTo(width - 180, 300);
        ctx.lineTo(width - 50, 300);
        ctx.closePath();
        ctx.fill();
        
        // Détails du véhicule droit
        ctx.fillRect(width - 170, 220, 100, 30);
        ctx.fillRect(width - 155, 210, 70, 10);
    }

    wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';
        let currentY = y;

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;
            
            if (testWidth > maxWidth && n > 0) {
                ctx.fillText(line, x, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, currentY);
    }

    async drawSectionsOnCanvas(ctx, canvasWidth, canvasHeight) {
        const sections = this.canvas.querySelectorAll('.template-section');
        
        // Calcul de la disposition automatique des sections
        const sectionsPerRow = Math.min(3, sections.length);
        const sectionWidth = 450;
        const sectionHeight = 280;
        const spacing = 40;
        const startX = (canvasWidth - (sectionsPerRow * sectionWidth + (sectionsPerRow - 1) * spacing)) / 2;
        let startY = 200;
        
        let sectionIndex = 0;
        
        for (const section of sections) {
            const sectionHeader = section.querySelector('.section-header').textContent;
            const sectionItems = section.querySelectorAll('.section-item');
            
            if (sectionItems.length === 0) continue;
            
            const row = Math.floor(sectionIndex / sectionsPerRow);
            const col = sectionIndex % sectionsPerRow;
            
            const sectionX = startX + col * (sectionWidth + spacing);
            const sectionY = startY + row * (sectionHeight + spacing);
            
            // Fond de la section avec transparence
            const sectionBg = ctx.createLinearGradient(sectionX, sectionY, sectionX, sectionY + sectionHeight);
            sectionBg.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
            sectionBg.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
            ctx.fillStyle = sectionBg;
            ctx.fillRect(sectionX, sectionY, sectionWidth, sectionHeight);
            
            // Bordure de la section avec couleur correspondante
            const borderColor = this.getSectionBorderColor(section.classList);
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 3;
            ctx.strokeRect(sectionX, sectionY, sectionWidth, sectionHeight);
            
            // Ombre portée de la section
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 5;
            ctx.shadowOffsetY = 5;
            ctx.strokeRect(sectionX, sectionY, sectionWidth, sectionHeight);
            
            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // En-tête de la section
            ctx.fillStyle = 'white';
            ctx.font = 'bold 24px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(sectionHeader, sectionX + sectionWidth / 2, sectionY + 35);
            
            // Ligne sous le titre
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sectionX + 20, sectionY + 50);
            ctx.lineTo(sectionX + sectionWidth - 20, sectionY + 50);
            ctx.stroke();
            
            // Zone de contenu des items
            const contentX = sectionX + 20;
            const contentY = sectionY + 70;
            const contentWidth = sectionWidth - 40;
            const contentHeight = sectionHeight - 90;
            
            // Grille des items
            const itemsPerRow = 6;
            const itemSize = 60;
            const itemSpacing = (contentWidth - (itemsPerRow * itemSize)) / (itemsPerRow + 1);
            
            for (let i = 0; i < sectionItems.length; i++) {
                const item = sectionItems[i];
                const img = item.querySelector('img');
                const quantity = item.querySelector('.quantity').textContent;
                
                const row = Math.floor(i / itemsPerRow);
                const col = i % itemsPerRow;
                
                const itemX = contentX + itemSpacing + col * (itemSize + itemSpacing);
                const itemY = contentY + 20 + row * (itemSize + 30);
                
                try {
                    // Fond de l'item
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                    ctx.fillRect(itemX - 5, itemY - 5, itemSize + 10, itemSize + 10);
                    
                    // Bordure de l'item
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(itemX - 5, itemY - 5, itemSize + 10, itemSize + 10);
                    
                    // Dessiner l'icône
                    await this.drawImageOnCanvas(ctx, img.src, itemX, itemY, itemSize, itemSize);
                    
                    // Badge de quantité (style amélioré)
                    const badgeSize = 28;
                    const badgeX = itemX + itemSize - badgeSize / 2;
                    const badgeY = itemY - badgeSize / 2;
                    
                    // Ombre du badge
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                    ctx.beginPath();
                    ctx.arc(badgeX + 2, badgeY + 2, badgeSize / 2, 0, 2 * Math.PI);
                    ctx.fill();
                    
                    // Badge principal
                    ctx.fillStyle = 'white';
                    ctx.beginPath();
                    ctx.arc(badgeX, badgeY, badgeSize / 2, 0, 2 * Math.PI);
                    ctx.fill();
                    
                    // Bordure du badge
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                    // Texte de la quantité
                    ctx.fillStyle = 'black';
                    ctx.font = 'bold 16px Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(quantity, badgeX, badgeY + 6);
                    
                } catch (error) {
                    console.error('Erreur lors du chargement de l\'image:', img.src);
                }
            }
            
            sectionIndex++;
        }
    }

    getSectionBorderColor(classList) {
        if (classList.contains('blue')) return '#3b82f6';
        if (classList.contains('red')) return '#ef4444';
        if (classList.contains('green')) return '#10b981';
        if (classList.contains('orange')) return '#f59e0b';
        if (classList.contains('purple')) return '#8b5cf6';
        if (classList.contains('gray')) return '#6b7280';
        return '#3b82f6';
    }

    drawImageOnCanvas(ctx, src, x, y, width, height) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                ctx.drawImage(img, x, y, width, height);
                resolve();
            };
            img.onerror = reject;
            img.src = src;
        });
    }

    saveTemplate() {
        const templateData = {
            title: document.getElementById('templateTitle').value,
            subtitle: document.getElementById('templateSubtitle').value,
            sections: []
        };

        const sections = this.canvas.querySelectorAll('.template-section');
        sections.forEach(section => {
            const sectionData = {
                name: section.querySelector('.section-header').textContent,
                color: Array.from(section.classList).find(cls => ['blue', 'red', 'green', 'orange', 'purple', 'gray'].includes(cls)),
                position: {
                    left: section.style.left,
                    top: section.style.top
                },
                items: []
            };

            const items = section.querySelectorAll('.section-item');
            items.forEach(item => {
                const img = item.querySelector('img');
                const quantity = item.querySelector('.quantity').textContent;
                
                sectionData.items.push({
                    iconPath: item.dataset.iconPath,
                    quantity: parseInt(quantity)
                });
            });

            templateData.sections.push(sectionData);
        });

        const dataStr = JSON.stringify(templateData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `${templateData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_template.json`;
        link.click();
    }

    loadTemplate() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const templateData = JSON.parse(e.target.result);
                    this.applyTemplate(templateData);
                } catch (error) {
                    alert('Erreur lors du chargement du template');
                    console.error(error);
                }
            };
            reader.readAsText(file);
        };
        
        input.click();
    }

    applyTemplate(templateData) {
        // Vider le canvas d'abord
        this.clearCanvas(false); // Ne pas demander confirmation
        
        // Appliquer les données
        document.getElementById('templateTitle').value = templateData.title || '';
        document.getElementById('templateSubtitle').value = templateData.subtitle || '';
        
        templateData.sections.forEach(sectionData => {
            const section = this.createSectionElement(sectionData.name, sectionData.color);
            section.style.left = sectionData.position.left;
            section.style.top = sectionData.position.top;
            
            const sectionContent = section.querySelector('.section-content');
            sectionData.items.forEach(itemData => {
                const icon = this.icons.find(i => i.path === itemData.iconPath);
                if (icon) {
                    const itemElement = this.createSectionItem(icon, itemData.quantity);
                    sectionContent.appendChild(itemElement);
                }
            });
            
            this.canvas.appendChild(section);
        });
    }
}

// Initialiser l'application
document.addEventListener('DOMContentLoaded', () => {
    new TemplateBuilder();
});
