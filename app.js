/**
 * Configuration Constants
 */
const NIKKE_CONFIG = {
    ASPECT_RATIO: 9 / 16,
    CROP: {
        BASE_Y: 0.1875,      // H * 0.1875
        FULL_HEIGHT: 1 / 3,  // H / 3
        CHAR_HEIGHT: 0.296875, // H * 0.296875
        SPACE_RATIO: 35 / 1080,
        CARD_RATIO: 174 / 1080,
        CROP_W_RATIO: 209 / 1080
    },
    MATCHING: {
        SHIFT: 4,
        SAMPLE_COUNT: 5
    },
    UI: {
        DISPLAY_HEIGHT_LIMIT: 0.7
    }
};

/**
 * Settings Management
 */
class SettingsManager {
    static CHAR_KEY = 'nikke_cropper_charYOffset';
    static NAME_KEY = 'nikke_cropper_nameYOffset';
    static OLD_KEY = 'nikke_cropper_yOffset';

    static load() {
        let charOffset = localStorage.getItem(this.CHAR_KEY);
        let nameOffset = localStorage.getItem(this.NAME_KEY);

        // 互換性チェック: 古いキーがある場合は charOffset として扱う
        if (charOffset === null) {
            const old = localStorage.getItem(this.OLD_KEY);
            charOffset = old !== null ? old : 0;
        }

        return {
            charYOffset: parseInt(charOffset, 10) || 0,
            nameYOffset: parseInt(nameOffset, 10) || 0
        };
    }

    static save(charY, nameY) {
        localStorage.setItem(this.CHAR_KEY, charY);
        localStorage.setItem(this.NAME_KEY, nameY);
    }
}

/**
 * Image Comparison and Mapping Logic
 */
class ImageMatcher {
    static findBestMapping(refs, currents) {
        const mapping = [];
        const count = NIKKE_CONFIG.MATCHING.SAMPLE_COUNT;
        const availableSources = Array.from({ length: count }, (_, i) => i);

        for (let r = 0; r < count; r++) {
            let minDiff = Infinity;
            let bestIdxIdx = -1;

            for (let i = 0; i < availableSources.length; i++) {
                const s = availableSources[i];
                const diff = this.calculateImageDiff(refs[r], currents[s]);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestIdxIdx = i;
                }
            }
            mapping[r] = availableSources[bestIdxIdx];
            availableSources.splice(bestIdxIdx, 1);
        }
        return mapping;
    }

    static calculateImageDiff(data1, data2) {
        const d1 = data1.data;
        const d2 = data2.data;
        const w = data1.width;
        const h = data1.height;
        const len = w * h;
        const SHIFT = NIKKE_CONFIG.MATCHING.SHIFT;

        // グレースケール変換を高速化
        const g1 = new Uint8Array(len);
        const g2 = new Uint8Array(len);
        let s1 = 0, s2 = 0;
        for (let i = 0; i < len; i++) {
            const i4 = i * 4;
            // 輝度（Luma）に近い重み付けでグレースケール化
            const v1 = (d1[i4] * 0.299 + d1[i4 + 1] * 0.587 + d1[i4 + 2] * 0.114) | 0;
            const v2 = (d2[i4] * 0.299 + d2[i4 + 1] * 0.587 + d2[i4 + 2] * 0.114) | 0;
            g1[i] = v1;
            g2[i] = v2;
            s1 += v1;
            s2 += v2;
        }

        const m1 = s1 / len;
        const m2 = s2 / len;

        let bestNcc = -1;

        for (let dy = -SHIFT; dy <= SHIFT; dy++) {
            for (let dx = -SHIFT; dx <= SHIFT; dx++) {
                let num = 0, den1 = 0, den2 = 0;
                for (let y = 0; y < h; y++) {
                    const y2 = Math.max(0, Math.min(h - 1, y + dy));
                    const row1 = y * w;
                    const row2 = y2 * w;
                    for (let x = 0; x < w; x++) {
                        const x2 = Math.max(0, Math.min(w - 1, x + dx));
                        const v1 = g1[row1 + x] - m1;
                        const v2 = g2[row2 + x2] - m2;
                        num += v1 * v2;
                        den1 += v1 * v1;
                        den2 += v2 * v2;
                    }
                }
                const ncc = num / (Math.sqrt(den1 * den2) + 1e-6);
                if (ncc > bestNcc) bestNcc = ncc;
            }
        }

        return 1 - bestNcc;
    }
}

