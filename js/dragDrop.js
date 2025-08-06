// Gestion du système de drag & drop
export class DragDropManager {
    constructor() {
        this.draggedElement = null;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragPreview = false;
        this.init();
    }

    init() {
        // Gestionnaires d'événements globaux pour le drag & drop
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!this.draggedElement) return;

            const canvas = document.getElementById('canvas');
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left - this.offsetX;
            const y = e.clientY - rect.top - this.offsetY;

            // Contraindre aux limites du canvas
            const maxX = canvas.offsetWidth - this.draggedElement.offsetWidth;
            const maxY = canvas.offsetHeight - this.draggedElement.offsetHeight;
            
            this.draggedElement.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
            this.draggedElement.style.top = Math.max(0, Math.min(y, maxY)) + 'px';

            this.cleanup();
        });

        document.addEventListener('dragend', () => {
            this.cleanup();
        });
    }

    cleanup() {
        if (this.draggedElement) {
            this.draggedElement.style.transform = '';
            this.draggedElement.style.zIndex = '';
            this.draggedElement = null;
        }
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragPreview = false;
    }

    makeIconDraggable(iconElement) {
        iconElement.draggable = true;
        
        // Nettoyer les anciens event listeners
        iconElement.removeEventListener('dragstart', this.iconDragStart);
        
        iconElement.addEventListener('dragstart', (e) => {
            this.isDragPreview = true;
            this.draggedElement = iconElement;
            
            const rect = iconElement.getBoundingClientRect();
            this.offsetX = e.clientX - rect.left;
            this.offsetY = e.clientY - rect.top;

            // Créer une image de prévisualisation
            const dragImage = iconElement.cloneNode(true);
            dragImage.style.transform = 'scale(0.8)';
            dragImage.style.opacity = '0.7';
            document.body.appendChild(dragImage);
            dragImage.style.position = 'absolute';
            dragImage.style.left = '-1000px';
            
            e.dataTransfer.setDragImage(dragImage, this.offsetX, this.offsetY);
            
            // Supprimer l'élément temporaire après un court délai
            setTimeout(() => {
                if (dragImage.parentNode) {
                    dragImage.parentNode.removeChild(dragImage);
                }
            }, 100);
        });
    }

    makeSectionDraggable(sectionElement) {
        const header = sectionElement.querySelector('.section-header');
        if (!header) return;

        header.style.cursor = 'move';
        header.draggable = true;
        
        // Nettoyer les anciens event listeners
        header.removeEventListener('dragstart', this.sectionDragStart);
        
        header.addEventListener('dragstart', (e) => {
            this.isDragPreview = false;
            this.draggedElement = sectionElement;
            
            const rect = sectionElement.getBoundingClientRect();
            this.offsetX = e.clientX - rect.left;
            this.offsetY = e.clientY - rect.top;

            // Style pendant le drag
            sectionElement.style.transform = 'scale(0.95)';
            sectionElement.style.zIndex = '1000';
            
            // Image de drag personnalisée
            const dragImage = document.createElement('div');
            dragImage.textContent = header.textContent;
            dragImage.style.cssText = `
                position: absolute;
                left: -1000px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 10px;
                border-radius: 5px;
                font-weight: bold;
            `;
            document.body.appendChild(dragImage);
            
            e.dataTransfer.setDragImage(dragImage, this.offsetX, this.offsetY);
            
            setTimeout(() => {
                if (dragImage.parentNode) {
                    dragImage.parentNode.removeChild(dragImage);
                }
            }, 100);
        });
    }

    // Méthode pour réinitialiser tous les éléments draggables
    refreshAllDraggables() {
        // Réinitialiser les icônes
        const icons = document.querySelectorAll('.canvas-icon');
        icons.forEach(icon => this.makeIconDraggable(icon));

        // Réinitialiser les sections
        const sections = document.querySelectorAll('.section');
        sections.forEach(section => this.makeSectionDraggable(section));
    }
}
