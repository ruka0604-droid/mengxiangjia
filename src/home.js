import { themeId, homeTheme, themeName } from './theme.js?mxj=0.5.6';
// 梦想家 · 家的数据与生成
import { uid, now, parseJsonLoose, asText, hexOr, clip } from './util.js?mxj=0.5.6';
import { generate } from './api.js?mxj=0.5.6';
import { gatherContext, contextBlock } from './character.js?mxj=0.5.6';
import { getHome, setHome, getSettings } from './settings.js?mxj=0.5.6';
import { CATALOG, CATALOG_PROMPT, DEFAULT_PALETTE } from './furniture.js?mxj=0.5.6';
import { normalizeLook, LOOK_PROMPT } from './sprite.js?mxj=0.5.6';

export const NOTE_KINDS = ['道歉', '纪念', '日常', '想你', '谢谢', '生气了'];
export const NOTE_PLACES = ['门边', '冰箱', '枕边', '书桌'];
export const HOUSE_SIZES = [
    { id: 'studio', name: '一间小屋', sub: '开间', rooms: '1 个房间', maxRooms: 4 },
    { id: 'flat', name: '小公寓', sub: '基础五间', rooms: '5 个房间', maxRooms: 8 },
    { id: 'yard', name: '带院子', sub: '庭院住宅', rooms: '5 个房间（含院子）', maxRooms: 10 },
    { id: 'large_flat', name: '大平层', sub: '宽敞单层', rooms: '9 个房间', maxRooms: 12 },
    { id: 'villa', name: '别墅', sub: '多层住宅', rooms: '12 个房间', maxRooms: 16 },
];

// 结构模板只创建房间数据，不生成房屋图片；旧存档无需迁移。
export const ROOM_MODULES = Object.freeze({
    living:'客厅', bedroom:'卧室', kitchen:'厨房', bathroom:'浴室', balcony:'阳台',
    yard:'庭院', dining:'餐厅', study:'书房', dressing:'更衣室', terrace:'露台',
    sunroom:'阳光房', studio:'工作室', gaming:'游戏室', cinema:'影音室',
    garden:'花园', pool:'泳池', gym:'健身房', pet:'宠物房', storage:'储藏室',
});
const STRUCTURES = {
    studio:['living'], flat:['living','bedroom','kitchen','bathroom','balcony'],
    yard:['living','bedroom','kitchen','bathroom','yard'],
    large_flat:['living','bedroom','bedroom','kitchen','bathroom','dining','study','dressing','balcony'],
    villa:['living','kitchen','dining','bedroom','bedroom','bedroom','bathroom','study','dressing','terrace','yard','sunroom'],
};
export function roomModulesFromText(text) {
    const value=String(text||''); const result=[];
    for(const [type,name] of Object.entries(ROOM_MODULES)) {
        const pattern=new RegExp('(?:([一二三四五六七八九]|[1-9])(?:间|个))?'+name,'g');
        for(const m of value.matchAll(pattern)) {
            const count=({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}[m[1]]||Number(m[1])||1);
            for(let i=0;i<Math.min(count,8);i++)result.push(type);
        }
    }
    return result;
}
export function houseCapacity(size) { return HOUSE_SIZES.find(h=>h.id===size)?.maxRooms ?? 8; }
export function addRoomModules(char, types) {
    const home=getHome(char);if(!home?.house)throw new Error('还没有家');
    const added=[];
    const capacity=houseCapacity(home.house.size);
    const valid=types.filter(type=>ROOM_MODULES[type]);
    if(home.house.rooms.length+valid.length>capacity)throw new Error(`当前住宅最多容纳 ${capacity} 个房间模块，请先升级搬家，或减少新增房间数量`);
    for(const type of valid) {
        const room={id:uid('r'),type,name:ROOM_MODULES[type],note:'',wall:'',floor:'',floorLevel:1};
        home.house.rooms.push(room);added.push(room);
    }
    if(added.length){setHome(char,home);recordChanges(char,[`新增房间：${added.map(r=>r.name).join('、')}`]);}
    return added;
}
export function upgradeHouse(char,size,{extra=''}={}) {
    const home=getHome(char); if(!home?.house)throw new Error('还没有家');
    if(!STRUCTURES[size])throw new Error('不支持的住宅结构');
    const old=home.house.size;
    if(old===size)return [];
    if(houseCapacity(size)<=houseCapacity(old))throw new Error('搬家升级必须选择容量更大的住宅');
    const existing={};
    for(const r of home.house.rooms){const t=r.type||Object.keys(ROOM_MODULES).find(k=>ROOM_MODULES[k]===r.name);if(t)existing[t]=(existing[t]||0)+1;}
    const missing=[];const seen={};
    for(const type of STRUCTURES[size]){seen[type]=(seen[type]||0)+1;if(seen[type]>(existing[type]||0))missing.push(type);}
    const requested=extra?roomModulesFromText(extra):[];
    if(home.house.rooms.length+missing.length+requested.length>houseCapacity(size))throw new Error('升级后的房间模块超过住宅容量，请减少补充要求');
    // 原子性提交：先在内存中完成全部修改，再保存一次。
    const added=[...missing,...requested].map(type=>({id:uid('r'),type,name:ROOM_MODULES[type],note:'',wall:'',floor:'',floorLevel:1}));
    home.house.rooms.push(...added);
    home.house.size=size;
    home.house.structureHistory||=[];
    home.house.structureHistory.push({from:old,to:size,at:now()});
    home.changes||=[];
    home.changes.push({at:now(),text:`住宅从${HOUSE_SIZES.find(x=>x.id===old)?.name||old}升级为${HOUSE_SIZES.find(x=>x.id===size)?.name||size}；新增${added.map(x=>x.name).join('、')||'无'}房间`});
    setHome(char,home);
    return added;
}