/**
 * Image Processing and Coordinate Calculations
 */
class ImageProcessor {
    constructor() {
        this.helperCanvas = document.createElement('canvas');
        this.helperCtx = this.helperCanvas.getContext('2d');
        this.resultCanvas = document.createElement('canvas');
        this.resultCtx = this.resultCanvas.getContext('2d');
    }

    static getSafeAreaTop() {
        const div = document.createElement('div');
        div.style.paddingTop = 'env(safe-area-inset-top)';
        div.style.position = 'fixed';
        div.style.top = '0';
        div.style.visibility = 'hidden';
        document.body.appendChild(div);
        const insetTop = parseInt(window.getComputedStyle(div).paddingTop, 10) || 0;
        document.body.removeChild(div);
        return insetTop;
    }

    static getAutoDeadZoneOffset(img) {
        const dpr = window.devicePixelRatio || 1;
        const physicalScreenWidth = Math.round(window.screen.width * dpr);
        const physicalScreenHeight = Math.round(window.screen.height * dpr);

        const isSameDevice = (img.width === physicalScreenWidth && img.height === physicalScreenHeight) ||
                             (img.width === physicalScreenHeight && img.height === physicalScreenWidth);

        if (isSameDevice) {
            return this.getSafeAreaTop() * dpr;
        }
        return 0;
    }

    static calculateSafeSize(img) {
        const imageW = img.width;
        const imageH = img.height;
        const targetRatio = NIKKE_CONFIG.ASPECT_RATIO;
        const imageRatio = imageW / imageH;

        let W, H, offsetX, offsetY;
        if (imageRatio > targetRatio) {
            H = imageH;
            W = H * targetRatio;
            offsetX = (imageW - W) / 2;
            offsetY = 0;
        } else {
            W = imageW;
            H = W / targetRatio;
            offsetX = 0;
            offsetY = (imageH - H) / 2;
        }
        return { W, H, offsetX, offsetY };
    }

    extractNames(img, nameY_Base, charHeight, nameAreaHeight) {
        const imgNames = [];
        const { W: imgW, offsetX: imgOffX } = ImageProcessor.calculateSafeSize(img);
        
        const { SPACE_RATIO, CARD_RATIO, CROP_W_RATIO } = NIKKE_CONFIG.CROP;
        const cropWidth = imgW * CROP_W_RATIO;

        for (let i = 0; i < NIKKE_CONFIG.MATCHING.SAMPLE_COUNT; i++) {
            const cardX = imgOffX + (imgW * SPACE_RATIO) + i * (imgW * CARD_RATIO + imgW * SPACE_RATIO);
            const charX = cardX - (imgW * SPACE_RATIO / 2);
            
            // 名前エリアの切り抜き。nameY_Base は名前解析枠の上端
            const nH = nameAreaHeight - (charHeight * 0.75);
            
            this.helperCanvas.width = cropWidth;
            this.helperCanvas.height = nH;
            this.helperCtx.drawImage(img, charX, nameY_Base, cropWidth, nH, 0, 0, cropWidth, nH);
            imgNames.push(this.helperCtx.getImageData(0, 0, cropWidth, nH));
        }
        return imgNames;
    }

    calculateMappings(images, charYOffset, nameYOffset) {
        if (images.length === 0) return [];

        const { H } = ImageProcessor.calculateSafeSize(images[0]);
        const deadZoneOffset = ImageProcessor.getAutoDeadZoneOffset(images[0]);
        const { BASE_Y, CHAR_HEIGHT, FULL_HEIGHT } = NIKKE_CONFIG.CROP;

        const charHeight = H * CHAR_HEIGHT;
        const nameAreaHeight = H * FULL_HEIGHT;
        // 名前解析用の Y 座標。ベース位置 + デッドゾーン + 名前枠用個別オフセット + (キャラ枠内での名前開始位置の比率)
        const nameY_Base = (H * BASE_Y) + deadZoneOffset + nameYOffset + (charHeight * 0.75);

        const referenceNames = this.extractNames(images[0], nameY_Base, charHeight, nameAreaHeight);

        return images.map(img => {
            const currentNames = this.extractNames(img, nameY_Base, charHeight, nameAreaHeight);
            return ImageMatcher.findBestMapping(referenceNames, currentNames);
        });
    }

