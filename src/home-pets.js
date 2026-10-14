// 梦想家 · 小家伙们：领养、种植、照顾，植物长大时他的纸条，回家时一起写的宠物纸条，照描述画一只
import { uid, now, parseJsonLoose, asText, clip, daysSince, hexOr } from './util.js?mxj=0.8.0';
import { generate } from './api.js?mxj=0.8.0';
import { gatherContext, contextBlock } from './character.js?mxj=0.8.0';
import { getHome, setHome } from './settings.js?mxj=0.8.0';
import { PET_NOTE_SYSTEM, PET_DRAW_SYSTEM } from './home-prompts.js?mxj=0.8.0';
import { liveHome, houseSummary, notesHistory } from './home-shared.js?mxj=0.8.0';
import { homeTheme } from './theme.js?mxj=0.8.0';
import { ART_STYLES, ART_NEGATIVE } from './art.js?mxj=0.8.0';
import { requestImage, saveImage } from './imageApi.js?mxj=0.8.0';
import { cleanBackground } from './cutout.js?mxj=0.8.0';
import { roomTypeOf } from './home-rooms.js?mxj=0.8.0';
import {
    MAX_ANIMALS, MAX_PLANTS, CAT_COATS, DOG_COATS, PLANT_KINDS, TIME,
    animalStatus, animalRoom, animalLabel, genderLabel, plantStatus, stageFor, pickMischief,
    GEAR, gearTypeOf, gearSummary,
} from './pets-data.js?mxj=0.8.0';

export function getPets(home) {
    if (!home) return { animals: [], plants: [], events: [] };
    if (!home.pets || typeof home.pets !== 'object') home.pets = {};
    const p = home.pets;
    if (!Array.isArray(p.animals)) p.animals = [];
    if (!Array.isArray(p.plants)) p.plants = [];
    if (!Array.isArray(p.events)) p.events = [];
    return p;
}

function roomOk(home, roomId) {
    const rooms = home.house?.rooms || [];
    return rooms.some(r => r.id === roomId) ? roomId : (rooms[0]?.id || '');
}

function pushEvent(pets, about, text, extra = {}) {
    pets.events.push({ at: now(), about, text, ...extra });
    if (pets.events.length > 20) pets.events = pets.events.slice(-20);
}

export function findPet(home, id) {
    const pets = getPets(home);
    return pets.animals.find(a => a.id === id) || pets.plants.find(p => p.id === id) || null;
}

// ---------------- 领养、种植 ----------------

export async function adoptAnimal(char, opts = {}, { signal } = {}) {
    const home = liveHome(char);
    if (getPets(home).animals.length >= MAX_ANIMALS) throw new Error(`最多养 ${MAX_ANIMALS} 只小动物`);
    const kind = ['cat', 'dog', 'custom'].includes(opts.kind) ? opts.kind : 'cat';
    let art = null;
    if (kind === 'custom') {
        if (!opts.dataUrl) throw new Error('先画出来，满意了再领养');
        opts = { ...opts, anchors: await detectPetAnchors(opts.dataUrl) };
        const path = await saveImage(opts.dataUrl, char?.name || home.charName, { signal, pixelArt: homeTheme(home) === 'pixel' });
        art = { path, prompt: opts.prompt || '' };
    }
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
    const fresh = liveHome(char);
    const pets = getPets(fresh);
    if (pets.animals.length >= MAX_ANIMALS) throw new Error(`最多养 ${MAX_ANIMALS} 只小动物`);
    const table = kind === 'dog' ? DOG_COATS : CAT_COATS;
    const t = now();
    const animal = {
        id: uid('a'),
        kind,
        coat: kind === 'custom' ? '' : (table[opts.coat] ? opts.coat : Object.keys(table)[0]),
        name: clip(String(opts.name || '').trim(), 8) || (kind === 'dog' ? '豆包' : kind === 'cat' ? '团子' : '小家伙'),
        gender: opts.gender === 'boy' ? 'boy' : 'girl',
        room: roomOk(fresh, opts.room),
        adoptedAt: t,
        placedAt: t,
    };
    if (kind === 'custom') {
        animal.habit = opts.habit === 'dog' ? 'dog' : 'cat';
        animal.species = clip(String(opts.species || '').trim(), 8) || '小家伙';
        animal.desc = clip(String(opts.desc || '').trim(), 200);
        animal.art = art;
        animal.anchors = opts.anchors || null;
    }
    pets.animals.push(animal);
    pushEvent(pets, animal.id, `你领养了${animal.name}（${animalLabel(animal)}，${genderLabel(animal)}）`);
    setHome(char, fresh);
    return animal;
}

