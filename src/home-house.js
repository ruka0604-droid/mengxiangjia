// 梦想家 · 盖房子和他的样子
import { themeId, homeTheme, themeName } from './theme.js?mxj=0.6.2';
import { uid, now, parseJsonLoose, asText, hexOr, clip } from './util.js?mxj=0.6.2';
import { generate } from './api.js?mxj=0.6.2';
import { gatherContext, contextBlock } from './character.js?mxj=0.6.2';
import { getHome, setHome } from './settings.js?mxj=0.6.2';
import { CATALOG, CATALOG_PROMPT, DEFAULT_PALETTE } from './furniture.js?mxj=0.6.2';
import { normalizeLook, LOOK_PROMPT } from './sprite.js?mxj=0.6.2';
import { HOUSE_SYSTEM, LOOK_SYSTEM } from './home-prompts.js?mxj=0.6.2';
import { HOUSE_SIZES, ROOM_MODULES, STRUCTURES, roomTypeOf, houseCapacity, defaultFurnitureFor } from './home-rooms.js?mxj=0.6.2';

// ---------------- 盖房子 ----------------

function houseUserPrompt(info, size, extra, emptyWall, theme) {
    const sizeDef = HOUSE_SIZES.find(s => s.id === size) || HOUSE_SIZES[1];
    return `${contextBlock(info, { withRecent: false })}

# 设计要求
- 固定美术风格：${themeName(theme)}。家具配色与角色表现参考该风格，外貌和性格仍以人设为准。
- 房子大小：${sizeDef.name}（${sizeDef.rooms}）
${extra ? `- 用户补充：${extra}\n` : ''}${emptyWall ? '- 每个房间少放一点东西，留出空位，等两人以后一起布置。\n' : ''}- 家具只能从这些类型里选（type 用英文 id）：${CATALOG_PROMPT}
- 房间要包含：${(STRUCTURES[size] || []).map(t => ROOM_MODULES[t]).join('、') || '一个客厅'}。房间名可以起得有个性，但要看得出是哪种房间（比如「主卧」「朝南的小阳台」），不要另外重复加同一种房间。
- 每个房间放 3 到 7 件家具；x 是家具在房间正面图里从左到右的位置，0–100。
- 颜色用 #RRGGBB。
- look 是他在家里出现时的 Q 版小人外形，按角色描述里的外貌来定（发型选最接近的一种）。

# 输出格式
{
  "appearance": "从角色卡和世界书提取人物外貌：性别、年龄、发型、发色、瞳色、肤色、服装、配饰、独特特征。优先引用原文事实，未知标注未设定，不得臆造",
  ${LOOK_PROMPT},
  "name": "这个家的名字（短）",
  "story": "两三句话，用第二人称讲这个家给你的感觉和来历",
  "palette": { "wall": "#…", "floor": "#…", "accent": "#…", "trim": "#…" },
  "rooms": [ { "id": "r1", "name": "客厅", "note": "一句话特点", "wall": "#…(可选)" } ],
  "furniture": [ { "type": "sofa", "name": "墨绿旧沙发", "room": "r1", "x": 45, "color": "#…" } ]
}`;
}

export function normalizeHouse(parsed, raw, size) {
    const p = parsed && typeof parsed === 'object' ? parsed : {};
    const palette = {
        wall: hexOr(p.palette?.wall, DEFAULT_PALETTE.wall),
        floor: hexOr(p.palette?.floor, DEFAULT_PALETTE.floor),
        accent: hexOr(p.palette?.accent, DEFAULT_PALETTE.accent),
        trim: hexOr(p.palette?.trim, DEFAULT_PALETTE.trim),
    };
    let rooms = Array.isArray(p.rooms) ? p.rooms : [];
    rooms = rooms
        .filter(r => r && typeof r === 'object')
        .slice(0, 24)
        .map((r, i) => ({
            id: asText(r.id) || `r${i + 1}`,
            name: asText(r.name, 12) || `房间 ${i + 1}`,
            note: asText(r.note, 40),
            wall: hexOr(r.wall, ''),
        }))
        .map(r => ({ ...r, type: roomTypeOf(r) }));
    // 去重 id
    const seen = new Set();
    for (const r of rooms) {
        while (seen.has(r.id)) r.id = `${r.id}_`;
        seen.add(r.id);
    }
    if (!rooms.length) rooms = [{ id: 'r1', type: 'living', name: '客厅', note: '', wall: '' }];
    // 新建住宅补足预设结构模块，不调用生图 API。
    if (STRUCTURES[size]) {
        const counts={};for(const r of rooms){const t=roomTypeOf(r);if(t)counts[t]=(counts[t]||0)+1;}
        const needed={};for(const type of STRUCTURES[size]){needed[type]=(needed[type]||0)+1;if((counts[type]||0)<needed[type]){rooms.push({id:uid('r'),type,name:ROOM_MODULES[type],note:'',wall:'',floor:''});counts[type]=(counts[type]||0)+1;}}
    }
    rooms=rooms.slice(0,houseCapacity(size));
    const roomIds = new Set(rooms.map(r => r.id));
    const furniture = (Array.isArray(p.furniture) ? p.furniture : [])
        .filter(f => f && typeof f === 'object')
        .map(f => {
            const type = String(f.type || '').trim().toLowerCase();
            if (!CATALOG[type]) return null;
            return {
                id: uid('f'),
                type,
                name: asText(f.name, 16) || CATALOG[type].label,
                room: roomIds.has(String(f.room)) ? String(f.room) : rooms[0].id,
                x: Math.min(100, Math.max(0, Number(f.x) || 50)),
                color: hexOr(f.color, ''),
                by: 'ai',
            };
        })
        .filter(Boolean)
        .slice(0, 120);
    // 房间是空的就放几件基础家具，不让生成白费
    for (const r of rooms) {
        if (furniture.some(f => f.room === r.id)) continue;
        furniture.push(...defaultFurnitureFor(r));
    }
    if(size && !p.palette){Object.assign(palette,{wall:'#DDE7EA',floor:'#C9A27A',accent:'#579EB5',trim:'#27677D'});}
    return {
        name: asText(p.name, 20) || '我们的家',
        story: asText(p.story, 400) || (parsed ? '' : clip(String(raw || ''), 400)),
        size,
        appearance: asText(p.appearance, 1200),
        palette,
        rooms,
        furniture,
        look: p.look && typeof p.look === 'object' ? p.look : null,
    };
}

