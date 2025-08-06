// Gestionnaire pour les templates (sauvegarde/chargement)
export class TemplateManager {
    constructor(iconManager, sectionManager) {
        this.iconManager = iconManager;
        this.sectionManager = sectionManager;
    }

    saveTemplate() {
        const canvas = document.getElementById('canvas');
        const template = {
            title: document.getElementById('templateTitle').value || 'Mon Template',
            sections: [],
            icons: []
        };

        // Sauvegarder les sections avec leurs icônes
        const sections = canvas.querySelectorAll('.template-section');
        sections.forEach(section => {
            const sectionData = this.sectionManager.getSectionData(section);
            
            // Ajouter les icônes de cette section
            sectionData.icons = [];
            const sectionIcons = section.querySelectorAll('.canvas-icon');
            sectionIcons.forEach(icon => {
                const iconData = this.iconManager.getIconData(icon);
                iconData.inSection = true; // Marquer comme étant dans une section
                sectionData.icons.push(iconData);
            });
            
            template.sections.push(sectionData);
        });

        // Sauvegarder les icônes libres (directement sur le canvas)
        const freeIcons = canvas.querySelectorAll(':scope > .canvas-icon'); // Seulement les enfants directs du canvas
        freeIcons.forEach(icon => {
            const iconData = this.iconManager.getIconData(icon);
            iconData.inSection = false; // Marquer comme libre
            template.icons.push(iconData);
        });

        // Télécharger le template
        const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${template.title.replace(/[^a-z0-9]/gi, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async loadTemplate(file) {
        try {
            const text = await file.text();
            const template = JSON.parse(text);
            
            // Vider le canvas
            this.clearCanvas(false);
            
            // Charger le titre
            if (template.title) {
                document.getElementById('templateTitle').value = template.title;
            }

            // Charger les sections avec leurs icônes
            if (template.sections) {
                template.sections.forEach(sectionData => {
                    const section = this.sectionManager.createSectionFromData(sectionData);
                    
                    // Charger les icônes de cette section
                    if (sectionData.icons && section) {
                        sectionData.icons.forEach(iconData => {
                            this.iconManager.createIconInSection(section, iconData);
                        });
                    }
                });
            }

            // Charger les icônes libres (directement sur le canvas)
            if (template.icons) {
                template.icons.forEach(iconData => {
                    this.iconManager.createIconFromData(iconData);
                });
            }

            console.log('Template chargé avec succès');
        } catch (error) {
            console.error('Erreur lors du chargement du template:', error);
            alert('Erreur lors du chargement du template');
        }
    }

    loadPredefinedTemplate(templateKey) {
        // Import du module config pour accéder aux templates prédéfinis
        import('./config.js').then(({ predefinedTemplates }) => {
            if (predefinedTemplates[templateKey]) {
                this.loadTemplateData(predefinedTemplates[templateKey]);
            }
        });
    }

    loadTemplateData(template) {
        // Vider le canvas
        this.clearCanvas(false);
        
        // Charger le titre
        if (template.title) {
            document.getElementById('templateTitle').value = template.title;
        }

        // Charger les sections avec leurs icônes
        if (template.sections) {
            template.sections.forEach(sectionData => {
                const section = this.sectionManager.createSectionFromData(sectionData);
                
                // Charger les icônes de cette section
                if (sectionData.icons && section) {
                    sectionData.icons.forEach(iconData => {
                        this.iconManager.createIconInSection(section, iconData);
                    });
                }
            });
        }

        // Charger les icônes libres (directement sur le canvas)
        if (template.icons) {
            template.icons.forEach(iconData => {
                this.iconManager.createIconFromData(iconData);
            });
        }
    }

    clearCanvas(askConfirmation = true) {
        if (askConfirmation && !confirm('Êtes-vous sûr de vouloir vider le canvas ?')) {
            return;
        }
        
        const canvas = document.getElementById('canvas');
        const elements = canvas.querySelectorAll('.canvas-icon, .template-section');
        elements.forEach(element => element.remove());
        
        // Réinitialiser le titre
        document.getElementById('templateTitle').value = '';
        
        // Mettre à jour la visibilité de la drop-zone
        this.sectionManager.updateDropZoneVisibility();
    }

    exportToPNG() {
        const canvas = document.getElementById('canvas');
        const title = document.getElementById('templateTitle').value || 'Foxhole Template';
        
        // Créer un canvas temporaire pour l'export
        const exportCanvas = document.createElement('canvas');
        const ctx = exportCanvas.getContext('2d');
        
        // Configuration du canvas d'export
        const exportWidth = 1920;
        const exportHeight = 1080;
        exportCanvas.width = exportWidth;
        exportCanvas.height = exportHeight;
        
        // Fond
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(0, 0, exportWidth, exportHeight);
        
        // Calculer le ratio de mise à l'échelle
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = (exportWidth - 200) / canvasRect.width; // Marge de 100px de chaque côté
        const scaleY = (exportHeight - 200) / canvasRect.height; // Marge de 100px en haut/bas
        const scale = Math.min(scaleX, scaleY, 1); // Ne pas agrandir si c'est déjà grand
        
        const offsetX = (exportWidth - canvasRect.width * scale) / 2;
        const offsetY = 100; // Marge en haut pour le titre
        
        // Titre
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, exportWidth / 2, 60);
        
        // Date
        ctx.font = '24px Arial';
        ctx.textAlign = 'right';
        const now = new Date();
        const dateStr = now.toLocaleDateString('fr-FR');
        ctx.fillText(dateStr, exportWidth - 20, exportHeight - 20);
        
        // Collecter tous les éléments à dessiner
        const elementsToExport = [];
        
        // Sections
        const sections = canvas.querySelectorAll('.template-section');
        sections.forEach(section => {
            const rect = section.getBoundingClientRect();
            const canvasRect2 = canvas.getBoundingClientRect();
            const style = window.getComputedStyle(section);
            
            elementsToExport.push({
                type: 'section',
                x: (rect.left - canvasRect2.left) * scale + offsetX,
                y: (rect.top - canvasRect2.top) * scale + offsetY,
                width: rect.width * scale,
                height: rect.height * scale,
                backgroundColor: style.backgroundColor,
                borderColor: style.borderColor,
                title: section.querySelector('.section-title').value
            });
        });
        
        // Icônes
        const icons = canvas.querySelectorAll('.canvas-icon');
        const iconPromises = Array.from(icons).map(icon => {
            return new Promise((resolve) => {
                const rect = icon.getBoundingClientRect();
                const canvasRect2 = canvas.getBoundingClientRect();
                const img = icon.querySelector('img');
                const quantity = icon.querySelector('.quantity-badge')?.textContent || '';
                
                const iconImg = new Image();
                iconImg.onload = () => {
                    resolve({
                        type: 'icon',
                        x: (rect.left - canvasRect2.left) * scale + offsetX,
                        y: (rect.top - canvasRect2.top) * scale + offsetY,
                        width: rect.width * scale,
                        height: rect.height * scale,
                        image: iconImg,
                        quantity: quantity
                    });
                };
                iconImg.onerror = () => resolve(null);
                iconImg.src = img.src;
            });
        });
        
        // Dessiner tous les éléments
        Promise.all(iconPromises).then(iconElements => {
            // Dessiner les sections d'abord
            elementsToExport.forEach(element => {
                if (element.type === 'section') {
                    // Fond de la section
                    ctx.fillStyle = element.backgroundColor;
                    ctx.fillRect(element.x, element.y, element.width, element.height);
                    
                    // Bordure de la section
                    ctx.strokeStyle = element.borderColor;
                    ctx.lineWidth = 2;
                    ctx.setLineDash([10, 5]);
                    ctx.strokeRect(element.x, element.y, element.width, element.height);
                    ctx.setLineDash([]);
                    
                    // Titre de la section
                    ctx.fillStyle = element.borderColor;
                    ctx.font = `bold ${Math.max(14 * scale, 12)}px Arial`;
                    ctx.textAlign = 'left';
                    ctx.fillText(element.title, element.x + 10, element.y + 25 * scale);
                }
            });
            
            // Dessiner les icônes
            iconElements.forEach(element => {
                if (element && element.type === 'icon') {
                    ctx.drawImage(element.image, element.x, element.y, element.width, element.height);
                    
                    // Badge de quantité
                    if (element.quantity) {
                        const badgeSize = Math.max(20 * scale, 16);
                        ctx.fillStyle = '#ff6b6b';
                        ctx.beginPath();
                        ctx.arc(element.x + element.width - badgeSize/2, element.y + badgeSize/2, badgeSize/2, 0, 2 * Math.PI);
                        ctx.fill();
                        
                        ctx.fillStyle = '#ffffff';
                        ctx.font = `bold ${Math.max(12 * scale, 10)}px Arial`;
                        ctx.textAlign = 'center';
                        ctx.fillText(element.quantity, element.x + element.width - badgeSize/2, element.y + badgeSize/2 + 4);
                    }
                }
            });
            
            // Télécharger l'image
            exportCanvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.png`;
                a.click();
                URL.revokeObjectURL(url);
            }, 'image/png');
        });
    }
}
