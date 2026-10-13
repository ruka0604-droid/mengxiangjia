// 梦想家 · 布置：改动记录、「他挑的」、他帮忙摆、按描述做家具
import { homeTheme, themeName } from './theme.js?mxj=0.6.12';
import { now, parseJsonLoose, asText, hexOr, clip } from './util.js?mxj=0.6.12';
import { generate } from './api.js?mxj=0.6.12';
import { gatherContext, contextBlock } from './character.js?mxj=0.6.12';
import { getHome, setHome } from './settings.js?mxj=0.6.12';
import { CATALOG, CATALOG_PROMPT, SCENE_W, effectiveRow } from './furniture.js?mxj=0.6.12';
import { SUGGEST_SYSTEM, DESCRIBE_SYSTEM, ARRANGE_SYSTEM } from './home-prompts.js?mxj=0.6.12';
import { liveHome, houseSummary } from './home-shared.js?mxj=0.6.12';

export function pendingChanges(home) {
    const seen = Number(home?.changesSeenAt) || 0;
    return (home?.changes || []).filter(c => c.at > seen).slice(-12);
}

export function recordChanges(char, texts) {
    const list = [...new Set((texts || []).map(t => String(t || '').trim()).filter(Boolean))];
    if (!list.length) return;
    const home = getHome(char);
    if (!home) return;
    home.changes ||= [];
    const at = now();
    for (const text of list) home.changes.push({ at, text });
    home.growth ||= {points:0, events:0};
    home.growth.points += Math.min(20, 5 + list.length * 3);
    home.growth.events += 1;
    if (home.changes.length > 30) home.changes = home.changes.slice(-30);
    setHome(char, home);
}

function normalizeItem(raw, fallbackName = '') {
    const r = raw && typeof raw === 'object' ? raw : {};
    let type = String(r.type || '').trim().toLowerCase();
    if (!CATALOG[type]) type = guessType(`${r.name || ''} ${fallbackName}`);
    if (!type) return null;
    return {
        type,
        name: asText(r.name, 16) || clip(fallbackName, 16) || CATALOG[type].label,
        color: hexOr(r.color, ''),
        why: asText(r.why || r.reason, 60),
    };
}

// 模型没按格式给类型时，用中文名猜一个最接近的
export function guessType(text) {
    const s = String(text || '');
    const hints = [
        ['bed', /床/], ['sofa', /沙发|躺椅|长椅/], ['bookshelf', /书架|书柜/], ['bookstack', /书/], ['wardrobe', /衣柜|衣橱/],
        ['desk', /书桌|写字台|工作台|桌子/], ['diningtable', /餐桌|饭桌/], ['table', /茶几|小桌|边桌/], ['chair', /椅|凳/],
        ['lamp', /落地灯|台灯|灯/], ['stringlights', /串灯|灯串|星星灯/], ['plant', /植|花|草|树|盆栽|多肉/], ['rug', /地毯|毯/],
        ['window', /窗/], ['painting', /画|海报/], ['photo', /相框|照片|合照/], ['mirror', /镜/], ['clock', /钟|表/],
        ['wallshelf', /置物架|搁板|墙架/], ['tv', /电视|屏幕|投影/], ['piano', /钢琴|琴/], ['guitar', /吉他|贝斯|尤克里里/],
        ['recordplayer', /唱片|音响|留声机/], ['fridge', /冰箱/], ['stove', /灶|炉|厨房/], ['bathtub', /浴缸|浴盆/],
        ['aquarium', /鱼缸|鱼/], ['petbed', /猫窝|狗窝|宠物/], ['cushion', /坐垫|靠垫|抱枕|垫/], ['coatrack', /衣帽架|挂衣/],
        ['cabinet', /柜/],
    ];
    for (const [type, re] of hints) if (re.test(s)) return type;
    return '';
}

export async function suggestFurniture(char, roomId, { signal } = {}) {
    const home = getHome(char);
    const room = home?.house?.rooms.find(r => r.id === roomId);
    if (!room) throw new Error('找不到这个房间');
    const info = await gatherContext(char);
    const user = `${contextBlock(info, { withRecent: false })}

# 你们的家
${houseSummary(home)}

# 现在布置的房间
${room.name}${room.note ? `（${room.note}）` : ''}

# 要求
挑 3 到 4 件，类型只能从这些里选（type 用英文 id）：${CATALOG_PROMPT}
颜色用 #RRGGBB；name 是你给它起的具体名字；why 是你说的一句话（15 字以内，第一人称）。

# 输出格式
{ "items": [ { "type": "plant", "name": "窗台上的薄荷", "color": "#4F8360", "why": "泡茶的时候能掐两片" } ] }`;
    const raw = await generate({ system: SUGGEST_SYSTEM, user, signal, maxTokens: 1500 });
    const parsed = parseJsonLoose(raw);
    const list = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
    const items = list.map(x => normalizeItem(x)).filter(Boolean).slice(0, 4);
    const fresh = liveHome(char);
    fresh.suggestions = { roomId, at: now(), items };
    setHome(char, fresh);
    return items;
}

