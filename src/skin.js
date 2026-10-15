// 梦想家 · 配色与美化：预设配色、自己调的颜色、导入的美化 CSS
// 配色只换颜色，各风格的形状（像素的方块边、手帐的胶带、绘本的圆角）不变。
// 美化 CSS 会自动加上 #mxj-root 前缀，只影响梦想家，不会弄乱酒馆；优先级高于插件自带的样式。

export const SKIN_KEYS = [
    ['bg', '页面底色'],
    ['top', '顶栏'],
    ['card', '卡片'],
    ['ink', '文字'],
    ['muted', '次要文字'],
    ['accent', '主色（按钮、选中）'],
    ['line', '线条'],
    ['red', '提醒色'],
];

export const SKIN_PRESETS = {
    oat: { name: '燕麦拿铁', colors: { bg: '#E8E0D4', top: '#F3EDE4', card: '#FBF8F3', ink: '#3A322B', muted: '#6B5F52', accent: '#7E5F45', line: '#CDBFAE', red: '#A1402F' } },
    mist: { name: '雾霾蓝', colors: { bg: '#DCE3E9', top: '#EEF2F5', card: '#F8FAFB', ink: '#232F38', muted: '#54636F', accent: '#46657D', line: '#B7C4CF', red: '#A1402F' } },
    sage: { name: '鼠尾草', colors: { bg: '#DEE4D8', top: '#EEF2EA', card: '#F8FAF5', ink: '#2A3327', muted: '#566151', accent: '#566F51', line: '#BBC7B4', red: '#A1402F' } },
    mauve: { name: '藕荷', colors: { bg: '#E9DEE1', top: '#F4EDEF', card: '#FCF8F9', ink: '#3A2C32', muted: '#69565E', accent: '#84566A', line: '#D2C0C7', red: '#A1402F' } },
    clay: { name: '灰陶', colors: { bg: '#E3DDD7', top: '#EFEAE5', card: '#F9F6F3', ink: '#322E2B', muted: '#625A54', accent: '#8E5E48', line: '#C9BFB6', red: '#9E3B2F' } },
    cream: { name: '奶油黄', colors: { bg: '#EFE7D2', top: '#F7F1E1', card: '#FFFCF3', ink: '#3A3323', muted: '#675C40', accent: '#8A6A26', line: '#D9CBA6', red: '#A1402F' } },
    forest: { name: '墨绿夜', colors: { bg: '#1C2420', top: '#232D28', card: '#28322D', ink: '#E6ECE7', muted: '#A8B5AD', accent: '#9CC3A5', line: '#3E4A44', red: '#EE9A88' } },
    night: { name: '夜航蓝', colors: { bg: '#1A2030', top: '#20283A', card: '#252D40', ink: '#E6EAF2', muted: '#A9B1C5', accent: '#9DB3E2', line: '#3A4358', red: '#EF9A90' } },
};

const HEX = /^#[0-9a-f]{6}$/i;

