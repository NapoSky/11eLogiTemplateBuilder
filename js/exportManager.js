// Gestion de l'export PNG
export class ExportManager {
    constructor() {
        this.canvas = document.getElementById('canvas');
    }

    async exportToPNG() {
        try {
            const tempCanvas = await this.createExportCanvas();
            const link = document.createElement('a');
            link.download = `foxhole-template-${Date.now()}.png`;
            link.href = tempCanvas.toDataURL('image/png');
            link.click();
        } catch (error) {
            console.error('Erreur lors de l\'export PNG:', error);
            alert('Erreur lors de l\'export. Veuillez réessayer.');
        }
    }

    async createExportCanvas() {
        const exportWidth = 1920;
        const exportHeight = 1080;
        const scale = 2; // Pour une meilleure qualité
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = exportWidth * scale;
        tempCanvas.height = exportHeight * scale;
        const ctx = tempCanvas.getContext('2d');
        
        // Mise à l'échelle pour une meilleure qualité
        ctx.scale(scale, scale);
        
        // Fond dégradé
        const gradient = ctx.createLinearGradient(0, 0, 0, exportHeight);
        gradient.addColorStop(0, '#1a1a1a');
        gradient.addColorStop(1, '#0f0f0f');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, exportWidth, exportHeight);
        
        // Titre et sous-titre
        await this.drawTitle(ctx, exportWidth);
        
        // Dessiner les sections
        await this.drawSections(ctx);
        
        // Dessiner les icônes
        await this.drawIcons(ctx);
        
        // Logo et décorations
        await this.drawDecorations(ctx, exportWidth, exportHeight);
        
        return tempCanvas;
    }

    async drawTitle(ctx, width) {
        const titleInput = document.getElementById('titleInput');
        const subtitleInput = document.getElementById('subtitleInput');
        
        // Titre principal
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(titleInput.value || '11eRC-FL Stockpile Template', width / 2, 80);
        
        // Sous-titre
        ctx.fillStyle = '#cccccc';
        ctx.font = '24px Arial, sans-serif';
        ctx.fillText(subtitleInput.value || 'Template de stockage logistique', width / 2, 120);
        
        // Ligne de séparation
        ctx.strokeStyle = '#ff6b35';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(width / 2 - 300, 140);
        ctx.lineTo(width / 2 + 300, 140);
        ctx.stroke();
    }

    async drawSections(ctx) {
        const sections = document.querySelectorAll('.section');
        
        for (const section of sections) {
            const rect = section.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();
            
            const x = rect.left - canvasRect.left;
            const y = rect.top - canvasRect.top + 160; // Offset pour le titre
            const width = rect.width;
            const height = rect.height;
            
            const header = section.querySelector('.section-header');
            const headerText = header.textContent.replace('✏️', '').replace('×', '').trim();
            const color = this.extractSectionColor(section);
            
            // Fond de la section avec transparence
            ctx.fillStyle = this.hexToRgba(color, 0.1);
            ctx.fillRect(x, y, width, height);
            
            // Bordure de la section
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.strokeRect(x, y, width, height);
            
            // Header de la section
            ctx.fillStyle = color;
            ctx.fillRect(x, y, width, 50);
            
            // Texte du header
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(headerText, x + 15, y + 32);
        }
    }

    async drawIcons(ctx) {
        const icons = document.querySelectorAll('.canvas-icon');
        
        for (const icon of icons) {
            const img = icon.querySelector('img');
            const quantityBadge = icon.querySelector('.quantity-badge');
            
            const rect = icon.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();
            
            const x = rect.left - canvasRect.left;
            const y = rect.top - canvasRect.top + 160; // Offset pour le titre
            
            // Charger et dessiner l'image
            const image = await this.loadImage(img.src);
            ctx.drawImage(image, x, y, 64, 64);
            
            // Badge de quantité
            const quantity = quantityBadge.textContent;
            if (quantity && quantity !== '1') {
                // Cercle du badge
                ctx.fillStyle = '#ff6b35';
                ctx.beginPath();
                ctx.arc(x + 56, y + 8, 12, 0, 2 * Math.PI);
                ctx.fill();
                
                // Bordure blanche
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Texte du badge
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 12px Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(quantity, x + 56, y + 13);
            }
        }
    }

    async drawDecorations(ctx, width, height) {
        // Lignes décoratives
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        
        // Lignes horizontales
        for (let i = 200; i < height; i += 100) {
            ctx.beginPath();
            ctx.moveTo(50, i);
            ctx.lineTo(width - 50, i);
            ctx.stroke();
        }
        
        // Lignes verticales
        for (let i = 100; i < width; i += 100) {
            ctx.beginPath();
            ctx.moveTo(i, 180);
            ctx.lineTo(i, height - 50);
            ctx.stroke();
        }
        
        // Réinitialiser le style de ligne
        ctx.setLineDash([]);
        
        // Footer
        ctx.fillStyle = '#666666';
        ctx.font = '16px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Généré le ${new Date().toLocaleDateString('fr-FR')} - 11eRC-FL Template Builder`, width / 2, height - 30);
    }

    extractSectionColor(sectionElement) {
        const style = sectionElement.style.border;
        const colorMap = {
            'blue': '#007bff',
            'red': '#dc3545',
            'green': '#28a745',
            'orange': '#fd7e14',
            'purple': '#6f42c1',
            'pink': '#e83e8c',
            'gray': '#6c757d',
            'yellow': '#ffc107'
        };
        
        for (const [name, hex] of Object.entries(colorMap)) {
            if (style.includes(`--${name}`)) {
                return hex;
            }
        }
        
        return '#007bff'; // Couleur par défaut
    }

    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }
}