// 他帮忙摆：一次调用，拿回每件东西的新位置（左右、靠墙还是靠前、朝向）和一句话；
// 没给、给错的那件就不动，墙地颜色只在房间用纯色时才问。位置由布置模式套用（能撤销）
export async function planArrangement(char, roomId, positions = {}, { signal } = {}) {
    const home = getHome(char);
    const room = home?.house?.rooms.find(r => r.id === roomId);
    if (!room) throw new Error('找不到这个房间');
    const items = home.house.furniture.filter(f => f.room === roomId);
    if (!items.length) throw new Error(`${room.name}里还没有东西可以摆`);
    const showsArt = !!room.art?.path && room.useArt !== false;
    const rows = items.map(f => {
        const def = CATALOG[f.type];
        const layer = def.layer;
        const where = layer === 'wall' ? '挂墙上' : layer === 'rug' ? '铺地上' : effectiveRow(f) === 'back' ? '靠墙一排' : '靠前一排';
        const x = Math.round(Number(positions[f.id] ?? f.x ?? 50));
        return `- id: ${f.id}；${f.name || def.label}（${def.label}）；${where}；现在 x=${x}；宽约 ${Math.round(def.w / SCENE_W * 100)}${f.flip ? '；朝左' : ''}`;
    }).join('\n');
    const info = await gatherContext(char);
    const user = `${contextBlock(info, { withRecent: false })}

# 你们的家
${houseSummary(home)}

# 现在要摆的房间
${room.name}${room.note ? `（${room.note}）` : ''}
${showsArt ? '' : `墙面颜色 ${room.wall || home.house.palette.wall}，地板颜色 ${room.floor || home.house.palette.floor}
`}
# 房间里的东西
${rows}

# 怎么摆
- 从正面看这个房间。x 是左右位置，0 最左、100 最右；宽是它占房间宽度的百分比，同一排的东西别叠在一起。
- 挂墙上的、铺地上的只能左右挪；落地的可以选 row："back"（靠墙一排）或 "front"（靠前一排）。
- flip 为 true 就是朝左摆（默认朝右）。
- 每件都写上；不想动的照抄现在的 x。${showsArt ? '' : '\n- 想换墙面或地板颜色就写 wall / floor（#RRGGBB），不换就不写。'}
- say 是你摆完说的一句话（30 字以内，第一人称）。

# 输出格式
{ "items": [ { "id": "…", "x": 30, "row": "back", "flip": false } ], "say": "…" }`;
    const raw = await generate({ system: ARRANGE_SYSTEM, user, signal, maxTokens: Math.min(3000, 600 + items.length * 60) });
    const parsed = parseJsonLoose(raw);
    const list = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
    const ids = new Set(items.map(f => f.id));
    const moves = list.map(m => {
        if (!m || typeof m !== 'object' || !ids.has(String(m.id))) return null;
        const x = Number(m.x);
        return {
            id: String(m.id),
            x: Number.isFinite(x) ? x : null,
            row: m.row === 'back' || m.row === 'front' ? m.row : '',
            flip: typeof m.flip === 'boolean' ? m.flip : null,
        };
    }).filter(Boolean);
    const say = asText(parsed?.say || parsed?.comment || (parsed ? '' : raw), 80);
    return {
        roomId,
        moves,
        wall: showsArt ? '' : hexOr(parsed?.wall, ''),
        floor: showsArt ? '' : hexOr(parsed?.floor, ''),
        say,
    };
}

export async function furnitureFromText(char, text, { signal } = {}) {
    const desc = String(text || '').trim();
    const user = `固定美术风格：${themeName(homeTheme(getHome(char)))}。家具配色应符合此风格。
用户想要：${desc}

类型只能从这些里选（type 用英文 id）：${CATALOG_PROMPT}
输出格式：{ "type": "…", "name": "具体名字（12 字以内）", "color": "#RRGGBB" }`;
    let parsed = null;
    try {
        const raw = await generate({ system: DESCRIBE_SYSTEM, user, signal, maxTokens: 600 });
        parsed = parseJsonLoose(raw);
    } catch (error) {
        if (signal?.aborted) throw error;
        // 生成失败时直接按描述猜，不让这一步卡住
        console.warn('[梦想家] 按描述生成家具失败，改用名称推断', error);
    }
    return normalizeItem(parsed, desc) || { type: guessType(desc) || 'cabinet', name: clip(desc, 16), color: '', why: '' };
}