export function plantNew(char, { kind, name, room } = {}) {
    const home = liveHome(char);
    const pets = getPets(home);
    if (pets.plants.length >= MAX_PLANTS) throw new Error(`最多养 ${MAX_PLANTS} 盆植物`);
    const k = PLANT_KINDS[kind] ? kind : 'mint';
    const roomId = roomOk(home, room);
    // 同一间房里的盆栽错开摆
    const used = pets.plants.filter(p => p.room === roomId).map(p => Number(p.x) || 50);
    const x = [14, 86, 28, 72, 42, 58, 50].find(c => used.every(u => Math.abs(u - c) >= 10)) ?? 50;
    const t = now();
    const plant = {
        id: uid('p'),
        kind: k,
        name: clip(String(name || '').trim(), 8) || PLANT_KINDS[k].label,
        room: roomId,
        x,
        plantedAt: t,
        waters: [],
        fertAt: 0,
        points: 0,
        stage: 0,
        stageAt: { 0: t },
        stageNotes: {},
    };
    pets.plants.push(plant);
    pushEvent(pets, plant.id, `你种了一盆${PLANT_KINDS[k].label}${plant.name !== PLANT_KINDS[k].label ? `，叫${plant.name}` : ''}`);
    setHome(char, home);
    return plant;
}

export function removePet(char, id) {
    const home = getHome(char);
    const pets = getPets(home);
    pets.animals = pets.animals.filter(a => a.id !== id);
    pets.plants = pets.plants.filter(p => p.id !== id);
    pets.events = pets.events.filter(e => e.about !== id);
    setHome(char, home);
}

// ---------------- 照顾 ----------------

// act：feed 喂食 / water 换水 / walk 散步（by：user 我去遛，char 让他去遛）
export function careAnimal(char, id, act, { by = 'user', charName = '他' } = {}) {
    const home = getHome(char);
    const pets = getPets(home);
    const a = pets.animals.find(x => x.id === id);
    if (!a) throw new Error('找不到它了');
    const st = animalStatus(a);
    const t = now();
    let msg = '';
    if (act === 'feed') {
        if (st.fedToday) return `${a.name}今天已经喂过了`;
        a.fedAt = t;
        pushEvent(pets, a.id, `你喂了${a.name}`);
        msg = `喂好了，${a.name}吃得很香`;
    } else if (act === 'water') {
        if (st.waterToday) return `${a.name}的水今天换过了`;
        a.waterAt = t;
        pushEvent(pets, a.id, `你给${a.name}换了水`);
        msg = `换好水了`;
    } else if (act === 'walk') {
        if (!st.needsWalk) return `${a.name}不用遛`;
        if (st.walkedToday) return `${a.name}今天已经出去过了`;
        a.walkedAt = t;
        a.walkedBy = by === 'char' ? 'char' : 'user';
        pushEvent(pets, a.id, by === 'char' ? `${charName}带${a.name}出去散步了` : `你带${a.name}出去散步了`, { walk: a.walkedBy });
        msg = by === 'char' ? `${charName}牵着${a.name}出门了` : `遛完回来了，${a.name}很开心`;
    } else {
        throw new Error('不认识的照顾方式');
    }
    setHome(char, home);
    return msg;
}

// 把它抱到别的房间：先在那儿待一会儿，之后又会自己溜达
export function moveAnimal(char, id, roomId) {
    const home = getHome(char);
    const a = getPets(home).animals.find(x => x.id === id);
    if (!a) throw new Error('找不到它了');
    a.room = roomOk(home, roomId);
    a.placedAt = now();
    if (a.mischief) a.mischief.room = a.room;
    setHome(char, home);
    return a;
}