export function removeRoomModule(char,roomId) {
    const home=getHome(char);if(!home?.house)throw new Error('还没有家');
    if(home.house.rooms.length<=1)throw new Error('住宅至少保留一个房间');
    const room=home.house.rooms.find(r=>r.id===roomId);if(!room)throw new Error('找不到房间');
    const furniture=home.house.furniture.filter(f=>f.room===roomId);
    home.house.furniture=home.house.furniture.filter(f=>f.room!==roomId);
    home.house.furnitureStorage||=[];
    home.house.furnitureStorage.push(...furniture.map(f=>({...f,previousRoom:roomId,room:''})));
    home.house.rooms=home.house.rooms.filter(r=>r.id!==roomId);
    if(home.currentRoom===roomId)home.currentRoom=home.house.rooms[0].id;
    home.changes||=[];home.changes.push({at:now(),text:`移除${room.name}模块，${furniture.length}件家具转入仓库`});
    setHome(char,home);return furniture.length;
}

// ---------------- 盖房子 ----------------

const HOUSE_SYSTEM = `你是一位很会讲故事的室内设计师。你要根据角色设定，为这个角色和用户设计一个两人共同生活的家。
房子要像这个角色会住的地方：从他的职业、习惯、喜好、世界观里找细节，而不是千篇一律的样板间。
只输出一个 JSON 对象，不要输出其他文字。`;

