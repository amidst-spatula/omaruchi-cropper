let loadedImages = [];
let isDragging = false;
let startY = 0;
let initialYOffset = 0;

// 初期化時に保存された設定を読み込む
window.addEventListener('DOMContentLoaded', loadSettings);

document.getElementById('imageInput').addEventListener('change', handleImageUpload);
document.getElementById('toggleAdjustBtn').addEventListener('click', toggleSettings);
document.getElementById('resetAdjustBtn').addEventListener('click', resetAdjustment);

// ドラッグ操作の設定
const wrapper = document.getElementById('adjustmentWrapper');
wrapper.addEventListener('mousedown', startDrag);
wrapper.addEventListener('touchstart', startDrag, { passive: false });
window.addEventListener('mousemove', drag);
window.addEventListener('touchmove', drag, { passive: false });
window.addEventListener('mouseup', endDrag);
window.addEventListener('touchend', endDrag);

/** localStorage から設定を読み込む */
function loadSettings() {
    const savedYOffset = localStorage.getItem('nikke_cropper_yOffset');
    if (savedYOffset !== null) {
        document.getElementById('yOffsetRange').value = savedYOffset;
    }
}

/** localStorage に設定を保存する */
function saveSettings() {
    const yOffset = document.getElementById('yOffsetRange').value;
    localStorage.setItem('nikke_cropper_yOffset', yOffset);
}

function resetAdjustment() {
    document.getElementById('yOffsetRange').value = 0;
    saveSettings();
    updateAdjustmentPreview();
    if (loadedImages.length > 0) combineImages(loadedImages);
}

function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    const btn = document.getElementById('toggleAdjustBtn');
    panel.classList.toggle('hidden');
    btn.textContent = panel.classList.contains('hidden') ? '位置調整を表示' : '位置調整を隠す';
    if (!panel.classList.contains('hidden')) {
        updateAdjustmentPreview();
    }
}

function startDrag(e) {
    if (loadedImages.length === 0) return;
    isDragging = true;
    startY = e.clientY || e.touches[0].clientY;
    initialYOffset = parseInt(document.getElementById('yOffsetRange').value, 10);
    if (e.type === 'touchstart') e.preventDefault();
}

function drag(e) {
    if (!isDragging) return;
    const currentY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
    const deltaY = currentY - startY;

    const canvas = document.getElementById('adjustmentCanvas');
    const img = loadedImages[0];
    const displayHeightLimit = 0.7;
    const scale = (img.height * displayHeightLimit) / canvas.clientHeight;
    
    const newOffset = initialYOffset + (deltaY * scale);
    document.getElementById('yOffsetRange').value = Math.round(newOffset);
    
    saveSettings();
    updateAdjustmentPreview();
    combineImages(loadedImages);

    if (e.type === 'touchmove') e.preventDefault();
}

function endDrag() {
    isDragging = false;
}

async function handleImageUpload(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    const previewContainer = document.getElementById('previewContainer');
    previewContainer.innerHTML = '<p>処理中...</p>';
    document.getElementById('toggleAdjustBtn').style.display = 'inline-block';

    try {
        loadedImages = await Promise.all(files.map(file => {
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
        }));

        updateAdjustmentPreview();
        combineImages(loadedImages);
    } catch (error) {
        console.error('画像の読み込みに失敗しました:', error);
        previewContainer.innerHTML = '<p>エラーが発生しました。</p>';
    }
}