function grow(home, p, gained, t) {
    const before = Number(p.stage) || 0;
    p.points = (Number(p.points) || 0) + gained;
    const max = PLANT_KINDS[p.kind].stages.length - 1;
    const stage = Math.min(max, Math.max(before, stageFor(p.points)));
    let stageUp = null;
    if (stage > before) {
        p.stage = stage;
        p.stageAt ||= {};
        p.stageAt[stage] = t;
        stageUp = stage;
    }
    if (!plantStatus(p, t).trouble) p.troubleSeen = '';
    return stageUp;
}

// 浇水：当天第一次算一次照顾；一天浇好几次会浇太多
export function waterPlant(char, id) {
    const home = getHome(char);
    const pets = getPets(home);
    const p = pets.plants.find(x => x.id === id);
    if (!p) throw new Error('找不到这盆了');
    const t = now();
    const before = plantStatus(p, t);
    p.waters = [...(p.waters || []), t].slice(-14);
    const gained = !before.wateredToday && before.trouble !== 'soggy' ? 1 : 0;
    if (before.wateredToday) pushEvent(pets, p.id, `你今天又给${p.name}浇了一次水`);
    const stageUp = grow(home, p, gained, t);
    setHome(char, home);
    const after = plantStatus(p, t);
    const msg = after.trouble === 'soggy' ? `${p.name}的土已经湿透了，这几天先别浇了`
        : before.wateredToday ? `今天已经浇过了，再浇就太多了`
        : before.trouble === 'dry' ? `${p.name}喝饱了，会慢慢精神起来` : '浇好了';
    return { stageUp, msg };
}

export function fertilizePlant(char, id) {
    const home = getHome(char);
    const p = getPets(home).plants.find(x => x.id === id);
    if (!p) throw new Error('找不到这盆了');
    const t = now();
    const st = plantStatus(p, t);
    if (st.trouble) throw new Error(`${p.name}${st.troubleText}，先别施肥，等它缓过来`);
    if (!st.fertDue) throw new Error(`还要 ${st.fertInDays} 天才能再施肥`);
    p.fertAt = t;
    const stageUp = grow(home, p, 2, t);
    setHome(char, home);
    return { stageUp, msg: '施好肥了' };
}

// ---------------- 装扮 ----------------