function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]) {
    return `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
export function mix(a, b, t) {
    const x = rgb(a), y = rgb(b);
    return toHex(x.map((v, i) => v + (y[i] - v) * t));
}
function lum(hex) {
    return rgb(hex).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrast(a, b) {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const better = (bg, ...list) => list.reduce((best, c) => (contrast(c, bg) > contrast(best, bg) ? c : best));

// 缺的颜色用「燕麦拿铁」补上，格式不对的也换掉
export function cleanColors(colors) {
    const base = SKIN_PRESETS.oat.colors;
    const out = {};
    for (const [k] of SKIN_KEYS) out[k] = HEX.test(String(colors?.[k] || '')) ? String(colors[k]).toUpperCase() : base[k];
    return out;
}

// 由几种主要颜色算出界面要用的全部颜色（按钮上的字、浅一点的主色、输入框底……）
export function skinVars(colors) {
    const c = cleanColors(colors);
    const dark = lum(c.bg) < 0.2;
    const accentInk = better(c.accent, c.card, c.ink, '#FFFFFF', '#1E1E1E');
    return {
        '--mxj-ground': c.bg,
        '--mxj-paper': c.card,
        '--mxj-white': dark ? mix(c.card, '#FFFFFF', 0.06) : mix(c.card, '#FFFFFF', 0.6),
        '--mxj-ink': c.ink,
        '--mxj-muted': c.muted,
        '--mxj-line': c.line,
        '--mxj-line-soft': mix(c.line, c.card, 0.5),
        '--mxj-green': c.accent,
        '--mxj-green-soft': mix(c.accent, c.card, dark ? 0.8 : 0.86),
        '--mxj-red': c.red,
        '--mxj-surface': mix(c.accent, c.card, dark ? 0.9 : 0.93),
        '--mxj-top': c.top,
        '--mxj-top-ink': better(c.top, c.ink, c.card, '#FFFFFF', '#1E1E1E'),
        '--mxj-accent-ink': accentInk,
        '--mxj-red-ink': better(c.red, '#FFFFFF', '#1E1E1E', c.ink, c.card),
        // 写在页面底上的说明字：次要文字在底色上不够清楚时就用正文颜色
        '--mxj-muted-on-bg': contrast(c.muted, c.bg) >= 4.5 ? c.muted : c.ink,
        '--mxj-link': contrast(c.accent, c.card) >= 4.5 ? c.accent : c.ink,
    };
}

// 自己调的颜色哪里可能看不清（只提醒，不拦着）
export function skinProblems(colors) {
    const c = cleanColors(colors);
    const v = skinVars(c);
    const out = [];
    if (contrast(c.ink, c.card) < 4.5) out.push('文字和卡片颜色太接近，卡片上的字会看不清');
    if (contrast(c.muted, c.card) < 4.5) out.push('次要文字在卡片上偏淡');
    if (contrast(c.ink, c.bg) < 4.5) out.push('文字和页面底色太接近');
    if (contrast(v['--mxj-accent-ink'], c.accent) < 4.5) out.push('主色上的字（按钮、选中的选项）不够清楚，主色可以再深或再浅一点');
    if (contrast(v['--mxj-top-ink'], c.top) < 4.5) out.push('顶栏的标题不够清楚');
    if (contrast(c.red, c.card) < 3) out.push('提醒色在卡片上不够醒目');
    return out;
}

// ---------------- 用哪一套 ----------------

const EMPTY = { palette: '', colors: null, css: '', name: '' };

export function normalizeSkin(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    return {
        palette: s.palette === 'custom' || SKIN_PRESETS[s.palette] ? s.palette : '',
        colors: s.colors ? cleanColors(s.colors) : null,
        css: typeof s.css === 'string' ? s.css.slice(0, 200000) : '',
        name: typeof s.name === 'string' ? s.name.slice(0, 40) : '',
    };
}

// 这个家单独设置了就用这个家的，否则用所有家共用的那套
export function effectiveSkin(settings, home) {
    if (home?.skin?.own) return { ...normalizeSkin(home.skin), scope: 'home' };
    return { ...normalizeSkin(settings?.skin || EMPTY), scope: 'global' };
}

export function skinColors(skin) {
    if (!skin?.palette) return null;
    if (skin.palette === 'custom') return cleanColors(skin.colors);
    return SKIN_PRESETS[skin.palette]?.colors || null;
}

// ---------------- 美化 CSS ----------------

function scopeSelector(sel) {
    const s = sel.trim();
    if (!s) return s;
    if (/^#mxj-root(?![\w-])/.test(s)) return s.replace(/^#mxj-root/, '#mxj-root#mxj-root');
    if (/^(:root|html|body)(?![\w-])/.test(s)) return s.replace(/^(:root|html|body)/, '#mxj-root#mxj-root');
    return `#mxj-root#mxj-root ${s}`;
}

