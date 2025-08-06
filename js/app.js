// Application principale - orchestre tous les modules
import { iconCategories, iconFiles, subtypeFiles, loadSubtypeMapping } from './config.js';
import { IconManager } from './iconManager.js';
import { DragDropManager } from './dragDropManager.js';
import { SectionManager } from './sectionManager.js';
import { TemplateManager } from './templateManager.js';
import { MappingManager } from './mappingManager.js';

class FoxholeTemplateBuilder {
    constructor() {
        this.dragDropManager = new DragDropManager();
        this.sectionManager = new SectionManager(this.dragDropManager);
        this.iconManager = new IconManager(this.dragDropManager, this.sectionManager);
        this.templateManager = new TemplateManager(this.iconManager, this.sectionManager);
        this.mappingManager = new MappingManager();
        
        // Maintenant configurer dragDropManager avec iconManager
        this.dragDropManager.iconManager = this.iconManager;
        
        this.init();
    }

    init() {
        console.log('Initialisation de l\'application...');
        this.setupEventListeners();
        
        // Initialiser la drop-zone
        this.sectionManager.updateDropZoneVisibility();
        
        // Délai pour s'assurer que le DOM est prêt
        setTimeout(async () => {
            await loadSubtypeMapping();
            this.iconManager.loadIcons();
            this.setupPredefinedTemplates();
        }, 100);
    }