export async function designHouse(char, { size, extra, emptyWall, theme = 'pixel', signal }) {
    theme = getHome(char)?.house ? homeTheme(getHome(char)) : themeId(theme);
    const info = await gatherContext(char, { worldBookBudget: 18000 });
    const raw = await generate({ system: HOUSE_SYSTEM, user: houseUserPrompt(info, size, extra, emptyWall, theme), signal });
    const parsed = parseJsonLoose(raw);
    const house = normalizeHouse(parsed, raw, size);
    // 模型漏写外貌时，拿角色描述和世界书里讲外貌的几行当草稿，入住前给用户确认；不凭空编
    if (!house.appearance || /^(未设定|未知|无)$/.test(house.appearance.trim())) {
        const lines = String(info.worldBook || '').split('\n').filter(line => /外貌|容貌|发色|发型|瞳色|眼睛|肤色|衣着|服装|外观|appearance|hair|eyes|outfit/i.test(line));
        house.appearance = clip([info.char.description, ...lines].filter(Boolean).join('\n'), 1200);
    }
    return { ...house, theme };
}

export function createHome(char, house) {
    const home = getHome(char) || {
        v: 2,
        createdAt: now(),
        notes: [],
        visits: [],
        presence: { atHome: false, activity: '', mood: '', spot: '', since: 0 },
        lastVisitAt: 0,
    };
    if (home.house) throw new Error('已经入住的小屋不能通过重新设计覆盖，请使用扩建与搬家');
    home.theme = home.house ? homeTheme(home) : themeId(house.theme);
    home.themeLocked = true;
    home.appearance = house.appearance || home.appearance || '';
    home.appearanceConfirmed = true;
    house.theme = home.theme;
    home.charName = char?.name || '';
    if (!home.look && house.look) home.look = normalizeLook(house.look, char?.name);
    home.house = house;
    home.currentRoom = house.rooms[0]?.id || '';
    return setHome(char, home);
}

// ---------------- 形象 ----------------

export function getLook(home, char) {
    return normalizeLook(home?.look, char?.name || home?.charName || '');
}

export function setLook(char, patch) {
    const home = getHome(char);
    if (!home) return null;
    home.look = normalizeLook({ ...getLook(home, char), ...patch }, char?.name);
    setHome(char, home);
    return home.look;
}

export async function generateLook(char, { signal } = {}) {
    const info = await gatherContext(char, { worldBookBudget: 18000 });
    const user = `${contextBlock(info, { withRecent: false })}

# 要求
固定画风：${themeName(homeTheme(getHome(char)))}。用户确认的外貌：${getHome(char)?.appearance || "以角色卡为准"}。
按「${info.char.name}」的外貌定下小人的样子；描写里没提到的颜色按他的气质挑。没写到的特殊身体特征不要编，也不要按名字猜性别和年龄。颜色用 #RRGGBB。

# 输出格式
{ ${LOOK_PROMPT} }`;
    const raw = await generate({ system: LOOK_SYSTEM, user, signal, maxTokens: 800 });
    const parsed = parseJsonLoose(raw);
    // 没拿到形象数据就不动原来的样子（以前会被重置成默认小人）
    if (!parsed || typeof parsed !== 'object') throw new Error('这次没拿到他的样子，原来的形象没有改，可以再试一次。');
    const look = parsed?.look && typeof parsed.look === 'object' ? parsed.look : parsed;
    const home = getHome(char);
    if (!home) throw new Error('这个家已经不在了，这次生成的内容没有保存。');
    home.look = normalizeLook(look, char?.name);
    setHome(char, home);
    return home.look;
}