function scopeBlock(text) {
    let out = '';
    let i = 0;
    while (i < text.length) {
        const open = text.indexOf('{', i);
        if (open < 0) break;
        const prelude = text.slice(i, open).trim();
        let depth = 1;
        let j = open + 1;
        while (j < text.length && depth) {
            if (text[j] === '{') depth++;
            else if (text[j] === '}') depth--;
            j++;
        }
        const body = text.slice(open + 1, depth ? text.length : j - 1);
        if (/^@(media|supports|container|layer)\b/i.test(prelude)) out += `${prelude}{${scopeBlock(body)}}\n`;
        else if (/^@/.test(prelude)) out += `${prelude}{${body}}\n`;
        else if (prelude) out += `${prelude.split(',').map(scopeSelector).join(', ')}{${body}}\n`;
        i = j;
    }
    return out;
}

// 只影响梦想家：每条规则前面加上 #mxj-root（写两遍，压过插件自带的样式）；@import 去掉
export function scopeCss(css) {
    const text = String(css || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/<\/?style[^>]*>/gi, '')
        .replace(/@import[^;]*;?/gi, '')
        .replace(/@charset[^;]*;?/gi, '');
    return scopeBlock(text);
}

// ---------------- 套到面板上 ----------------

// 配色写成一条规则放进面板里的 <style>（不写行内样式，这样导入的美化还能改这些颜色）：
// 配色压过各风格自带的颜色，导入的美化 CSS 又压过配色
let lastKey = '';
export function applySkin(root, skin) {
    if (!root) return;
    const colors = skinColors(skin);
    const key = JSON.stringify([colors, skin?.css || '']);
    let style = root.querySelector('#mxj-user-skin');
    if (key === lastKey && style) return;
    lastKey = key;
    if (!style) {
        style = document.createElement('style');
        style.id = 'mxj-user-skin';
        root.prepend(style);
    }
    let text = '';
    if (colors) {
        root.dataset.palette = skin.palette;
        text += `#mxj-root[data-palette][data-palette]{${Object.entries(skinVars(colors)).map(([k, v]) => `${k}:${v}`).join(';')}}\n`;
    } else {
        delete root.dataset.palette;
    }
    if (skin?.css) {
        root.dataset.skin = 'custom';
        text += scopeCss(skin.css);
    } else {
        delete root.dataset.skin;
    }
    style.textContent = text;
}

// ---------------- 导入、导出 ----------------

// 导出成一个 .json：配色 + 美化 CSS，别人导入就是同一套
export function exportSkin(skin) {
    return JSON.stringify({ mengxiangjiaSkin: 1, name: skin.name || '我的美化', palette: skin.palette || '', colors: skinColors(skin) || undefined, css: skin.css || '' }, null, 2);
}

// 导入：.json 是导出的那种格式；.css / .txt 就当成美化 CSS
export function parseSkinFile(text, filename = '') {
    const raw = String(text || '');
    const base = String(filename || '').replace(/\.[^.]+$/, '').slice(0, 40);
    if (/\.json$/i.test(filename) || /^\s*\{\s*"/.test(raw)) {
        let data = null;
        try { data = JSON.parse(raw); } catch { /* 不是 JSON，当 CSS 用 */ }
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            const colors = data.colors && typeof data.colors === 'object' ? cleanColors(data.colors) : null;
            return {
                palette: colors ? 'custom' : (SKIN_PRESETS[data.palette] ? data.palette : ''),
                colors,
                css: typeof data.css === 'string' ? data.css : '',
                name: String(data.name || base || '导入的美化').slice(0, 40),
            };
        }
    }
    return { css: raw, name: base || '导入的美化' };
}

