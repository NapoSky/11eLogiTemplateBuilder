// Gestion des icônes
import { iconCategories, iconFiles, loadIconMapping, getIconDisplayName } from './config.js';

export class IconManager {
    constructor(dragDropManager, sectionManager) {
        this.dragDropManager = dragDropManager;
        this.sectionManager = sectionManager;
        this.icons = []; // Pour stocker les icônes avec leurs métadonnées
        this.filteredIcons = [...iconFiles];
        this.init();
    }

    init() {
        this.setupCategoryFilter();
        this.setupIconDropHandler();
    }

    setupIconDropHandler() {
        // Écouter l'événement custom de drop d'icône
        document.addEventListener('iconDropped', (e) => {
            this.handleIconDrop(e.detail);
        });
    }

    setupCategoryFilter() {
        // Les boutons de catégorie sont déjà dans le HTML, on n'a pas besoin de les créer
        // Ils seront gérés par app.js
    }

    categorizeIcon(iconName) {
        const lowerName = iconName.toLowerCase();
        
        for (const [category, keywords] of Object.entries(iconCategories)) {
            if (category === 'other') continue;
            
            for (const keyword of keywords) {
                if (lowerName.includes(keyword.toLowerCase())) {
                    return category;
                }
            }
        }
        
        return 'other';
    }

