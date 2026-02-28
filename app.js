document.getElementById('imageInput').addEventListener('change', handleImageUpload);

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            processImage(img);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function processImage(img) {
    const previewContainer = document.getElementById('previewContainer');
    previewContainer.innerHTML = ''; // Clear existing previews

    const imageW = img.width;
    const imageH = img.height;
    const targetRatio = 9 / 16;
    const imageRatio = imageW / imageH;

    let W, H, offsetX, offsetY;

    if (imageRatio > targetRatio) {
        // Wider than 9:16 (letterboxed horizontally)
        H = imageH;
        W = H * targetRatio;
        offsetX = (imageW - W) / 2;
        offsetY = 0;
    } else {
        // Taller than 9:16 (letterboxed vertically)
        W = imageW;
        H = W / targetRatio;
        offsetX = 0;
        offsetY = (imageH - H) / 2;
    }

    const charY = offsetY + H * 0.1875;
    const charHeight = H * 0.296875;

    // --- 精密な比率計算 (W=1080, D=209 から算出) ---
    const spaceRatio = 35 / 1080;
    const cardRatio = 174 / 1080;
    const cropRatio = 209 / 1080; // カード幅 + 隙間 1 つ分

    const space = W * spaceRatio;
    const cardWidth = W * cardRatio;
    const cropWidth = W * cropRatio;

    for (let i = 0; i < 5; i++) {
        // カード全体の左端座標を計算
        const cardX = offsetX + space + i * (cardWidth + space);
        // カードの左側の隙間の半分から切り抜きを開始
        const charX = cardX - (space / 2);
        
        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = charHeight;
        const ctx = canvas.getContext('2d');

        // Draw the specific part of the image onto the canvas
        ctx.drawImage(img, charX, charY, cropWidth, charHeight, 0, 0, cropWidth, charHeight);

        // Create a preview item
        const imgURL = canvas.toDataURL('image/png');
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';
        
        const previewImg = document.createElement('img');
        previewImg.src = imgURL;
        previewImg.alt = `Character ${i + 1}`;
        
        previewItem.appendChild(previewImg);
        previewItem.onclick = () => downloadImage(imgURL, `nikke_char_${i + 1}.png`);
        
        previewContainer.appendChild(previewItem);
    }
}

function downloadImage(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