    combineImages(images, mappings, charYOffset) {
        if (images.length === 0 || mappings.length === 0) return null;

        const { W, H } = ImageProcessor.calculateSafeSize(images[0]);
        const deadZoneOffset = ImageProcessor.getAutoDeadZoneOffset(images[0]);
        const { BASE_Y, CHAR_HEIGHT, SPACE_RATIO, CARD_RATIO, CROP_W_RATIO } = NIKKE_CONFIG.CROP;

        const charY_Base = (H * BASE_Y) + deadZoneOffset + charYOffset;
        const charHeight = H * CHAR_HEIGHT;
        const cropWidth = W * CROP_W_RATIO;

        const targetWidth = cropWidth * NIKKE_CONFIG.MATCHING.SAMPLE_COUNT;
        const targetHeight = charHeight * images.length;

        if (this.resultCanvas.width !== targetWidth || this.resultCanvas.height !== targetHeight) {
            this.resultCanvas.width = targetWidth;
            this.resultCanvas.height = targetHeight;
        } else {
            this.resultCtx.clearRect(0, 0, targetWidth, targetHeight);
        }

        images.forEach((img, rowIndex) => {
            const mapping = mappings[rowIndex];

            for (let targetIdx = 0; targetIdx < NIKKE_CONFIG.MATCHING.SAMPLE_COUNT; targetIdx++) {
                const sourceIdx = mapping[targetIdx];
                const { W: imgW, offsetX: imgOffX } = ImageProcessor.calculateSafeSize(img);
                
                const cardX = imgOffX + (imgW * SPACE_RATIO) + sourceIdx * (imgW * CARD_RATIO + imgW * SPACE_RATIO);
                const charX = cardX - (imgW * SPACE_RATIO / 2);
                
                const destX = targetIdx * cropWidth;
                const destY = rowIndex * charHeight;

                this.resultCtx.drawImage(img, charX, charY_Base, cropWidth, charHeight, destX, destY, cropWidth, charHeight);
            }
        });

        return this.resultCanvas.toDataURL('image/png');
    }
}

/**
 * UI State and Event Management
 */
class UIManager {
    constructor(app) {
        this.app = app;
        this.isDragging = false;
        this.startY = 0;
        this.initialYOffset = 0;
        this.rafId = null;

        this.initElements();
        this.initEvents();
    }

    initElements() {
        this.imageInput = document.getElementById('imageInput');
        this.toggleAdjustBtn = document.getElementById('toggleAdjustBtn');
        this.resetAdjustBtn = document.getElementById('resetAdjustBtn');
        this.settingsPanel = document.getElementById('settingsPanel');
        this.adjustmentWrapper = document.getElementById('adjustmentWrapper');
        this.adjustmentCanvas = document.getElementById('adjustmentCanvas');
        this.cropOverlay = document.getElementById('cropOverlay');
        this.charYOffsetInput = document.getElementById('charYOffset');
        this.nameYOffsetInput = document.getElementById('nameYOffset');
        this.previewContainer = document.getElementById('previewContainer');
        this.adjustModeRadios = document.getElementsByName('adjustMode');
    }