// 戴上或摘下：by 是 char（他戴的，来自日记、纸条、回家、回应）或 user（你在装扮页戴的）
export function applyGear(home, list, by = 'char', charName = '他') {
    const pets = getPets(home);
    const entries = Array.isArray(list) ? list : (list && typeof list === 'object' ? [list] : []);
    const clean = v => String(v ?? '').replace(/^\s*(?:id\s*[=:：]\s*)?/i, '').replace(/[「」"'`\s]/g, '');
    const done = [];
    for (const e of entries.slice(0, 4)) {
        if (!e || typeof e !== 'object') continue;
        const item = asText(e.item || e.name, 12);
        const a = pets.animals.find(x => x.id === clean(e.about || e.id)) || pets.animals.find(x => item && String(e.about || '').includes(x.name));
        if (!a) continue;
        const type = gearTypeOf(`${item} ${e.type || ''}`, e.type);
        if (!type) continue;
        a.gear = Array.isArray(a.gear) ? a.gear : [];
        const slot = GEAR[type].slot;
        if (e.remove === true || e.remove === 'true') {
            const before = a.gear.length;
            // 说摘下的是哪一种就摘哪一种；身上没有这一种，就摘同一个位置上的那件
            a.gear = a.gear.some(g => g.type === type) ? a.gear.filter(g => g.type !== type) : a.gear.filter(g => GEAR[g.type]?.slot !== slot);
            if (a.gear.length !== before) { pushEvent(pets, a.id, `${by === 'char' ? charName : '你'}给${a.name}摘下了${item || GEAR[type].label}`); done.push(a.name); }
            continue;
        }
        a.gear = a.gear.filter(g => GEAR[g.type]?.slot !== slot);
        a.gear.push({ type, color: hexOr(e.color, GEAR[type].color), item: item || GEAR[type].label, by: by === 'user' ? 'user' : 'char', at: now() });
        pushEvent(pets, a.id, `${by === 'char' ? charName : '你'}给${a.name}戴上了${item || GEAR[type].label}`);
        done.push(a.name);
    }
    return done;
}

export function dressAnimal(char, id, type, color) {
    const home = getHome(char);
    if (!GEAR[type]) throw new Error('不认识的装扮');
    const done = applyGear(home, [{ about: id, type, color, item: GEAR[type].label }], 'user');
    if (!done.length) throw new Error('找不到它了');
    setHome(char, home);
}

export function undressAnimal(char, id, type) {
    const home = getHome(char);
    const a = getPets(home).animals.find(x => x.id === id);
    if (!a) throw new Error('找不到它了');
    const g = (a.gear || []).find(x => x.type === type);
    a.gear = (a.gear || []).filter(x => x.type !== type);
    if (g) pushEvent(getPets(home), a.id, `你给${a.name}摘下了${g.item || GEAR[type]?.label || ''}`);
    setHome(char, home);
}

// 画出来的宠物：存它脖子、头顶在图上的位置（0–1），拖动调整后标成 manual
export function setPetAnchors(char, id, anchors) {
    const home = getHome(char);
    const a = getPets(home).animals.find(x => x.id === id);
    if (!a) return;
    a.anchors = { ...(a.anchors || {}), ...anchors };
    setHome(char, home);
}

// 从去掉背景的图里找头顶和脖子：从上往下扫，头和身子之间最窄的那一行算脖子
export async function detectPetAnchors(src) {
    const fallback = { ar: 1, neck: { x: 0.5, y: 0.48, w: 0.3 }, head: { x: 0.5, y: 0.06 }, auto: true, guessed: true };
    try {
        const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
        const W = img.naturalWidth, H = img.naturalHeight;
        if (!W || !H) return fallback;
        const scale = Math.min(1, 200 / Math.max(W, H));
        const w = Math.max(1, Math.round(W * scale)), h = Math.max(1, Math.round(H * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const c = canvas.getContext('2d', { willReadFrequently: true });
        c.drawImage(img, 0, 0, w, h);
        const d = c.getImageData(0, 0, w, h).data;
        const rows = [];
        let transparent = 0;
        for (let y = 0; y < h; y++) {
            let l = -1, r = -1;
            for (let x = 0; x < w; x++) {
                const al = d[(y * w + x) * 4 + 3];
                if (al < 250) transparent++;
                if (al > 60) { if (l < 0) l = x; r = x; }
            }
            rows.push(l < 0 ? null : { l, r, width: r - l + 1 });
        }
        const out = { ...fallback, ar: W / H };
        // 没有透明底（用了原图）就只能猜
        if (transparent < w * h * 0.05) return out;
        const top = rows.findIndex(Boolean);
        let bottom = h - 1;
        while (bottom > top && !rows[bottom]) bottom--;
        if (top < 0 || bottom - top < 10) return out;
        const span = bottom - top;
        const maxW = Math.max(...rows.filter(Boolean).map(r => r.width));
        let best = null;
        for (let y = Math.round(top + span * 0.22); y <= Math.round(top + span * 0.62); y++) {
            const row = rows[y];
            if (!row || row.width < maxW * 0.15) continue;
            if (!best || row.width < best.width) best = { ...row, y };
        }
        const headRow = rows.slice(top, top + Math.max(2, Math.round(span * 0.08))).filter(Boolean);
        const headX = headRow.length ? headRow.reduce((s, r) => s + (r.l + r.r) / 2, 0) / headRow.length : w / 2;
        if (best) out.neck = { x: (best.l + best.r) / 2 / w, y: best.y / h, w: Math.min(0.6, best.width / w * 0.9) };
        else out.neck = { x: 0.5, y: (top + span * 0.42) / h, w: 0.3 };
        out.head = { x: headX / w, y: (top + span * 0.05) / h };
        out.guessed = false;
        return out;
    } catch {
        return fallback;
    }
}

// 给模型看的：小家伙们和它们戴着什么，以及 petGear 的写法
export function petsBrief(home) {
    const animals = home?.pets?.animals || [];
    if (!animals.length) return '';
    return animals.map(a => `- ${a.name}（${animalLabel(a)}，id=${a.id}）${gearSummary(a) ? `：戴着${gearSummary(a)}` : ''}`).join('\n');
}
export const PET_GEAR_FORMAT = `"petGear": [ { "about": "小家伙的 id", "item": "戴了什么（如：红绳平安结）", "type": "${Object.keys(GEAR).join('/')} 之一", "color": "#RRGGBB", "remove": false } ]`;
export const PET_GEAR_RULE = '如果他这次在场景、纸条或日记里给小家伙戴上了什么（项圈、铃铛、平安结、蝴蝶结、小帽子之类），或者摘了下来，写进 petGear（摘下来 remove 填 true）；没有就是空数组。';
// 在一个 JSON 格式说明的最后一个 } 前面加上 petGear
export function withPetGear(format) {
    const i = format.lastIndexOf('}');
    return i < 0 ? format : `${format.slice(0, i).trimEnd()}, ${PET_GEAR_FORMAT} }`;
}

// ---------------- 植物长大：他留一张纸条（一次调用） ----------------

export async function writeStageNote(char, plantId, stage, { signal } = {}) {
    const home = getHome(char);
    const p = getPets(home).plants.find(x => x.id === plantId);
    if (!p) throw new Error('找不到这盆了');
    const kind = PLANT_KINDS[p.kind];
    const roomName = home.house?.rooms.find(r => r.id === p.room)?.name || '家里';
    const info = await gatherContext(char);
    const user = `${contextBlock(info, { withRecent: false })}

# 你们的家
${houseSummary(home)}

# 最近的纸条
${notesHistory(home) || '（还没有纸条）'}

# 刚发生的事
${roomName}的${p.name}（${kind.label}）刚长到了「${kind.stages[stage]}」。它是 ${daysSince(p.plantedAt)} 天前种下的，你们一起照顾到现在。

# 输出格式
{ "place": "纸条贴在哪（6 字以内，如：花盆上）", "text": "纸条内容（60 字以内）" }`;
    const raw = await generate({ system: PET_NOTE_SYSTEM, user, signal, maxTokens: 800 });
    const parsed = parseJsonLoose(raw);
    const text = asText(parsed?.text || parsed?.note, 300) || (parsed ? '' : clip(String(raw || '').replace(/^["“]|["”]$/g, '').trim(), 300));
    if (!text) throw new Error('模型没有写出纸条，它长大的事已经记下了');
    const fresh = liveHome(char);
    const target = getPets(fresh).plants.find(x => x.id === plantId);
    if (!target) throw new Error('这盆已经不在了，纸条没有保存');
    const note = {
        id: uid('n'), from: 'char', kind: '日常',
        place: asText(parsed?.place, 8) || '花盆上',
        text, at: now(), readAt: 0,
        about: { id: target.id, name: target.name, type: 'plant', tag: kind.stages[stage], stage },
    };
    fresh.notes ||= [];
    fresh.notes.push(note);
    target.stageNotes ||= {};
    target.stageNotes[stage] = note.id;
    setHome(char, fresh);
    return note;
}

// ---------------- 照描述画一只（一次文字调用 + 一张图） ----------------

export function petImagePrompt(theme, description) {
    return `${ART_STYLES[theme] || ART_STYLES.pixel}, one single small cute pet animal, full body, sitting, side view, centered, isolated on plain white background, no people, no text, ${description}`;
}

export async function drawPetImage(prompt, theme, { signal } = {}) {
    const result = await requestImage(prompt, { negative: `${ART_NEGATIVE}, human, person, multiple animals`, shape: 'square', signal });
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
    const cut = await cleanBackground(result.dataUrl, { keyed: false, hard: theme === 'pixel' });
    return { dataUrl: cut.dataUrl, rawDataUrl: result.dataUrl, cutout: cut.cutout };
}

export async function drawCustomPet(char, desc, { signal } = {}) {
    const home = getHome(char);
    const theme = homeTheme(home);
    const wish = String(desc || '').trim();
    if (!wish) throw new Error('先写一写想要什么样的');
    const raw = await generate({
        system: PET_DRAW_SYSTEM,
        user: `用户想要的宠物：${wish}\n\n输出格式：{ "species": "它是什么动物（中文，6 字以内，如：小狐狸）", "prompt": "英文生图描述" }`,
        signal,
        maxTokens: 600,
    }).catch(error => {
        if (signal?.aborted) throw error;
        throw new Error(`整理描述时文字接口出错，还没开始画：${error?.message || error}`);
    });
    const parsed = parseJsonLoose(raw);
    const english = asText(parsed?.prompt || parsed?.description, 600) || (parsed ? '' : clip(String(raw || '').trim(), 600)) || wish;
    const species = asText(parsed?.species, 8);
    const prompt = petImagePrompt(theme, english);
    const image = await drawPetImage(prompt, theme, { signal });
    return { species, prompt, theme, ...image };
}

// ---------------- 回家时一起写的宠物纸条 ----------------

// 给回家那次调用加一段：小家伙们现在怎么样、他不在时干了什么、要不要写纸条
export function petVisitBlock(home, { t = now(), rnd = Math.random } = {}) {
    const pets = home?.pets;
    if (!pets || (!pets.animals?.length && !pets.plants?.length)) return { text: '', meta: null };
    const rooms = home.house?.rooms || [];
    const rn = id => rooms.find(r => r.id === id)?.name || '家里';
    const lines = [];
    for (const a of pets.animals || []) {
        const st = animalStatus(a, t);
        const parts = [`在${rn(animalRoom(a, rooms, t))}`, st.fedToday ? '今天喂过了' : '今天还没喂', st.waterToday ? '换过水' : '还没换水'];
        if (st.needsWalk) parts.push(st.walkedToday ? '遛过了' : '今天还没遛');
        if (st.full <= 1) parts.push('饿得直叫');
        if (gearSummary(a)) parts.push(`戴着${gearSummary(a)}`);
        lines.push(`- ${a.name}（${animalLabel(a)}，${genderLabel(a)}，id=${a.id}）：${parts.join('，')}`);
    }
    for (const p of pets.plants || []) {
        const st = plantStatus(p, t);
        lines.push(`- ${p.name}（${PLANT_KINDS[p.kind].label}，id=${p.id}）：在${rn(p.room)}，${st.stageName}${st.trouble ? `，${st.troubleText}` : ''}`);
    }
    const must = [];
    // 捣蛋：每次回家最多一件
    const naughty = (pets.animals || []).filter(a => t - (Number(a.adoptedAt) || t) > 2 * TIME.HOUR && t - (a.mischief?.at || 0) > 8 * TIME.HOUR);
    let mischief = null;
    for (const a of naughty) {
        if (rnd() < 0.3) { mischief = { id: a.id, name: a.name, text: pickMischief(a, rnd), room: animalRoom(a, rooms, t) }; break; }
    }
    if (mischief) must.push({ id: mischief.id, what: `${mischief.name}在${rn(mischief.room)}捣蛋：${mischief.text}`, tag: '捣蛋了' });
    for (const p of pets.plants || []) {
        const st = plantStatus(p, t);
        if (st.trouble && p.troubleSeen !== st.trouble) must.push({ id: p.id, what: `${p.name}${st.troubleText}`, tag: st.trouble === 'soggy' ? '浇太多了' : '蔫了', trouble: st.trouble });
    }
    const rainy = (pets.plants || []).filter(p => ['balcony', 'terrace', 'yard', 'garden'].includes(roomTypeOf(rooms.find(r => r.id === p.room))));
    if (rainy.length && must.length < 2 && rnd() < 0.12) {
        const p = rainy[Math.floor(rnd() * rainy.length) % rainy.length];
        must.push({ id: p.id, what: `昨晚下了场大雨，没人把${p.name}搬进屋，它在${rn(p.room)}淋了一夜`, tag: '淋了雨' });
    }
    const seen = Number(pets.eventsSeenAt) || 0;
    const events = (pets.events || []).filter(e => e.at > seen).slice(-8);
    const ask = must.length > 0 || rnd() < (events.some(e => e.walk === 'char') ? 0.6 : events.length ? 0.35 : 0.15);
    const pick = must.slice(0, 2);
    let text = `# 家里的小家伙们\n${lines.join('\n')}`;
    if (pick.length) text += `\n# 他不在家时，小家伙们出的事\n${pick.map(m => `- ${m.what}`).join('\n')}`;
    if (events.length) text += `\n# 最近对小家伙们的照顾\n${events.map(e => `- ${e.text}`).join('\n')}`;
    text += pick.length
        ? `\n这次要用 petNotes 写纸条：${pick.map(m => m.what).join('；')}。每件一张，最多 2 张，about 填它的 id。纸条是他写给你的，语气符合他的性格，可以抱怨、吐槽、撒娇或幽默。`
        : ask ? '\n可以用 petNotes 写一张和小家伙们有关的纸条（比如照顾它们时的小事、他带狗散步时遇到的事），一张就够，about 填它的 id。'
        : '\n这次 petNotes 留空。';
    if ((pets.animals || []).length) text += `\n${PET_GEAR_RULE}`;
    return {
        text,
        meta: {
            mischief,
            must: pick,
            eventsUpTo: events.reduce((m, e) => Math.max(m, e.at), seen),
        },
    };
}

export function applyPetVisit(home, petNotes, meta, at = now(), { gear = null, charName = '他' } = {}) {
    if (!meta) return;
    const pets = getPets(home);
    if (gear) applyGear(home, gear, 'char', charName);
    if (meta.mischief) {
        const a = pets.animals.find(x => x.id === meta.mischief.id);
        if (a) {
            a.mischief = { text: meta.mischief.text, at, room: meta.mischief.room };
            a.mischiefLog = [...(a.mischiefLog || []), meta.mischief.text].slice(-6);
        }
    }
    for (const m of meta.must || []) {
        const p = m.trouble ? pets.plants.find(x => x.id === m.id) : null;
        if (p) p.troubleSeen = m.trouble;
    }
    // 自己缓过来的（浇太多过了几天就好了）也清掉记号，下次再蔫还会说
    for (const p of pets.plants) if (!plantStatus(p, at).trouble) p.troubleSeen = '';
    pets.eventsSeenAt = Math.max(Number(pets.eventsSeenAt) || 0, meta.eventsUpTo || 0);
    const list = Array.isArray(petNotes) ? petNotes : (petNotes && (typeof petNotes === 'object' || typeof petNotes === 'string') ? [petNotes] : []);
    const all = [...pets.animals, ...pets.plants];
    const clean = v => String(v ?? '').replace(/^\s*(?:id\s*[=:：]\s*)?/i, '').replace(/[「」"'`\s]/g, '');
    home.notes ||= [];
    for (const [i, n] of list.slice(0, 2).entries()) {
        const text = asText(typeof n === 'string' ? n : (n?.text || n?.note), 300);
        if (!text) continue;
        let pet = all.find(x => x.id === clean(n?.about || n?.id));
        if (!pet && meta.must?.[i]) pet = all.find(x => x.id === meta.must[i].id);
        if (!pet) pet = all.find(x => text.includes(x.name));
        const must = pet ? (meta.must || []).find(m => m.id === pet.id) : null;
        home.notes.push({
            id: uid('n'), from: 'char', kind: '日常',
            place: asText(n?.place, 8) || (pet && pets.plants.includes(pet) ? '花盆上' : '门边'),
            text, at, readAt: 0,
            about: pet ? { id: pet.id, name: pet.name, type: pets.plants.includes(pet) ? 'plant' : 'animal', tag: must?.tag || '日常' } : { id: '', name: '', type: 'animal', tag: '小家伙们' },
        });
    }
}

export const PET_NOTES_FORMAT = `"petNotes": [ { "about": "小家伙的 id", "place": "贴在哪（6 字以内）", "text": "纸条内容" } ]`;
export const PET_VISIT_FORMAT = (hasAnimals) => hasAnimals ? `${PET_NOTES_FORMAT},\n  ${PET_GEAR_FORMAT}` : PET_NOTES_FORMAT;
