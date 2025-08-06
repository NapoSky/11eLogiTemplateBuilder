// Application principale - Template Builder pour Foxhole
import { DragDropManager } from './js/dragDrop.js';
import { SectionManager } from './js/sectionManager.js';
import { IconManager } from './js/iconManager.js';
import { ExportManager } from './js/exportManager.js';
import { TemplateManager } from './js/templateManager.js';

class TemplateBuilderApp {
    constructor() {
        this.dragDropManager = new DragDropManager();
        this.sectionManager = new SectionManager(this.dragDropManager);
        this.iconManager = new IconManager(this.dragDropManager);
        this.exportManager = new ExportManager();
        this.templateManager = new TemplateManager(this.iconManager, this.sectionManager, this.dragDropManager);
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupUI();
        console.log('Template Builder initialisé avec succès !');
    }

    setupEventListeners() {
        // Boutons principaux
        document.getElementById('addSection').addEventListener('click', () => {
            this.sectionManager.addSection();
        });

        document.getElementById('clearCanvas').addEventListener('click', () => {
            this.templateManager.clearCanvas(true);
        });

        document.getElementById('exportPNG').addEventListener('click', () => {
            this.exportManager.exportToPNG();
        });

        // Modal de section
        document.getElementById('submitSection').addEventListener('click', () => {
            const nameInput = document.getElementById('sectionName');
            const colorSelect = document.getElementById('sectionColor');
            this.sectionManager.createSection(nameInput.value, colorSelect.value);
        });

        document.getElementById('cancelSection').addEventListener('click', () => {
            this.sectionManager.closeModal();
        });

        // Fermer la modal en cliquant à l'extérieur
        window.addEventListener('click', (event) => {
            const modal = document.getElementById('sectionModal');
            if (event.target === modal) {
                this.sectionManager.closeModal();
            }
        });

        // Raccourcis clavier
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.sectionManager.closeModal();
            }
        });
    }

    setupUI() {
        // Initialiser les valeurs par défaut
        document.getElementById('titleInput').value = '11eRC-FL Stockpile Template';
        document.getElementById('subtitleInput').value = 'This is the content of Operational Stockpiles that the 11eRC-FL expect for each operation made by the regiment.';
        
        // Afficher un message de bienvenue
        console.log('Interface utilisateur initialisée');
    }
}

// Initialiser l'application quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
    new TemplateBuilderApp();
});