    initEvents() {
        this.imageInput.addEventListener('change', (e) => this.app.handleImageUpload(e.target.files));
        this.toggleAdjustBtn.addEventListener('click', () => this.toggleSettings());
        this.resetAdjustBtn.addEventListener('click', () => this.app.resetAdjustment());

        this.adjustmentWrapper.addEventListener('mousedown', (e) => this.startDrag(e));
        this.adjustmentWrapper.addEventListener('touchstart', (e) => this.startDrag(e), { passive: false });
        window.addEventListener('mousemove', (e) => this.drag(e));
        window.addEventListener('touchmove', (e) => this.drag(e), { passive: false });
        window.addEventListener('mouseup', () => this.endDrag());
        window.addEventListener('touchend', () => this.endDrag());

        this.adjustModeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.updateAdjustmentPreview());
        });
    }

    get activeMode() {
        return Array.from(this.adjustModeRadios).find(r => r.checked)?.value || 'character';
    }

    toggleSettings() {
        const isHidden = this.settingsPanel.classList.toggle('hidden');
        this.toggleAdjustBtn.textContent = isHidden ? '位置調整を表示' : '位置調整を隠す';
        if (!isHidden) {
            this.updateAdjustmentPreview();
        }
    }

    startDrag(e) {
        if (this.app.loadedImages.length === 0) return;
        this.isDragging = true;
        this.startY = e.clientY || e.touches[0].clientY;
        
        const mode = this.activeMode;
        this.initialYOffset = parseInt(mode === 'character' ? this.charYOffsetInput.value : this.nameYOffsetInput.value, 10);
        
        if (e.type === 'touchstart') e.preventDefault();
    }

    drag(e) {
        if (!this.isDragging) return;
        const currentY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
        const deltaY = currentY - this.startY;

        const img = this.app.loadedImages[0];
        const displayHeightLimit = NIKKE_CONFIG.UI.DISPLAY_HEIGHT_LIMIT;
        const scale = (img.height * displayHeightLimit) / this.adjustmentCanvas.clientHeight;
        
        const newOffset = this.initialYOffset + (deltaY * scale);
        
        if (this.activeMode === 'character') {
            this.charYOffsetInput.value = Math.round(newOffset);
        } else {
            this.nameYOffsetInput.value = Math.round(newOffset);
        }
        
        this.app.saveSettings();

        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame(() => {
            this.updateAdjustmentPreview();
            this.app.render();
        });

        if (e.type === 'touchmove') e.preventDefault();
    }

    endDrag() {
        if (!this.isDragging) return;
        this.isDragging = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        
        // 名前枠の調整終了時のみマッピングを再計算
        if (this.activeMode === 'name') {
            this.app.recalculateMappings();
        }
    }

    updateAdjustmentPreview() {
        const images = this.app.loadedImages;
        if (images.length === 0) return;

        const img = images[0];
        const displayHeightLimit = NIKKE_CONFIG.UI.DISPLAY_HEIGHT_LIMIT;
        const ctx = this.adjustmentCanvas.getContext('2d');
        
        this.adjustmentCanvas.width = img.width;
        this.adjustmentCanvas.height = img.height * displayHeightLimit;
        ctx.drawImage(img, 0, 0, img.width, img.height * displayHeightLimit, 0, 0, this.adjustmentCanvas.width, this.adjustmentCanvas.height);

        const { W, H, offsetX } = ImageProcessor.calculateSafeSize(img);
        const deadZoneOffset = ImageProcessor.getAutoDeadZoneOffset(img);

        const charYOffset = parseInt(this.charYOffsetInput.value, 10);
        const nameYOffset = parseInt(this.nameYOffsetInput.value, 10);

        const { BASE_Y, CHAR_HEIGHT, FULL_HEIGHT, SPACE_RATIO, CARD_RATIO, CROP_W_RATIO } = NIKKE_CONFIG.CROP;

        const charY_Base = (H * BASE_Y) + deadZoneOffset + charYOffset;
        const charHeight = H * CHAR_HEIGHT;
        const nameAreaHeight = H * FULL_HEIGHT;
        const nameY_Base = (H * BASE_Y) + deadZoneOffset + nameYOffset + (charHeight * 0.75);
        const nameHeight = nameAreaHeight - (charHeight * 0.75);
        
        const space = W * SPACE_RATIO;
        const cardWidth = W * CARD_RATIO;
        const cropWidth = W * CROP_W_RATIO;

        const toPercentX = (val) => (val / img.width) * 100;
        const toPercentY = (val) => (val / (img.height * displayHeightLimit)) * 100;

        const firstCharX = (offsetX + space) - (space / 2);
        const mode = this.activeMode;

        // キャラ枠オーバーレイ
        this.cropOverlay.style.left = toPercentX(firstCharX) + '%';
        this.cropOverlay.style.top = toPercentY(charY_Base) + '%';
        this.cropOverlay.style.width = toPercentX(cropWidth * NIKKE_CONFIG.MATCHING.SAMPLE_COUNT) + '%';
        this.cropOverlay.style.height = toPercentY(charHeight) + '%';
        this.cropOverlay.classList.toggle('active', mode === 'character');

        // 名前枠オーバーレイ（新規追加）
        let nameOverlay = document.getElementById('nameCropOverlay');
        if (!nameOverlay) {
            nameOverlay = document.createElement('div');
            nameOverlay.id = 'nameCropOverlay';
            nameOverlay.className = 'name-crop-overlay';
            this.adjustmentWrapper.appendChild(nameOverlay);
        }
        nameOverlay.style.left = toPercentX(firstCharX) + '%';
        nameOverlay.style.top = toPercentY(nameY_Base) + '%';
        nameOverlay.style.width = toPercentX(cropWidth * NIKKE_CONFIG.MATCHING.SAMPLE_COUNT) + '%';
        nameOverlay.style.height = toPercentY(nameHeight) + '%';
        nameOverlay.classList.toggle('active', mode === 'name');

        const existingFrames = this.adjustmentWrapper.querySelectorAll('.crop-frame, .name-crop-frame');
        existingFrames.forEach(f => f.remove());

        for(let i=0; i<NIKKE_CONFIG.MATCHING.SAMPLE_COUNT; i++) {
            const cardX = offsetX + space + i * (cardWidth + space);
            const charX = cardX - (space / 2);

            // キャラ枠
            const frame = document.createElement('div');
            frame.className = 'crop-frame';
            frame.style.left = toPercentX(charX) + '%';
            frame.style.top = toPercentY(charY_Base) + '%';
            frame.style.width = toPercentX(cropWidth) + '%';
            frame.style.height = toPercentY(charHeight) + '%';
            this.adjustmentWrapper.appendChild(frame);

            // 名前枠
            const nameFrame = document.createElement('div');
            nameFrame.className = 'name-crop-frame';
            nameFrame.style.left = toPercentX(charX) + '%';
            nameFrame.style.top = toPercentY(nameY_Base) + '%';
            nameFrame.style.width = toPercentX(cropWidth) + '%';
            nameFrame.style.height = toPercentY(nameHeight) + '%';
            this.adjustmentWrapper.appendChild(nameFrame);
        }
    }

    displayResults(imgURL) {
        this.previewContainer.innerHTML = '';
        if (!imgURL) return;

        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item combined-result';
        const previewImg = document.createElement('img');
        previewImg.src = imgURL;
        previewImg.style.maxWidth = '100%';
        previewItem.appendChild(previewImg);
        previewItem.onclick = () => this.downloadImage(imgURL, `nikke_sorted_combined.png`);
        this.previewContainer.appendChild(previewItem);
    }

    showLoading() {
        this.previewContainer.innerHTML = '<p>処理中...</p>';
        this.toggleAdjustBtn.style.display = 'inline-block';
    }

    showError() {
        this.previewContainer.innerHTML = '<p>エラーが発生しました。</p>';
    }

    downloadImage(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

/**
 * Main Application Controller
 */
class App {
    constructor() {
        this.loadedImages = [];
        this.imageMappings = []; // キャッシュされたマッピング
        this.processor = new ImageProcessor();
        this.ui = new UIManager(this);

        this.init();
    }

    init() {
        const settings = SettingsManager.load();
        this.ui.charYOffsetInput.value = settings.charYOffset;
        this.ui.nameYOffsetInput.value = settings.nameYOffset;
    }

    async handleImageUpload(files) {
        if (!files.length) return;

        this.ui.showLoading();

        try {
            this.loadedImages = await Promise.all(Array.from(files).map(file => this.loadImage(file)));
            this.recalculateMappings();
            this.ui.updateAdjustmentPreview();
            this.render();
        } catch (error) {
            console.error('画像の読み込みに失敗しました:', error);
            this.ui.showError();
        }
    }

    recalculateMappings() {
        const charY = parseInt(this.ui.charYOffsetInput.value, 10);
        const nameY = parseInt(this.ui.nameYOffsetInput.value, 10);
        this.imageMappings = this.processor.calculateMappings(this.loadedImages, charY, nameY);
    }

    loadImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    resetAdjustment() {
        this.ui.charYOffsetInput.value = 0;
        this.ui.nameYOffsetInput.value = 0;
        this.saveSettings();
        this.recalculateMappings();
        this.ui.updateAdjustmentPreview();
        this.render();
    }

    saveSettings() {
        const charY = this.ui.charYOffsetInput.value;
        const nameY = this.ui.nameYOffsetInput.value;
        SettingsManager.save(charY, nameY);
    }

    render() {
        if (this.loadedImages.length === 0) return;
        const charY = parseInt(this.ui.charYOffsetInput.value, 10);
        const resultURL = this.processor.combineImages(this.loadedImages, this.imageMappings, charY);
        this.ui.displayResults(resultURL);
    }
}

// アプリの起動
window.addEventListener('DOMContentLoaded', () => {
    new App();
});