function houseUserPrompt(info, size, extra, emptyWall, theme) {
    const sizeDef = HOUSE_SIZES.find(s => s.id === size) || HOUSE_SIZES[1];
    return `${contextBlock(info, { withRecent: false })}

# 设计要求
- 固定美术风格：${themeName(theme)}。家具配色与角色表现参考该风格，外貌和性格仍以人设为准。
- 房子大小：${sizeDef.name}（${sizeDef.rooms}）
${extra ? `- 用户补充：${extra}\n` : ''}${emptyWall ? '- 每个房间少放一点东西，留出空位，等两人以后一起布置。\n' : ''}- 家具只能从这些类型里选（type 用英文 id）：${CATALOG_PROMPT}
- 每个房间放 3 到 7 件家具；x 是家具在房间正面图里从左到右的位置，0–100。
- 颜色用 #RRGGBB。
- look 是他在家里出现时的 Q 版小人外形，按角色描述里的外貌来定（发型选最接近的一种）。

# 输出格式
{
  "appearance": "从角色设定提取的外貌摘要：发型、发色、瞳色、肤色、服装、配饰；未提及的特征标注未设定",
  ${LOOK_PROMPT},
  "name": "这个家的名字（短）",
  "story": "两三句话，用第二人称讲这个家给你的感觉和来历",
  "palette": { "wall": "#…", "floor": "#…", "accent": "#…", "trim": "#…" },
  "rooms": [ { "id": "r1", "name": "起居室", "note": "一句话特点", "wall": "#…(可选)" } ],
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
        }));
    // 去重 id
    const seen = new Set();
    for (const r of rooms) {
        while (seen.has(r.id)) r.id = `${r.id}_`;
        seen.add(r.id);
    }
    if (!rooms.length) rooms = [{ id: 'r1', name: '起居室', note: '', wall: '' }];
    // 新建住宅补足预设结构模块，不调用生图 API。
    if (STRUCTURES[size]) {
        const counts={};for(const r of rooms){const t=r.type||Object.keys(ROOM_MODULES).find(k=>ROOM_MODULES[k]===r.name);if(t)counts[t]=(counts[t]||0)+1;}
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
        for (const [type, x] of [['window', 70], ['sofa', 45], ['plant', 85], ['lamp', 12]]) {
            furniture.push({ id: uid('f'), type, name: CATALOG[type].label, room: r.id, x, color: '', by: 'ai' });
        }
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
    const info = await gatherContext(char);
    const raw = await generate({ system: HOUSE_SYSTEM, user: houseUserPrompt(info, size, extra, emptyWall, theme), signal });
    const parsed = parseJsonLoose(raw);
    return { ...normalizeHouse(parsed, raw, size), theme };
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
    home.theme = home.house ? homeTheme(home) : themeId(house.theme);
    home.themeLocked = true;
    home.appearance = house.appearance || home.appearance || '';
    home.appearanceConfirmed = true;
    house.theme = home.theme;
    home.charName = char?.name || '';
    if (!home.look && house.look) home.look = normalizeLook(house.look, char?.name);
    if(home.house) throw new Error('已经入住的小屋不能通过重新设计覆盖，请使用扩建与搬家');
    home.house = house;
    home.currentRoom = house.rooms[0]?.id || '';
    return setHome(char, home);
}

// ---------------- 家的近况（给模型看） ----------------

function houseSummary(home) {
    const h = home.house;
    if (!h) return '';
    const lines = [`家：${h.name}。${h.story || ''}`, `固定画风：${themeName(homeTheme(home))}。`, `确认的角色外貌：${home.appearance || '以角色卡为准'}。`];
    for (const r of h.rooms) {
        const items = h.furniture.filter(f => f.room === r.id).map(f => `${f.name}[${f.id}]${f.by === 'user' ? '(用户放的)' : ''}`);
        lines.push(`- ${r.name}：${items.join('、') || '空着'}`);
    }
    return lines.join('\n');
}

function recentLog(home, n = 5) {
    return (home.visits || []).slice(-n).map(v => {
        let line = `[${new Date(v.at).toLocaleString()}] 他：${v.event}`;
        for (const t of v.turns || []) line += `\n  用户：${t.user}\n  他：${t.reply}`;
        return line;
    }).join('\n');
}

function notesForVisit(home) {
    return (home.notes || []).filter(n => n.from === 'user' && !n.readAt);
}

function notesHistory(home, n = 6) {
    return (home.notes || []).slice(-n).map(x => `${x.from === 'user' ? '用户' : '他'}写的${x.kind}纸条（${x.place}）：${x.text}`).join('\n');
}

// ---------------- 他回家 ----------------

const VISIT_SYSTEM = `你在扮演角色，描写他回到和用户共同的家时发生的小事。保持角色的性格和说话方式，像生活片段，不要写成剧情大转折。
叙述用第三人称写他，用「你」称呼用户。只输出一个 JSON 对象，不要输出其他文字。`;

function nowLine() {
    const d = new Date();
    const h = d.getHours();
    const part = h < 5 ? '深夜' : h < 9 ? '清晨' : h < 12 ? '上午' : h < 14 ? '中午' : h < 18 ? '下午' : h < 22 ? '晚上' : '深夜';
    return `${d.getMonth() + 1}月${d.getDate()}日 ${part} ${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 仅在回家时扫描正文；事件指纹用于避免同一段剧情反复生成纸条。
function storyEvents(recent) {
    const lines=String(recent||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
    const patterns=[['纪念日',/纪念日|周年|生日|相识一周年/],['争执',/吵架|争吵|冷战|闹别扭/],['和好',/和好|道歉|原谅/],['旅行',/旅行结束|旅途|度假回来/],['约会',/第一次约会|约会结束/]];
    return lines.slice(-30).flatMap(line=>patterns.filter(([,rx])=>rx.test(line)).map(([kind])=>({kind,text:line.slice(0,180)}))).slice(-8);
}
function storyFingerprint(events) {
    const text=events.map(e=>e.kind+':'+e.text).join('|');
    let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return events.length?String(hash>>>0):'';
}
export async function comeHome(char, { signal } = {}) {
    const home = getHome(char);
    if (!home?.house) throw new Error('还没有家');
    const info = await gatherContext(char);
    const unread = notesForVisit(home);
    const events = getSettings().readRecentChat ? storyEvents(info.recent) : [];
    const processed = new Set(home.processedStoryEvents || []);
    const newEvents = events.filter(e=>!processed.has(storyFingerprint([e])));
    const fingerprint = storyFingerprint(newEvents);
    const freshStory = newEvents.length > 0;
    const diaryDue = getDiary(home).mode !== 'manual' && (charTurn(home) || (freshStory && newEvents.some(e=>/纪念日|旅行|约会/.test(e.kind))) || pendingChanges(home).some(e=>/搬家|住宅从/.test(e.text)));  
    const changes = pendingChanges(home);
    const story = (info.recent || '').slice(-5000);
    const user = `${contextBlock(info)}

# 你们的家
${houseSummary(home)}

# 之前在家里发生的事
${recentLog(home) || '（这是第一次回家）'}

# 最近的纸条
${notesHistory(home) || '（还没有纸条）'}
${changes.length ? `\n# 他上次离开后，用户对家里做的改动（他回家会注意到，可以自然地提一句或用一用新东西）\n${changes.map(c => `- ${c.text}`).join('\n')}\n` : ''}
# 正文剧情联动（仅在回家时处理）
${getSettings().readRecentChat ? story : '未授权读取近期正文'}
# 本次新识别事件
${freshStory ? newEvents.map(e=>e.kind+'：'+e.text).join('\n') : '无新事件，不要因为旧剧情再次生成纸条'}
请只回应近期正文中确实发生的纪念日、争执、和好、旅行等，不要虚构事件或强迫和好；如果没有新事件不要硬写。角色态度必须符合人设。
# 待回应装修变化
${changes.map(c=>c.text).join('；')||'无'}
# 现在
${nowLine()}，${info.char.name}回到家。
${unread.length ? `用户留了 ${unread.length} 张他还没看到的纸条，他回家会看到并回信：\n${unread.map(n => `- id=${n.id}｜${n.kind}｜贴在${n.place}｜${n.text}`).join('\n')}` : '没有未读的纸条。'}
${diaryDue ? `\n# 交换日记\n书桌上的交换日记轮到他写了。他看过你写的那一篇，回家后会接着写一篇。\n${diaryContext(home)}\n` : ''}
# 输出格式
{
  "activity": "他现在在做什么（8 字以内，如：窗边看书）",
  "mood": "他的心情（4 字以内）",
  "spot": "他待在哪件家具旁边，填上面方括号里的家具 id，没有就空",
  "event": "他回家后的一个小场景，1 到 3 句",
  "options": ["你可以做的一件小事", "另一件"],
  "replies": [ { "to": "纸条 id", "text": "他的回信" } ],
  "note": null
}
如果存在待回应装修变化，必须用 note 写一张反映这些变化的小纸条；若本次有新识别的正文事件，也可以结合写在纸条里。若没有新变化则可不写。不要把冲突自动写成和好。把 note 写成 { "kind": "${NOTE_KINDS.join('/')} 之一", "place": "${NOTE_PLACES.join('/')} 之一", "text": "纸条内容" }；不想留就是 null。${diaryDue ? `
另外加一个字段 "diary": ${DIARY_FORMAT}` : ''}`;
    const raw = await generate({ system: VISIT_SYSTEM, user, signal });
    const parsed = parseJsonLoose(raw);
    const visit = applyVisit(char, parsed, raw, unread, {fingerprint:freshStory?fingerprint:'', eventKeys:newEvents.map(e=>storyFingerprint([e])), hasChanges:changes.length>0});
    if (diaryDue && parsed?.diary) {
        const h = getHome(char);
        if (applyCharDiary(h, parsed.diary, '')) setHome(char, h);
    }
    return visit;
}

function applyVisit(char, parsed, raw, unread, meta = {}) {
    const home = getHome(char);
    const p = parsed && typeof parsed === 'object' ? parsed : {};
    const spotIds = new Set((home.house?.furniture || []).map(f => f.id));
    const spot = spotIds.has(String(p.spot)) ? String(p.spot) : '';
    const visit = {
        id: uid('v'),
        at: now(),
        activity: asText(p.activity, 16),
        mood: asText(p.mood, 8),
        spot,
        event: asText(p.event, 600) || (parsed ? '' : clip(String(raw || ''), 600)) || `${char?.name || '他'}回来了。`,
        options: (Array.isArray(p.options) ? p.options : []).map(o => asText(o, 24)).filter(Boolean).slice(0, 3),
        turns: [],
    };
    home.visits ||= [];
    home.visits.push(visit);
    home.presence = { atHome: true, activity: visit.activity, mood: visit.mood, spot, since: visit.at };
    home.lastVisitAt = visit.at;
    // 仅在实际成功生成装修反馈后确认消费，避免遗漏。
    if (p.note?.text && meta.hasChanges) home.changesSeenAt = visit.at;
    // 仅在实际写出回应时消费事件；失败时下次回家重试。
    if (meta.fingerprint && (p.note?.text || p.diary?.text || p.diary?.content)) {
        home.storyFingerprint = meta.fingerprint;
        home.processedStoryEvents = [...new Set([...(home.processedStoryEvents||[]),...(meta.eventKeys||[])])].slice(-200);
    }
    home.storyScanAt = visit.at;
    if (spot) {
        const f = home.house.furniture.find(x => x.id === spot);
        if (f) home.currentRoom = f.room;
    }

    // 没有生成回信的纸条保留未读，供下次回家或手动回复。
    const replies = Array.isArray(p.replies) ? p.replies : [];
    for (const n of unread) {
        const r = replies.find(x => String(x?.to) === n.id) || (unread.length === 1 ? replies[0] : null);
        const text = asText(r?.text, 400);
        if (text) {
            n.readAt = visit.at;
            const reply = { id: uid('n'), from: 'char', kind: n.kind, place: n.place, text, at: visit.at, replyTo: n.id, readAt: 0 };
            home.notes.push(reply);
            n.replyId = reply.id;
        }
    }
    if (p.note && typeof p.note === 'object') {
        const text = asText(p.note.text, 400);
        if (text) {
            home.notes.push({
                id: uid('n'),
                from: 'char',
                kind: NOTE_KINDS.includes(p.note.kind) ? p.note.kind : '日常',
                place: NOTE_PLACES.includes(p.note.place) ? p.note.place : '门边',
                text,
                at: visit.at,
                readAt: 0,
            });
        }
    }
    setHome(char, home);
    return visit;
}

// ---------------- 回应他 ----------------

const RESPOND_SYSTEM = `你在扮演角色，和用户在共同的家里相处。根据用户刚做的事，写出角色的反应。保持他的性格，短而具体。
叙述用第三人称写他，用「你」称呼用户。只输出一个 JSON 对象。`;

export async function respond(char, userAction, { signal, furnitureId = '' } = {}) {
    const home = getHome(char);
    const visit = home?.visits?.[home.visits.length - 1];
    if (!home?.house || !visit) throw new Error('他还没回家');
    const info = await gatherContext(char);
    const furniture = furnitureId ? home.house.furniture.find(f => f.id === furnitureId) : null;
    const user = `${contextBlock(info)}

# 你们的家
${houseSummary(home)}

# 刚才
${recentLog(home, 3)}

# 现在
他在：${home.presence?.activity || '家里'}
用户：${userAction}${furniture ? `（在「${furniture.name}」旁边）` : ''}

# 输出格式
{ "reply": "他的反应，1 到 3 句", "activity": "他接下来在做什么（8 字以内，可沿用）", "spot": "家具 id 或空", "options": ["你接下来可以做的事", "另一件"] }`;
    const raw = await generate({ system: RESPOND_SYSTEM, user, signal });
    const parsed = parseJsonLoose(raw);
    const p = parsed && typeof parsed === 'object' ? parsed : {};
    const fresh = getHome(char);
    const last = fresh.visits[fresh.visits.length - 1];
    const reply = asText(p.reply, 600) || (parsed ? '' : clip(String(raw || ''), 600)) || '……';
    last.turns ||= [];
    last.turns.push({ user: userAction, reply, at: now() });
    last.options = (Array.isArray(p.options) ? p.options : []).map(o => asText(o, 24)).filter(Boolean).slice(0, 3);
    const activity = asText(p.activity, 16);
    if (activity) fresh.presence.activity = activity;
    const ids = new Set(fresh.house.furniture.map(f => f.id));
    if (ids.has(String(p.spot))) fresh.presence.spot = String(p.spot);
    else if (furnitureId && ids.has(furnitureId)) fresh.presence.spot = furnitureId;
    setHome(char, fresh);
    return last;
}

// ---------------- 纸条 ----------------

export function postNote(char, { kind, place, text, deferred }) {
    const home = getHome(char);
    const note = {
        id: uid('n'),
        from: 'user',
        kind: NOTE_KINDS.includes(kind) ? kind : '日常',
        place: NOTE_PLACES.includes(place) ? place : '门边',
        text: String(text || '').trim(),
        at: now(),
        deferred: !!deferred,
        readAt: 0,
    };
    home.notes ||= [];
    home.notes.push(note);
    setHome(char, home);
    return note;
}

const NOTE_SYSTEM = `你在扮演角色。用户在你们共同的家里给你留了一张手写纸条。写一张回信纸条：符合角色性格和说话方式，像真的手写纸条，简短、具体、有温度。
只输出纸条正文，不要加引号、标题或说明。`;

export async function replyToNote(char, noteId, { signal } = {}) {
    const home = getHome(char);
    const note = home?.notes?.find(n => n.id === noteId);
    if (!note) throw new Error('找不到这张纸条');
    const info = await gatherContext(char);
    const user = `${contextBlock(info)}

# 你们的家
${home.house ? `${home.house.name}。${home.house.story || ''}` : ''}

# 最近的纸条
${notesHistory(home)}

# 用户刚留下的纸条
类型：${note.kind}
贴在：${note.place}
内容：${note.text}

请写你的回信。`;
    const raw = await generate({ system: NOTE_SYSTEM, user, signal, maxTokens: 1024 });
    const parsed = parseJsonLoose(raw);
    const text = asText(parsed?.text || parsed?.reply, 400) || clip(String(raw || '').replace(/^["“]|["”]$/g, ''), 400);
    if(!text)throw new Error('模型没有返回纸条内容，请手动重试');
    const fresh = getHome(char);
    const target = fresh.notes.find(n => n.id === noteId);
    if(target.replyId)throw new Error('这张纸条已经回复过了');
    const reply = { id: uid('n'), from: 'char', kind: target.kind, place: target.place, text, at: now(), replyTo: target.id, readAt: 0 };
    target.readAt = reply.at;
    target.replyId = reply.id;
    fresh.notes.push(reply);
    setHome(char, fresh);
    return reply;
}

// 用户手动邀请 char 留纸条；不会触发回家或改动装修。
export async function writeCharNote(char,{signal}={}) {
    const home=getHome(char);if(!home?.house)throw new Error('还没有家');
    const info=await gatherContext(char);
    const user=`${contextBlock(info)}\n# 小屋\n${houseSummary(home)}\n# 最近的纸条\n${notesHistory(home)}\n请主动留一张简短的日常纸条。只输出 JSON：{ "kind":"日常", "place":"门边", "text":"纸条正文" }。`;
    const raw=await generate({system:VISIT_SYSTEM,user,signal,maxTokens:1000});
    const p=parseJsonLoose(raw);const body=asText(p?.text,400);
    if(!body)throw new Error('模型未生成有效纸条，请重试');
    const fresh=getHome(char);
    const note={id:uid('n'),from:'char',kind:NOTE_KINDS.includes(p.kind)?p.kind:'日常',place:NOTE_PLACES.includes(p.place)?p.place:'门边',text:body,at:now(),readAt:0};
    fresh.notes||=[];fresh.notes.push(note);setHome(char,fresh);return note;
}

export function markCharNotesRead(char) {
    const home = getHome(char);
    if (!home) return;
    let changed = false;
    for (const n of home.notes || []) {
        if (n.from === 'char' && !n.readAt) {
            n.readAt = now();
            changed = true;
        }
    }
    if (changed) setHome(char, home);
}

export function unreadFromChar(home) {
    return (home?.notes || []).filter(n => n.from === 'char' && !n.readAt).length;
}

// ---------------- 回家时机 ----------------

export function shouldAutoVisit(home) {
    const s = getSettings();
    if (s.visitMode !== 'open' || !home?.house) return false;
    if (!home.lastVisitAt) return true;
    return Date.now() - home.lastVisitAt >= s.visitGapMinutes * 60000;
}

export function isAway(home) {
    if (!home?.lastVisitAt) return true;
    const s = getSettings();
    // 隔了很久没回家，就当他出门了
    const gap = Math.max(60, s.visitGapMinutes) * 60000;
    return Date.now() - home.lastVisitAt >= gap;
}

// ---------------- 布置 ----------------

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

const SUGGEST_SYSTEM = `你在扮演角色，和用户一起布置你们共同的家。按你的性格、习惯和喜好，挑几件你想放进这个房间的东西，并用你自己的口吻说一句为什么。
只输出一个 JSON 对象。`;

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
    const fresh = getHome(char);
    fresh.suggestions = { roomId, at: now(), items };
    setHome(char, fresh);
    return items;
}

const DESCRIBE_SYSTEM = `你是家具设计师。把用户描述的一件家具或摆设，对应到给定的类型里最接近的一种，并起一个具体的名字、选一个颜色。只输出一个 JSON 对象。`;

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

const LOOK_SYSTEM = `你是角色设计师。根据角色设定里的外貌描写与用户确认的外貌，定下这个角色的 Q 版小人外形。只输出一个 JSON 对象。`;

export async function generateLook(char, { signal } = {}) {
    const info = await gatherContext(char);
    const user = `${contextBlock(info, { withRecent: false })}

# 要求
固定画风：${themeName(homeTheme(getHome(char)))}。用户确认的外貌：${getHome(char)?.appearance || "以角色卡为准"}。
按「${info.char.name}」的外貌定下小人的样子；描写里没提到的部分，按他的气质挑合适的颜色。颜色用 #RRGGBB。

# 输出格式
{ ${LOOK_PROMPT} }`;
    const raw = await generate({ system: LOOK_SYSTEM, user, signal, maxTokens: 800 });
    const parsed = parseJsonLoose(raw);
    const look = parsed?.look && typeof parsed.look === 'object' ? parsed.look : parsed;
    const home = getHome(char);
    home.look = normalizeLook(look, char?.name);
    setHome(char, home);
    return home.look;
}

// ---------------- 交换日记 ----------------

export const WEATHERS = ['晴', '多云', '阴', '小雨', '大雨', '雪', '雾', '起风'];
export const DIARY_MODES = [
    { id: 'visit', label: '他回家时' },
    { id: 'manual', label: '只手动写' },
];

const DIARY_FORMAT = '{ "weather": "' + WEATHERS.join('/') + ' 之一", "text": "他的日记正文，第一人称，像真的手写日记，可以回应你上一篇里写的事", "stamp": "可选：2 到 4 个字的小印章，比如「书店」，不想盖就空" }';

export function todayKey(ts = Date.now()) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getDiary(home) {
    if (!home) return { mode: 'visit', entries: [], readAt: 0 };
    if (!home.diary || typeof home.diary !== 'object') home.diary = { mode: 'visit', entries: [], readAt: 0 };
    if (!DIARY_MODES.some(m => m.id === home.diary.mode)) home.diary.mode = 'visit';
    if (!Array.isArray(home.diary.entries)) home.diary.entries = [];
    return home.diary;
}

export function charTurn(home) {
    const entries = getDiary(home).entries;
    return entries.length > 0 && entries[entries.length - 1].author === 'user';
}

export function unreadDiary(home) {
    const d = getDiary(home);
    return d.entries.filter(e => e.author === 'char' && e.at > (Number(d.readAt) || 0)).length;
}

export function markDiaryRead(char) {
    const home = getHome(char);
    if (!home || !unreadDiary(home)) return;
    getDiary(home).readAt = now();
    setHome(char, home);
}

export function setDiaryMode(char, mode) {
    const home = getHome(char);
    if (!home) return;
    getDiary(home).mode = DIARY_MODES.some(m => m.id === mode) ? mode : 'visit';
    setHome(char, home);
}

export function addUserEntry(char, { weather, text, quote }) {
    const home = getHome(char);
    const d = getDiary(home);
    const entry = {
        id: uid('d'),
        author: 'user',
        date: todayKey(),
        weather: WEATHERS.includes(weather) ? weather : '',
        text: String(text || '').trim(),
        quote: quote && quote.text ? { name: clip(quote.name, 20), text: clip(quote.text, 200) } : null,
        at: now(),
    };
    d.entries.push(entry);
    if (d.entries.length > 400) d.entries = d.entries.slice(-400);
    setHome(char, home);
    return entry;
}

function applyCharDiary(home, raw, rawText) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const text = asText(r.text || r.content, 1200) || clip(String(rawText || ''), 1200);
    if (!text) return null;
    const d = getDiary(home);
    const entry = {
        id: uid('d'),
        author: 'char',
        date: todayKey(),
        weather: WEATHERS.includes(r.weather) ? r.weather : '',
        text,
        stamp: asText(r.stamp, 4),
        at: now(),
    };
    d.entries.push(entry);
    return entry;
}

function diaryContext(home, n = 4) {
    const entries = getDiary(home).entries.slice(-n);
    if (!entries.length) return '';
    return '最近几篇日记：\n' + entries.map(e => {
        const who = e.author === 'user' ? '用户' : '他';
        const quote = e.quote ? `（引用了聊天里${e.quote.name}的话：「${e.quote.text}」）` : '';
        return `[${e.date}${e.weather ? ' ' + e.weather : ''}] ${who}写：${e.text}${quote}`;
    }).join('\n');
}

const DIARY_SYSTEM = `你在扮演角色，和用户在共同的家里写交换日记。用第一人称，按角色的性格和说话方式写一篇真实的手写日记：写今天的小事和心情，自然地回应用户上一篇里写到的东西。只输出一个 JSON 对象。`;

export async function writeCharDiary(char, { signal } = {}) {
    const home = getHome(char);
    if (!home) throw new Error('还没有家');
    const info = await gatherContext(char);
    const user = `${contextBlock(info)}

# 你们的家
${houseSummary(home)}

# 最近在家里发生的事
${recentLog(home, 3) || '（还没有）'}

# 最近的纸条
${notesHistory(home, 4) || '（还没有）'}

# 交换日记
${diaryContext(home, 6) || '（本子还是空的）'}

# 现在
${nowLine()}，轮到你写了。

# 输出格式
${DIARY_FORMAT}`;
    const raw = await generate({ system: DIARY_SYSTEM, user, signal, maxTokens: 2000 });
    const parsed = parseJsonLoose(raw);
    const fresh = getHome(char);
    const entry = applyCharDiary(fresh, parsed, parsed ? '' : raw);
    setHome(char, fresh);
    if (!entry) throw new Error('他这次没写出来，可以再叫他写一次。');
    return entry;
}

export function shouldAutoDiary(home) {
    // 自动日记仅在 char 回家时生成，不在打开日记页面时触发。
    return false;
}
