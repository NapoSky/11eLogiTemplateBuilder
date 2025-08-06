// Gestionnaire pour les sections du canvas
export class SectionManager {
    constructor(dragDropManager) {
        this.dragDropManager = dragDropManager;
        this.sectionColors = [
            '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', 
            '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'
        ];
        this.nextColorIndex = 0;
    }

    createSection() {
        const sectionName = document.getElementById('sectionName').value.trim();
        const sectionColor = document.getElementById('sectionColor').value;
        
        if (!sectionName) {
            alert('Veuillez entrer un nom pour la section');
            return;
        }

        const section = this.createSectionElement(sectionName, sectionColor);
        const canvas = document.getElementById('canvas');
        canvas.appendChild(section);
        
        // Mettre à jour la visibilité de la drop-zone
        this.updateDropZoneVisibility();
        
        // Fermer la modale
        document.getElementById('sectionModal').classList.remove('active');
        document.getElementById('sectionName').value = '';
        
        return section;
    }

    createSectionElement(name, color) {
        const canvas = document.getElementById('canvas');
        const sectionDiv = document.createElement('div');
        sectionDiv.className = `template-section ${color}`;
        sectionDiv.style.position = 'absolute';
        sectionDiv.style.top = '50px';
        sectionDiv.style.left = '50px';
        
        sectionDiv.innerHTML = `
            <div class="section-header">
                <span class="section-title" title="Cliquer pour éditer">${name}</span>
                <button class="section-delete-btn" title="Supprimer la section">×</button>
            </div>
            <div class="section-content"></div>
        `;

        // Ajouter l'événement de suppression
        const deleteBtn = sectionDiv.querySelector('.section-delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteSection(sectionDiv);
        });

