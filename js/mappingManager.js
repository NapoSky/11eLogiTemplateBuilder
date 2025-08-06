// Gestionnaire pour l'édition du mapping des icônes
import { iconFiles, getIconDisplayName } from './config.js';

export class MappingManager {
    constructor() {
        this.currentMapping = {};
        this.originalMapping = {};
    }

    async loadCurrentMapping() {
        try {
            const response = await fetch('./iconMapping.json');
            if (response.ok) {
                this.originalMapping = await response.json();
                this.currentMapping = { ...this.originalMapping };
            }
        } catch (error) {
            console.warn('Erreur lors du chargement du mapping:', error);
        }
    }

    showMappingModal() {
        document.getElementById('mappingModal').classList.add('active');
        this.loadCurrentMapping().then(() => {
            this.renderMappingList();
            this.updateMappingStatus();
        });
    }

    updateMappingStatus() {
        const hasCustomMapping = localStorage.getItem('iconMapping') !== null;
        const modalHeader = document.querySelector('#mappingModal .modal-header h3');
        
        if (hasCustomMapping) {
            modalHeader.innerHTML = `
                <i class="fas fa-edit"></i> 
                Éditer les noms des icônes 
                <span style="color: var(--success-color); font-size: 0.8em; font-weight: normal;">
                    (Mapping personnalisé actif)
                </span>
            `;
        } else {
            modalHeader.innerHTML = `
                <i class="fas fa-edit"></i> 
                Éditer les noms des icônes 
                <span style="color: var(--text-secondary); font-size: 0.8em; font-weight: normal;">
                    (Mapping par défaut)
                </span>
            `;
        }
    }

    renderMappingList() {
        const mappingList = document.getElementById('mappingList');
        if (!mappingList) return;

        mappingList.innerHTML = '';

        iconFiles.forEach(filename => {
            const item = document.createElement('div');
            item.className = 'mapping-item';

            const currentName = this.currentMapping[filename] || getIconDisplayName(filename);

            item.innerHTML = `
                <img src="assets/icons/${filename}" alt="${filename}" class="mapping-icon" 
                     onerror="this.style.display='none'">
                <div class="mapping-filename">${filename}</div>
                <input type="text" class="mapping-input" 
                       value="${currentName}" 
                       data-filename="${filename}"
                       placeholder="Nom d'affichage">
            `;

            mappingList.appendChild(item);
        });

        // Ajouter les listeners pour la recherche
        this.setupMappingSearch();
        this.setupMappingInputs();
    }

    setupMappingSearch() {
        const searchInput = document.getElementById('mappingSearch');
        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const items = document.querySelectorAll('.mapping-item');

            items.forEach(item => {
                const filename = item.querySelector('.mapping-filename').textContent.toLowerCase();
                const currentValue = item.querySelector('.mapping-input').value.toLowerCase();
                
                if (filename.includes(searchTerm) || currentValue.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    setupMappingInputs() {
        const inputs = document.querySelectorAll('.mapping-input');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const filename = e.target.dataset.filename;
                const newValue = e.target.value.trim();
                
                if (newValue) {
                    this.currentMapping[filename] = newValue;
                } else {
                    delete this.currentMapping[filename];
                }
            });
        });
    }

    saveMapping() {
        // Sauvegarder en localStorage pour persistance
        localStorage.setItem('iconMapping', JSON.stringify(this.currentMapping));
        
        // Mettre à jour le statut
        this.updateMappingStatus();
        
        // Créer un événement pour notifier que le mapping a changé
        window.dispatchEvent(new CustomEvent('mappingUpdated', {
            detail: this.currentMapping
        }));

        alert('Mapping sauvegardé ! Rechargez la page pour voir les changements.');
    }

    downloadMapping() {
        const blob = new Blob([JSON.stringify(this.currentMapping, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'iconMapping.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    resetMapping() {
        if (confirm('Êtes-vous sûr de vouloir supprimer toutes les personnalisations de noms ? Les noms par défaut seront restaurés.')) {
            // Supprimer le mapping du localStorage
            localStorage.removeItem('iconMapping');
            
            // Réinitialiser le mapping actuel au mapping original du fichier
            this.currentMapping = { ...this.originalMapping };
            
            // Re-render la liste
            this.renderMappingList();
            
            // Mettre à jour le statut
            this.updateMappingStatus();
            
            // Notifier le changement
            window.dispatchEvent(new CustomEvent('mappingUpdated', {
                detail: this.originalMapping
            }));

            alert('Personnalisations supprimées ! Rechargez la page pour voir les changements.');
        }
    }

    closeMappingModal() {
        document.getElementById('mappingModal').classList.remove('active');
    }
}