    async loadIcons() {
        try {
            console.log('Chargement des icônes...');
            
            // Charger d'abord le mapping des noms
            await loadIconMapping();
            
            const iconGrid = document.getElementById('iconsGrid'); // Changé de 'icon-grid' à 'iconsGrid'
            if (!iconGrid) {
                console.error('Element iconsGrid non trouvé');
                return;
            }
            
            console.log('IconGrid trouvé, iconFiles:', iconFiles.length, 'icônes');
            iconGrid.innerHTML = '';
            
            // Chargement dynamique des icônes depuis iconFiles (config.js)
            this.icons = iconFiles.map(filename => ({
                filename,
                name: getIconDisplayName(filename), // Utiliser le mapping
                category: this.categorizeIcon(filename),
                path: `assets/icons/${filename}`
            }));

            console.log('Icônes traitées:', this.icons.length);
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

    renderIcons(filter = 'all', searchTerm = '') {
        const iconGrid = document.getElementById('iconsGrid'); // Changé de 'icon-grid' à 'iconsGrid'
        iconGrid.innerHTML = '';
        
        console.log('Rendu des icônes, filtre:', filter, 'recherche:', searchTerm);
        
        const filteredIcons = this.icons.filter(icon => {
            const matchesCategory = filter === 'all' || icon.category === filter;
            const matchesSearch = searchTerm === '' || 
                icon.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                icon.filename.toLowerCase().includes(searchTerm.toLowerCase());
            
            return matchesCategory && matchesSearch;
        });

        console.log('Icônes filtrées:', filteredIcons.length);

        filteredIcons.forEach(icon => {
            const iconElement = this.createIconElement(icon);
            iconGrid.appendChild(iconElement);
        });
    }

    createIconElement(icon) {
        const iconDiv = document.createElement('div');
        iconDiv.className = 'icon-item';
        iconDiv.dataset.category = icon.category;
        iconDiv.dataset.name = icon.filename.toLowerCase();
        iconDiv.draggable = true;
        iconDiv.dataset.icon = JSON.stringify(icon);
        
        iconDiv.innerHTML = `
            <img src="${icon.path}" alt="${icon.name}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yNCAxNkMyMC42ODYgMTYgMTggMTguNjg2IDE4IDIyQzE4IDI1LjMxNCAyMC42ODYgMjggMjQgMjhDMjcuMzE0IDI4IDMwIDI1LjMxNCAzMCAyMkMzMCAxOC42ODYgMjcuMzE0IDE2IDI0IDE2WiIgZmlsbD0iIzlDQTNBRiIvPgo8L3N2Zz4K'">
            <span>${icon.name}</span>
        `;

        // Événement de clic pour ajouter au canvas
        iconDiv.addEventListener('click', () => {
            this.addIconToCanvas(icon);
        });

        // Setup drag and drop
        this.dragDropManager.setupIconDragStart(iconDiv, icon);
        
        return iconDiv;
    }

    addIconToCanvas(icon) {
        // Créer une section par défaut et y ajouter l'icône
        this.dragDropManager.createDefaultSection(icon);
    }

    createCanvasIcon(iconFile, x = 0, y = 0, quantity = 1, inSection = false) {
        const iconContainer = document.createElement('div');
        iconContainer.className = 'canvas-icon';
        iconContainer.dataset.icon = iconFile;
        
        // Styles différents selon si l'icône est dans une section ou sur le canvas
        if (inSection) {
            iconContainer.style.cssText = `
                position: relative;
                width: 64px;
                height: 64px;
                cursor: move;
                user-select: none;
                margin: 4px;
                display: block;
                overflow: visible;
            `;
        } else {
            iconContainer.style.cssText = `
                position: absolute;
                left: ${x}px;
                top: ${y}px;
                width: 64px;
                height: 64px;
                cursor: move;
                user-select: none;
                overflow: visible;
            `;
        }

        const img = document.createElement('img');
        img.src = `assets/icons/${iconFile}`;
        img.alt = iconFile;
        img.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
            pointer-events: auto;
            cursor: pointer;
            display: block;
        `;

        const quantityBadge = document.createElement('div');
        quantityBadge.className = 'quantity-badge';
        quantityBadge.textContent = quantity;
        quantityBadge.style.cssText = `
            position: absolute;
            top: -8px;
            right: -8px;
            background: #ff6b35;
            color: white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            z-index: 1000;
        `;

        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'delete-icon-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = 'Supprimer l\'icône';
        
        // Styles de base pour le bouton de suppression
        const baseStyles = `
            position: absolute !important;
            top: -8px !important;
            left: -8px !important;
            background: #dc3545 !important;
            color: white !important;
            border-radius: 50% !important;
            width: 20px !important;
            height: 20px !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 14px !important;
            font-weight: bold !important;
            cursor: pointer !important;
            border: 2px solid white !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3) !important;
            z-index: 10000 !important;
            line-height: 1 !important;
            transition: all 0.2s ease !important;
        `;
        
        if (inSection) {
            // Dans les sections, rendre le bouton semi-visible par défaut
            deleteBtn.style.cssText = baseStyles + `
                display: flex !important;
                opacity: 0.4 !important;
                visibility: visible !important;
            `;
        } else {
            // Sur le canvas, masquer complètement
            deleteBtn.style.cssText = baseStyles + `
                display: none !important;
                opacity: 0 !important;
                visibility: hidden !important;
            `;
        }

        // Événements
        quantityBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editQuantity(iconContainer, quantityBadge);
        });
        
        // Double-clic sur le badge pour suppression rapide
        quantityBadge.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('Double-clic sur badge, suppression rapide');
            if (confirm('Supprimer cette icône ?')) {
                iconContainer.remove();
            }
        });

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('Clic sur bouton suppression pour icône:', iconFile);
            
            // Forcer la suppression
            if (iconContainer.parentNode) {
                console.log('Parent trouvé, suppression...');
                iconContainer.parentNode.removeChild(iconContainer);
                console.log('Icône supprimée du DOM');
            } else {
                console.log('Pas de parent, utilisation de remove()');
                iconContainer.remove();
            }
        });

        // Gestion du survol pour afficher/masquer le bouton de suppression
        if (inSection) {
            // Dans les sections, améliorer la visibilité au survol
            iconContainer.addEventListener('mouseenter', () => {
                deleteBtn.style.setProperty('opacity', '1', 'important');
                deleteBtn.style.setProperty('transform', 'scale(1.1)', 'important');
            });

            iconContainer.addEventListener('mouseleave', () => {
                deleteBtn.style.setProperty('opacity', '0.4', 'important');
                deleteBtn.style.setProperty('transform', 'scale(1)', 'important');
            });
        } else {
            // Sur le canvas, gestion normale
            iconContainer.addEventListener('mouseenter', () => {
                deleteBtn.style.setProperty('display', 'flex', 'important');
                deleteBtn.style.setProperty('visibility', 'visible', 'important');
                deleteBtn.style.setProperty('opacity', '1', 'important');
            });

            iconContainer.addEventListener('mouseleave', () => {
                deleteBtn.style.setProperty('display', 'none', 'important');
                deleteBtn.style.setProperty('visibility', 'hidden', 'important');
                deleteBtn.style.setProperty('opacity', '0', 'important');
            });
        }

        // Gérer le clic sur l'icône (pas sur les badges)
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editQuantity(iconContainer, quantityBadge);
        });

        // Empêcher le menu contextuel du navigateur
        iconContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        iconContainer.appendChild(img);
        iconContainer.appendChild(quantityBadge);
        iconContainer.appendChild(deleteBtn);

        return iconContainer;
    }

    editQuantity(iconContainer, badge) {
        const currentQuantity = parseInt(badge.textContent);
        const iconFile = iconContainer.dataset.icon;
        
        // Utiliser la jolie modale au lieu du prompt
        document.getElementById('itemQuantity').value = currentQuantity;
        document.getElementById('previewIcon').src = `assets/icons/${iconFile}`;
        
        // Trouver le nom d'affichage de l'icône
        const iconData = this.icons.find(i => i.filename === iconFile);
        const displayName = iconData ? iconData.name : iconFile.replace('.png', '');
        document.getElementById('previewName').textContent = displayName;
        
        // Stocker l'élément pour la confirmation
        window.app.currentItemElement = iconContainer;
        window.app.currentQuantityBadge = badge;
        
        document.getElementById('quantityModal').classList.add('active');
        document.getElementById('itemQuantity').focus();
        document.getElementById('itemQuantity').select();
    }

    filterIcons(searchTerm = '') {
        // Pas besoin de récupérer la catégorie ici, on utilise directement renderIcons avec 'all'
        this.renderIcons('all', searchTerm);
    }

    filterByCategory(selectedCategory) {
        const searchTerm = document.getElementById('searchIcons').value || '';
        this.renderIcons(selectedCategory || 'all', searchTerm);
    }

    getCanvasIcons() {
        const icons = [];
        
        // Icônes directement sur le canvas (pas dans les sections)
        const canvas = document.getElementById('canvas');
        const directIcons = canvas.querySelectorAll(':scope > .canvas-icon');
        directIcons.forEach(icon => {
            const iconFile = icon.dataset.icon;
            const quantityBadge = icon.querySelector('.quantity-badge');
            const quantity = quantityBadge ? parseInt(quantityBadge.textContent) || 1 : 1;
            const style = icon.style;
            
            icons.push({
                icon: iconFile,
                x: parseInt(style.left) || 0,
                y: parseInt(style.top) || 0,
                quantity: quantity,
                inSection: false
            });
        });

        // Icônes dans les sections
        const sections = canvas.querySelectorAll('.template-section');
        sections.forEach((section, sectionIndex) => {
            const sectionIcons = section.querySelectorAll('.canvas-icon');
            sectionIcons.forEach(icon => {
                const iconFile = icon.dataset.icon;
                const quantityBadge = icon.querySelector('.quantity-badge');
                const quantity = quantityBadge ? parseInt(quantityBadge.textContent) || 1 : 1;
                
                icons.push({
                    icon: iconFile,
                    quantity: quantity,
                    inSection: true,
                    sectionIndex: sectionIndex
                });
            });
        });
        
        return icons;
    }

    loadCanvasIcons(icons) {
        const canvas = document.getElementById('canvas');
        const sections = canvas.querySelectorAll('.template-section');
        
        icons.forEach(iconData => {
            if (iconData.inSection && iconData.sectionIndex !== undefined) {
                // Icône dans une section
                if (sections[iconData.sectionIndex]) {
                    const section = sections[iconData.sectionIndex];
                    const sectionContent = section.querySelector('.section-content');
                    const canvasIcon = this.createCanvasIcon(
                        iconData.icon,
                        0, 0, // Position non utilisée pour les sections
                        iconData.quantity,
                        true // inSection = true
                    );
                    sectionContent.appendChild(canvasIcon);
                }
            } else {
                // Icône directement sur le canvas
                const canvasIcon = this.createCanvasIcon(
                    iconData.icon,
                    iconData.x || 0,
                    iconData.y || 0,
                    iconData.quantity,
                    false // inSection = false
                );
                canvas.appendChild(canvasIcon);
                this.dragDropManager.makeDraggable(canvasIcon);
            }
        });
    }

    clearCanvas() {
        document.querySelectorAll('.canvas-icon').forEach(icon => icon.remove());
        document.querySelectorAll('.canvas-section').forEach(section => section.remove());
    }

    handleIconDrop(dropData) {
        const { iconPath, x, y, targetSection } = dropData;
        
        // Trouver l'icône correspondante
        const icon = this.icons.find(i => i.filename === iconPath);
        if (!icon) {
            console.error('Icône non trouvée:', iconPath);
            return;
        }
        
        if (targetSection) {
            // Ajouter à la section - utiliser le style relatif
            const canvasIcon = this.createCanvasIcon(icon.filename, 0, 0, 1, true);
            const sectionContent = targetSection.querySelector('.section-content');
            sectionContent.appendChild(canvasIcon);
            
            // Pour les icônes dans les sections, on utilise le layout de la grille CSS
            // donc pas besoin de positionnement absolu
        } else {
            // Ajouter directement au canvas - utiliser le style absolu
            const canvasIcon = this.createCanvasIcon(icon.filename, x, y, 1, false);
            const canvas = document.getElementById('canvas');
            canvas.appendChild(canvasIcon);
            this.dragDropManager.makeDraggable(canvasIcon);
        }
    }

    getIconData(iconElement) {
        const rect = iconElement.getBoundingClientRect();
        const canvasRect = document.getElementById('canvas').getBoundingClientRect();
        
        const quantityBadge = iconElement.querySelector('.quantity-badge');
        const quantity = quantityBadge ? parseInt(quantityBadge.textContent) || 1 : 1;
        
        return {
            icon: iconElement.dataset.icon,
            x: rect.left - canvasRect.left,
            y: rect.top - canvasRect.top,
            quantity: quantity
        };
    }

    createIconInSection(section, iconData) {
        const sectionContent = section.querySelector('.section-content');
        if (!sectionContent) {
            console.error('Section content not found');
            return null;
        }
        
        const canvasIcon = this.createCanvasIcon(
            iconData.icon,
            0, 0, // Position non utilisée pour les sections
            iconData.quantity || 1,
            true // inSection = true
        );
        
        sectionContent.appendChild(canvasIcon);
        return canvasIcon;
    }

    createIconFromData(iconData) {
        const canvas = document.getElementById('canvas');
        
        // Cette méthode est maintenant utilisée uniquement pour les icônes libres (directement sur le canvas)
        const canvasIcon = this.createCanvasIcon(
            iconData.icon,
            iconData.x || 0,
            iconData.y || 0,
            iconData.quantity || 1,
            false // inSection = false
        );
        canvas.appendChild(canvasIcon);
        this.dragDropManager.makeDraggable(canvasIcon);
        return canvasIcon;
    }
}