        // Ajouter l'événement d'édition du titre
        const titleSpan = sectionDiv.querySelector('.section-title');
        titleSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editSectionTitle(sectionDiv, titleSpan);
        });

        // Rendre la section déplaçable
        this.makeDraggable(sectionDiv);
        
        return sectionDiv;
    }

    makeDraggable(element) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        const header = element.querySelector('.section-header');
        if (!header) return;
        
        // Ajouter le style du curseur
        header.style.cursor = 'move';
        
        header.addEventListener('mousedown', (e) => {
            // Ignorer si c'est un clic sur le bouton de suppression ou le titre
            if (e.target.classList.contains('section-delete-btn') || 
                e.target.classList.contains('section-title')) {
                return;
            }
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(element.style.left) || 0;
            startTop = parseInt(element.style.top) || 0;
            
            element.style.zIndex = '1000';
            header.style.cursor = 'grabbing';
            
            e.preventDefault();
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

    deleteSection(section) {
        if (confirm('Êtes-vous sûr de vouloir supprimer cette section ?')) {
            // Déplacer tous les icônes de la section vers le canvas principal
            const icons = section.querySelectorAll('.canvas-icon');
            const canvas = document.getElementById('canvas');
            
            icons.forEach(icon => {
                // Calculer la position absolue de l'icône
                const iconRect = icon.getBoundingClientRect();
                const canvasRect = canvas.getBoundingClientRect();
                
                const absoluteX = iconRect.left - canvasRect.left;
                const absoluteY = iconRect.top - canvasRect.top;
                
                icon.style.left = absoluteX + 'px';
                icon.style.top = absoluteY + 'px';
                
                canvas.appendChild(icon);
            });
            
            section.remove();
            
            // Mettre à jour la visibilité de la drop-zone
            this.updateDropZoneVisibility();
        }
    }

    getSectionData(section) {
        const rect = section.getBoundingClientRect();
        const canvasRect = document.getElementById('canvas').getBoundingClientRect();
        
        const title = section.querySelector('.section-title').textContent;
        const colorClass = Array.from(section.classList).find(cls => 
            ['blue', 'red', 'green', 'orange', 'purple', 'gray', 'yellow', 'brown'].includes(cls)
        );
        
        return {
            name: title,
            color: colorClass || 'blue',
            position: {
                left: section.style.left,
                top: section.style.top
            },
            x: rect.left - canvasRect.left,
            y: rect.top - canvasRect.top
        };
    }

    createSectionFromData(data) {
        const section = this.createSectionElement(data.name, data.color);
        
        if (data.position) {
            section.style.left = data.position.left;
            section.style.top = data.position.top;
        } else if (data.x !== undefined && data.y !== undefined) {
            section.style.left = data.x + 'px';
            section.style.top = data.y + 'px';
        }
        
        const canvas = document.getElementById('canvas');
        canvas.appendChild(section);
        
        // Mettre à jour la visibilité de la drop-zone
        this.updateDropZoneVisibility();
        
        return section;
    }

    // Méthodes pour la compatibilité avec l'ancien système
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

    updateDropZoneVisibility() {
        const canvas = document.getElementById('canvas');
        const dropZone = canvas.querySelector('.drop-zone');
        const sections = canvas.querySelectorAll('.template-section');
        
        if (dropZone) {
            if (sections.length > 0) {
                dropZone.classList.add('hidden');
            } else {
                dropZone.classList.remove('hidden');
            }
        }
    }

    createDefaultSection(icon) {
        const sectionName = this.getSectionNameForCategory(icon.category);
        const sectionColor = this.getSectionColorForCategory(icon.category);
        
        const section = this.createSectionElement(sectionName, sectionColor);
        const canvas = document.getElementById('canvas');
        canvas.appendChild(section);
        
        // Mettre à jour la visibilité de la drop-zone
        this.updateDropZoneVisibility();
        
        return section;
    }

    editSectionTitle(sectionElement, titleSpan) {
        const currentTitle = titleSpan.textContent;
        
        // Créer un input temporaire
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTitle;
        input.className = 'section-title-edit';
        input.style.cssText = `
            background: rgba(255, 255, 255, 0.9);
            color: #000;
            border: 2px solid #007bff;
            border-radius: 4px;
            padding: 2px 6px;
            font-size: inherit;
            font-weight: inherit;
            width: 200px;
            z-index: 1000;
        `;
        
        // Remplacer temporairement le span par l'input
        titleSpan.style.display = 'none';
        titleSpan.parentNode.insertBefore(input, titleSpan);
        
        // Focus et sélection
        input.focus();
        input.select();
        
        // Fonction pour valider l'édition
        const confirmEdit = () => {
            const newTitle = input.value.trim();
            if (newTitle && newTitle !== currentTitle) {
                titleSpan.textContent = newTitle;
            }
            input.remove();
            titleSpan.style.display = '';
        };
        
        // Fonction pour annuler l'édition
        const cancelEdit = () => {
            input.remove();
            titleSpan.style.display = '';
        };
        
        // Gestion des événements
        input.addEventListener('blur', confirmEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
        
        // Empêcher la propagation du clic pour éviter de déclencher le drag
        input.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
    }

    deleteSection(sectionElement) {
        if (confirm('Êtes-vous sûr de vouloir supprimer cette section ?')) {
            // Déplacer tous les icônes de la section vers le canvas principal
            const icons = sectionElement.querySelectorAll('.canvas-icon');
            const canvas = document.getElementById('canvas');
            
            icons.forEach(icon => {
                // Calculer la position absolue de l'icône
                const iconRect = icon.getBoundingClientRect();
                const canvasRect = canvas.getBoundingClientRect();
                
                const absoluteX = iconRect.left - canvasRect.left;
                const absoluteY = iconRect.top - canvasRect.top;
                
                icon.style.left = absoluteX + 'px';
                icon.style.top = absoluteY + 'px';
                
                canvas.appendChild(icon);
            });
            
            sectionElement.remove();
            
            // Mettre à jour la visibilité de la drop-zone
            this.updateDropZoneVisibility();
        }
    }
}