/** ブラウザからセーフエリアのインセット値を取得する */
function getSafeAreaTop() {
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

function updateAdjustmentPreview() {
    if (loadedImages.length === 0) return;

    const img = loadedImages[0];
    const canvas = document.getElementById('adjustmentCanvas');
    const wrapper = document.getElementById('adjustmentWrapper');
    const overlay = document.getElementById('cropOverlay');
    
    const displayHeightLimit = 0.7;
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height * displayHeightLimit;
    ctx.drawImage(img, 0, 0, img.width, img.height * displayHeightLimit, 0, 0, canvas.width, canvas.height);

    const { W, H, offsetX } = calculateSafeSize(img);
    const manualYOffset = parseInt(document.getElementById('yOffsetRange').value, 10);
    
    // デッドゾーン補正を自動取得（モバイルなら値が入り、PCなら0になる）
    const deadZoneOffset = getSafeAreaTop() || (H * 0.045 * (isMobileDevice() ? 1 : 0));

    const charY_Base = (H * 0.1875) + deadZoneOffset + manualYOffset;
    const charHeight = H * 0.296875;
    
    const spaceRatio = 35 / 1080;
    const cardRatio = 174 / 1080;
    const cropRatio = 209 / 1080;
    const space = W * spaceRatio;
    const cardWidth = W * cardRatio;
    const cropWidth = W * cropRatio;

    const toPercentX = (val) => (val / img.width) * 100;
    const toPercentY = (val) => (val / (img.height * displayHeightLimit)) * 100;

    const firstCharX = (offsetX + space) - (space / 2);

    overlay.style.left = toPercentX(firstCharX) + '%';
    overlay.style.top = toPercentY(charY_Base) + '%';
    overlay.style.width = toPercentX(cropWidth * 5) + '%';
    overlay.style.height = toPercentY(charHeight) + '%';

    const existingFrames = wrapper.querySelectorAll('.crop-frame');
    existingFrames.forEach(f => f.remove());

    for(let i=0; i<5; i++) {
        const frame = document.createElement('div');
        frame.className = 'crop-frame';
        const cardX = offsetX + space + i * (cardWidth + space);
        const charX = cardX - (space / 2);
        
        frame.style.left = toPercentX(charX) + '%';
        frame.style.top = toPercentY(charY_Base) + '%';
        frame.style.width = toPercentX(cropWidth) + '%';
        frame.style.height = toPercentY(charHeight) + '%';
        wrapper.appendChild(frame);
    }
}

function isMobileDevice() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function calculateSafeSize(img) {
    const imageW = img.width;
    const imageH = img.height;
    const targetRatio = 9 / 16;
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

function combineImages(images) {
    const previewContainer = document.getElementById('previewContainer');
    previewContainer.innerHTML = '';

    if (images.length === 0) return;

    const { W, H, offsetX } = calculateSafeSize(images[0]);
    const manualYOffset = parseInt(document.getElementById('yOffsetRange').value, 10);
    
    const deadZoneOffset = getSafeAreaTop() || (H * 0.045 * (isMobileDevice() ? 1 : 0));

    const charY_Base = (H * 0.1875) + deadZoneOffset + manualYOffset;
    const charHeight = H * 0.296875;
    const nameAreaHeight = H / 3;

    const spaceRatio = 35 / 1080;
    const cardRatio = 174 / 1080;
    const cropRatio = 209 / 1080;

    const space = W * spaceRatio;
    const cardWidth = W * cardRatio;
    const cropWidth = W * cropRatio;

    const helperCanvas = document.createElement('canvas');
    const helperCtx = helperCanvas.getContext('2d');

    function extractNames(img) {
        const imgNames = [];
        const { W: imgW, H: imgH, offsetX: imgOffX } = calculateSafeSize(img);
        
        for (let i = 0; i < 5; i++) {
            const cardX = imgOffX + (imgW * spaceRatio) + i * (imgW * cardRatio + imgW * spaceRatio);
            const charX = cardX - (imgW * spaceRatio / 2);
            
            const nY = charY_Base + charHeight * 0.75;
            const nH = nameAreaHeight - (charHeight * 0.75);
            
            helperCanvas.width = cropWidth;
            helperCanvas.height = nH;
            helperCtx.drawImage(img, charX, nY, cropWidth, nH, 0, 0, cropWidth, nH);
            imgNames.push(helperCtx.getImageData(0, 0, cropWidth, nH));
        }
        return imgNames;
    }

    const referenceNames = extractNames(images[0]);

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = cropWidth * 5;
    finalCanvas.height = charHeight * images.length;
    const ctx = finalCanvas.getContext('2d');

    images.forEach((img, rowIndex) => {
        const currentNames = extractNames(img);
        const mapping = findBestMapping(referenceNames, currentNames);

        for (let targetIdx = 0; targetIdx < 5; targetIdx++) {
            const sourceIdx = mapping[targetIdx];
            const { W: imgW, H: imgH, offsetX: imgOffX } = calculateSafeSize(img);
            
            const cardX = imgOffX + (imgW * spaceRatio) + sourceIdx * (imgW * cardRatio + imgW * spaceRatio);
            const charX = cardX - (imgW * spaceRatio / 2);
            
            const destX = targetIdx * cropWidth;
            const destY = rowIndex * charHeight;

            ctx.drawImage(img, charX, charY_Base, cropWidth, charHeight, destX, destY, cropWidth, charHeight);
        }
    });

    const imgURL = finalCanvas.toDataURL('image/png');
    const previewItem = document.createElement('div');
    previewItem.className = 'preview-item combined-result';
    const previewImg = document.createElement('img');
    previewImg.src = imgURL;
    previewImg.style.maxWidth = '100%';
    previewItem.appendChild(previewImg);
    previewItem.onclick = () => downloadImage(imgURL, `nikke_sorted_combined.png`);
    previewContainer.appendChild(previewItem);
}

function findBestMapping(refs, currents) {
    const mapping = [];
    const availableSources = [0, 1, 2, 3, 4];

    for (let r = 0; r < 5; r++) {
        let minDiff = Infinity;
        let bestIdxIdx = -1;

        for (let i = 0; i < availableSources.length; i++) {
            const s = availableSources[i];
            const diff = calculateImageDiff(refs[r], currents[s]);
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

function calculateImageDiff(data1, data2) {
    const d1 = data1.data;
    const d2 = data2.data;
    let diff = 0;
    for (let i = 0; i < d1.length; i += 16) {
        const r = Math.abs(d1[i] - d2[i]);
        const g = Math.abs(d1[i+1] - d2[i+1]);
        const b = Math.abs(d1[i+2] - d2[i+2]);
        diff += (r + g + b);
    }
    return diff;
}

function downloadImage(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
