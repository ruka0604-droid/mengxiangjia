// 梦想家 · 去背景：人物和家具画出来常带一块纯色底，在房间里会显成一个方块。
// 只在四周是同一种颜色时才去，从图片边缘往里擦，碰到线条就停；边缘半透明的那圈把底色褪掉（去掉粉边/白边）。
// 最后把四周空白裁掉，放进房间时不会显得小、也不会悬空。拿不准的情况一律不动原图。

const loadImage = src => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解码失败'));
    image.src = src;
});

function median(values) {
    const sorted = Float32Array.from(values).sort();
    return sorted[sorted.length >> 1] || 0;
}

/**
 * @param {string} dataUrl
 * @param {{keyed?: boolean, hard?: boolean}} options keyed：提示词要求了洋红底，可以放宽；hard：像素风不留半透明边
 * @returns {Promise<{dataUrl: string, cutout: boolean, cutoutNote: string}>}
 */
export async function cleanBackground(dataUrl, { keyed = false, hard = false } = {}) {
    let image;
    try { image = await loadImage(dataUrl); } catch { return { dataUrl, cutout: false, cutoutNote: '' }; }
    const w = image.naturalWidth, h = image.naturalHeight;
    if (!w || !h) return { dataUrl, cutout: false, cutoutNote: '' };
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    c.drawImage(image, 0, 0);
    const pixels = c.getImageData(0, 0, w, h);
    const d = pixels.data;
    const total = w * h;

    const border = [];
    for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
    for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);

    // 已经是透明底：只裁空白
    const clearEdge = border.filter(n => d[n * 4 + 3] < 250).length / border.length;
    if (clearEdge > 0.5) {
        const trimmed = trim(canvas, c, d, w, h);
        return { dataUrl: trimmed || dataUrl, cutout: !!trimmed, cutoutNote: '图片自带透明底，已裁掉四周空白。' };
    }

    const bg = [0, 1, 2].map(k => median(border.map(n => d[n * 4 + k])));
    const dist = n => Math.max(Math.abs(d[n * 4] - bg[0]), Math.abs(d[n * 4 + 1] - bg[1]), Math.abs(d[n * 4 + 2] - bg[2]));
    const uniform = border.filter(n => dist(n) < 40).length / border.length;
    if (uniform < (keyed ? 0.6 : 0.8)) {
        return { dataUrl, cutout: false, cutoutNote: '背景不是一整块纯色，没有自动去背景。' };
    }

    const near = keyed ? 64 : 30;   // 算作背景
    const soft = keyed ? 160 : 96;  // 边缘带一点底色的那圈
    const gone = new Uint8Array(total);
    const queue = new Uint32Array(total);
    let head = 0, tail = 0;
    const add = n => { if (!gone[n] && dist(n) < near) { gone[n] = 1; queue[tail++] = n; } };
    for (const n of border) add(n);
    while (head < tail) {
        const n = queue[head++];
        const x = n % w;
        if (x > 0) add(n - 1);
        if (x < w - 1) add(n + 1);
        if (n >= w) add(n - w);
        if (n < total - w) add(n + w);
    }
    // 洋红在画里几乎不会出现：被线条围住的小块洋红（胳膊和身子之间的空隙）也去掉
    if (keyed) for (let n = 0; n < total; n++) if (!gone[n] && dist(n) < near * 0.6) { gone[n] = 1; tail++; }
    const removed = tail / total;
    if (removed < 0.04 || removed > 0.96) {
        return { dataUrl, cutout: false, cutoutNote: '没找到能放心去掉的背景，保留原图。' };
    }
    for (let n = 0; n < total; n++) if (gone[n]) d[n * 4 + 3] = 0;

    // 边缘两圈：按和底色的接近程度给半透明，并把混进去的底色减掉
    let ring = [];
    for (let n = 0; n < total; n++) {
        if (gone[n]) continue;
        const x = n % w;
        if ((x > 0 && gone[n - 1]) || (x < w - 1 && gone[n + 1]) || (n >= w && gone[n - w]) || (n < total - w && gone[n + w])) ring.push(n);
    }
    for (let pass = 0; pass < 2 && ring.length; pass++) {
        const next = [];
        for (const n of ring) {
            if (gone[n] === 2) continue;
            gone[n] = 2;
            const k = dist(n);
            if (k >= soft) continue;
            let a = Math.min(1, Math.max(0, (k - near * 0.5) / (soft - near * 0.5)));
            if (hard) a = a < 0.5 ? 0 : 1;
            if (a <= 0.02) { d[n * 4 + 3] = 0; }
            else if (a < 1) {
                for (let ch = 0; ch < 3; ch++) d[n * 4 + ch] = Math.max(0, Math.min(255, Math.round((d[n * 4 + ch] - (1 - a) * bg[ch]) / a)));
                d[n * 4 + 3] = Math.round(d[n * 4 + 3] * a);
            }
            const x = n % w;
            for (const m of [x > 0 ? n - 1 : -1, x < w - 1 ? n + 1 : -1, n - w, n + w]) if (m >= 0 && m < total && !gone[m]) next.push(m);
        }
        ring = next;
    }
    c.putImageData(pixels, 0, 0);
    const trimmed = trim(canvas, c, d, w, h);
    return {
        dataUrl: trimmed || canvas.toDataURL('image/png'),
        cutout: true,
        cutoutNote: '已自动去掉纯色背景、裁掉四周空白。发丝、轮廓不对的话，可以点「用原图」。',
    };
}

// 裁到有内容的范围（留一点边）；本来就占满时返回空
function trim(canvas, c, d, w, h) {
    let top = h, bottom = -1, left = w, right = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (d[(y * w + x) * 4 + 3] > 12) {
                if (y < top) top = y;
                if (y > bottom) bottom = y;
                if (x < left) left = x;
                if (x > right) right = x;
            }
        }
    }
    if (bottom < 0) return '';
    const pad = Math.round(Math.max(w, h) * 0.01);
    top = Math.max(0, top - pad); left = Math.max(0, left - pad);
    bottom = Math.min(h - 1, bottom + pad); right = Math.min(w - 1, right + pad);
    const cw = right - left + 1, ch = bottom - top + 1;
    if (cw >= w * 0.98 && ch >= h * 0.98) return canvas.toDataURL('image/png');
    const out = document.createElement('canvas');
    out.width = cw; out.height = ch;
    out.getContext('2d').drawImage(canvas, left, top, cw, ch, 0, 0, cw, ch);
    return out.toDataURL('image/png');
}
