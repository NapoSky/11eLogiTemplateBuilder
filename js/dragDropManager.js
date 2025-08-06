// Gestionnaire pour le drag & drop
export class DragDropManager {
    constructor(iconManager) {
        this.iconManager = iconManager;
        this.draggedItem = null;
        this.initializeDragDrop();
    }

    initializeDragDrop() {
        this.setupCanvasDragDrop();
    }

    setupCanvasDragDrop() {
        const canvas = document.getElementById('canvas');
        
        // Drag & Drop depuis la sidebar vers le canvas
        canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            
            const section = e.target.closest('.template-section');
            if (section) {
                section.classList.add('drop-target');
            }
        });

        canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            this.handleDrop(e);
        });

        canvas.addEventListener('dragleave', (e) => {
            document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        });
    }

    setupIconDragStart(iconElement, iconData) {
        iconElement.draggable = true;
        iconElement.addEventListener('dragstart', (e) => {
            this.draggedItem = iconData;
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'copy';
        });
    }

    handleDrop(e) {
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
        const existingItem = sectionContent.querySelector(`[data-icon="${icon.filename}"]`);

        if (existingItem) {
            // Incrémenter la quantité
            const quantityBadge = existingItem.querySelector('.quantity-badge');
            const currentQuantity = parseInt(quantityBadge.textContent) || 1;
            quantityBadge.textContent = currentQuantity + 1;
        } else {
            // Utiliser createCanvasIcon de l'iconManager pour avoir les boutons de suppression
            const canvasIcon = this.iconManager.createCanvasIcon(icon.filename, 0, 0, 1, true);
            sectionContent.appendChild(canvasIcon);
            // Les icônes dans les sections ne sont pas draggables individuellement
        }
    }

    createDefaultSection(icon) {
        const sectionName = this.getSectionNameForCategory(icon.category);
        const sectionColor = this.getSectionColorForCategory(icon.category);
        
        const section = window.app.sectionManager.createSectionElement(sectionName, sectionColor);
        const canvas = document.getElementById('canvas');
        canvas.appendChild(section);
        
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
            weapons: 'yellow',
            ammo: 'red',
            uniforms: 'gray',
            materials: 'orange',
            medical: 'green',
            vehicles: 'brown',
            other: 'blue'
        };
        
        return categoryColors[category] || 'blue';
    }

    makeDraggable(iconElement) {
        // Rendre les icônes déplaçables dans le canvas/sections
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        iconElement.addEventListener('mousedown', (e) => {
            // Ignorer si c'est un clic sur un badge ou bouton
            if (e.target.classList.contains('quantity-badge') || 
                e.target.classList.contains('delete-icon-btn')) {
                return;
            }

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(iconElement.style.left) || 0;
            startTop = parseInt(iconElement.style.top) || 0;
            
            iconElement.style.zIndex = '1000';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            iconElement.style.left = Math.max(0, startLeft + deltaX) + 'px';
            iconElement.style.top = Math.max(0, startTop + deltaY) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                iconElement.style.zIndex = '';
            }
        });
    }
}