// 页面标记：根元素上有 data-view（现在在哪一页）、data-theme（风格）、data-palette（用了哪套配色）
export const SKIN_VIEWS = [
    ['home', '小屋首页'], ['decorate', '布置'], ['notes', '小纸条'], ['diary', '交换日记'], ['log', '回家记录'], ['pets', '小家伙们'],
    ['pet-adopt', '领养'], ['plant-new', '种一盆'], ['plant', '成长记录'], ['pet-dress', '换装扮'], ['build', '盖房子 / 房子档案'],
    ['look', '他的样子'], ['art', '画出我们的家'], ['settings', '设置'], ['skin-guide', '美化接口说明'],
];

export const SKIN_PARTS = [
    ['.mxj-window', '整个面板'], ['.mxj-top', '顶栏'], ['.mxj-title / .mxj-subtitle', '标题 / 副标题'], ['.mxj-icon-btn', '顶栏的圆按钮'],
    ['.mxj-main', '可以上下滑的内容区'], ['.mxj-status', '顶部提示条（.is-busy 生成中、.is-toast 提示、.is-error 出错）'],
    ['.mxj-card', '卡片'], ['.mxj-strip', '「他在家」那一条'], ['.mxj-scene', '房间画面'], ['.mxj-entries / .mxj-entry', '首页底部的入口'],
    ['.mxj-btn / .mxj-btn.is-primary', '按钮 / 主按钮'], ['.mxj-chip / .mxj-chip.is-on', '小标签按钮 / 选中的'], ['.mxj-input', '输入框'],
    ['.mxj-turn / .mxj-turn.is-user', '他说的话 / 你说的话'], ['.mxj-board / .mxj-note', '纸条软木板 / 一张纸条'], ['.mxj-diary-page', '日记本的一页'],
    ['.mxj-pet-card', '小家伙的卡片'], ['.mxj-group', '设置里的一组'], ['.mxj-muted', '次要文字'],
];

export const SKIN_TEMPLATE = `/* 梦想家美化模板
 * 导入后每条规则会自动加上 #mxj-root 前缀，只影响梦想家，优先级高于插件自带的样式。
 * @import 会被去掉；图片可以写网址（url(...)），但别人那边要能打开这个网址。
 * 先改下面这些颜色变量就能换整体配色；想细调某个部件，再写下面那些选择器。
 */
#mxj-root {
  --mxj-ground: #E8E0D4;      /* 页面底色 */
  --mxj-top: #F3EDE4;         /* 顶栏 */
  --mxj-top-ink: #3A322B;     /* 顶栏文字 */
  --mxj-paper: #FBF8F3;       /* 卡片 */
  --mxj-white: #FDFBF8;       /* 输入框、普通按钮 */
  --mxj-ink: #3A322B;         /* 文字 */
  --mxj-muted: #6B5F52;       /* 次要文字 */
  --mxj-line: #CDBFAE;        /* 线条 */
  --mxj-line-soft: #E4DACE;   /* 浅线条 */
  --mxj-green: #7E5F45;       /* 主色：主按钮、选中 */
  --mxj-accent-ink: #FBF8F3;  /* 主色上的字 */
  --mxj-green-soft: #EFE7DE;  /* 浅主色：你说的话、小标签 */
  --mxj-surface: #F5F0EA;     /* 卡片里的浅色底：他说的话 */
  --mxj-red: #A1402F;         /* 提醒色 */
  --mxj-display: "Songti SC", "STSong", serif;   /* 标题字体 */
  --mxj-body: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; /* 正文字体 */
}

/* 只在某一页生效：[data-view="页名"]，比如小纸条页 */
#mxj-root[data-view="notes"] .mxj-card { border-radius: 18px; }

/* 只在某个风格下生效：[data-theme="pixel" / "scrapbook" / "storybook"] */
#mxj-root[data-theme="storybook"] .mxj-btn.is-primary { letter-spacing: 1px; }

/* 常用部件 */
.mxj-card { box-shadow: 0 4px 14px rgba(0, 0, 0, .06); }
.mxj-btn.is-primary { font-weight: 600; }
.mxj-turn { border-radius: 14px; }
`;