    setupEventListeners() {
        // Boutons de la toolbar
        document.getElementById('clearCanvas').addEventListener('click', () => {
            this.templateManager.clearCanvas();
        });

        document.getElementById('addSection').addEventListener('click', () => {
            this.showSectionModal();
        });

        document.getElementById('saveTemplate').addEventListener('click', () => {
            this.templateManager.saveTemplate();
        });

        document.getElementById('exportTemplate').addEventListener('click', () => {
            this.templateManager.exportToPNG();
        });

        // Chargement de template
        document.getElementById('loadTemplate').addEventListener('click', () => {
            // Créer un input file dynamiquement
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.templateManager.loadTemplate(file);
                }
            };
            input.click();
        });

        // Recherche d'icônes
        document.getElementById('searchIcons').addEventListener('input', (e) => {
            this.iconManager.filterIcons(e.target.value);
        });

        // Boutons de catégorie d'icônes
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Retirer la classe active de tous les boutons
                document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                // Ajouter la classe active au bouton cliqué
                e.target.classList.add('active');
                
                const category = e.target.dataset.category;
                this.iconManager.filterByCategory(category);
            });
        });

        // Templates prédéfinis
        document.getElementById('loadPreset').addEventListener('click', () => {
            this.showPresetModal();
        });

        // Éditeur de mapping
        document.getElementById('editMapping').addEventListener('click', () => {
            this.mappingManager.showMappingModal();
        });

        // Gestion des modales
        this.setupModalEvents();
    }

    showPresetModal() {
        document.getElementById('presetModal').classList.add('active');
    }

    showSectionModal() {
        document.getElementById('sectionModal').classList.add('active');
        document.getElementById('sectionName').focus();
    }

    confirmQuantity() {
        const newQuantity = parseInt(document.getElementById('itemQuantity').value) || 1;
        const newSubtype = document.getElementById('itemSubtype').value || null;
        
        if (this.currentItemElement && this.currentQuantityBadge) {
            if (newQuantity <= 0) {
                // Supprimer l'icône
                this.currentItemElement.remove();
            } else {
                // Mettre à jour la quantité
                this.currentQuantityBadge.textContent = newQuantity;
                
                // Mettre à jour le subtype
                const oldSubtype = this.currentItemElement.dataset.subtype;
                
                if (newSubtype) {
                    this.currentItemElement.dataset.subtype = newSubtype;
                    
                    // Ajouter ou mettre à jour l'icône de subtype
                    let subtypeImg = this.currentItemElement.querySelector('.subtype-icon');
                    if (subtypeImg) {
                        subtypeImg.src = `assets/icons/subtypes/${newSubtype}`;
                    } else {
                        subtypeImg = document.createElement('img');
                        subtypeImg.src = `assets/icons/subtypes/${newSubtype}`;
                        subtypeImg.alt = newSubtype;
                        subtypeImg.className = 'subtype-icon';
                        subtypeImg.style.cssText = `
                            position: absolute;
                            top: 2px;
                            left: 2px;
                            width: 20px;
                            height: 20px;
                            object-fit: contain;
                            pointer-events: none;
                            z-index: 500;
                            border-radius: 2px;
                            background: rgba(255, 255, 255, 0.8);
                            padding: 1px;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                        `;
                        this.currentItemElement.appendChild(subtypeImg);
                    }
                } else {
                    // Supprimer le subtype s'il n'y en a plus
                    delete this.currentItemElement.dataset.subtype;
                    const subtypeImg = this.currentItemElement.querySelector('.subtype-icon');
                    if (subtypeImg) {
                        subtypeImg.remove();
                    }
                }
            }
        }
        
        document.getElementById('quantityModal').classList.remove('active');
        
        // Réinitialiser la preview
        const preview = document.getElementById('subtypePreviewContainer');
        if (preview) {
            preview.classList.add('hidden');
        }
        
        this.currentItemElement = null;
        this.currentQuantityBadge = null;
    }

    setupModalEvents() {
        // Modal de section
        const sectionModal = document.getElementById('sectionModal');
        const quantityModal = document.getElementById('quantityModal');
        const presetModal = document.getElementById('presetModal');
        const mappingModal = document.getElementById('mappingModal');

        // Fermeture des modales
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.remove('active');
            });
        });

        // Clic en dehors de la modale
        [sectionModal, quantityModal, presetModal, mappingModal].forEach(modal => {
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        modal.classList.remove('active');
                    }
                });
            }
        });

        // Boutons de confirmation
        const confirmSection = document.getElementById('confirmSection');
        if (confirmSection) {
            confirmSection.addEventListener('click', () => {
                this.sectionManager.createSection();
            });
        }

        const confirmQuantity = document.getElementById('confirmQuantity');
        if (confirmQuantity) {
            confirmQuantity.addEventListener('click', () => {
                this.confirmQuantity();
            });
        }
        
        // Boutons d'annulation
        const cancelSection = document.getElementById('cancelSection');
        if (cancelSection) {
            cancelSection.addEventListener('click', () => {
                sectionModal.classList.remove('active');
            });
        }

        const cancelQuantity = document.getElementById('cancelQuantity');
        if (cancelQuantity) {
            cancelQuantity.addEventListener('click', () => {
                quantityModal.classList.remove('active');
                
                // Réinitialiser la preview
                const preview = document.getElementById('subtypePreviewContainer');
                if (preview) {
                    preview.classList.add('hidden');
                }
                
                // Réinitialiser les éléments courants
                this.currentItemElement = null;
                this.currentQuantityBadge = null;
            });
        }

        const cancelPreset = document.getElementById('cancelPreset');
        if (cancelPreset) {
            cancelPreset.addEventListener('click', () => {
                presetModal.classList.remove('active');
            });
        }

        // Boutons de la modale de mapping
        const saveMapping = document.getElementById('saveMapping');
        if (saveMapping) {
            saveMapping.addEventListener('click', () => {
                this.mappingManager.saveMapping();
            });
        }

        const downloadMapping = document.getElementById('downloadMapping');
        if (downloadMapping) {
            downloadMapping.addEventListener('click', () => {
                this.mappingManager.downloadMapping();
            });
        }

        const cancelMapping = document.getElementById('cancelMapping');
        if (cancelMapping) {
            cancelMapping.addEventListener('click', () => {
                mappingModal.classList.remove('active');
            });
        }

        const resetMapping = document.getElementById('resetMapping');
        if (resetMapping) {
            resetMapping.addEventListener('click', () => {
                this.mappingManager.resetMapping();
            });
        }
    }

    setupPredefinedTemplates() {
        // Gérer les boutons des templates prédéfinis dans la modale
        document.querySelectorAll('.preset-item').forEach(item => {
            item.addEventListener('click', () => {
                const presetType = item.dataset.preset;
                this.templateManager.loadPredefinedTemplate(presetType);
                document.getElementById('presetModal').classList.remove('active');
            });
        });

        // Gérer la fermeture de la modale
        document.querySelectorAll('.modal-close, #cancelPreset').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('presetModal').classList.remove('active');
            });
        });
    }
}

// Initialiser l'application quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
    window.app = new FoxholeTemplateBuilder();
});
