// 梦想家 · 小家伙们的数据和规则（只做计算，不存档、不生成）
// 动物：每天喂食、换水，像狗的每天要遛；会在各个房间之间溜达，偶尔捣蛋。
// 植物：每天浇水、隔几天施肥，攒够照顾就长到下一个阶段；忘了浇或浇太勤会蔫，照顾回来就好。

export const MAX_ANIMALS = 4;
export const MAX_PLANTS = 4;

const HOUR = 3600000;
const DAY = 24 * HOUR;
// 动物多久换一次房间
const SLOT = 90 * 60000;

export const CAT_COATS = {
    orange: { label: '橘', name: '橘猫', base: '#D99A4E', dark: '#B9762F', stripes: true },
    white: { label: '白', name: '白猫', base: '#F4F1EA', dark: '#D3CCBE' },
    black: { label: '黑', name: '黑猫', base: '#2E2A2A', dark: '#151212' },
    gray: { label: '灰', name: '灰猫', base: '#8E8E8E', dark: '#6A6A6A', stripes: true },
    calico: { label: '三花', name: '三花猫', base: '#F4F1EA', dark: '#D3CCBE', patches: ['#D99A4E', '#2E2A2A'] },
    cow: { label: '奶牛', name: '奶牛猫', base: '#F4F1EA', dark: '#D3CCBE', patches: ['#2E2A2A', '#2E2A2A'] },
};
export const DOG_COATS = {
    shiba: { label: '柴', name: '柴犬', base: '#C98A4B', dark: '#A86E36', belly: '#F4E1C4', ears: 'up', curl: true },
    white: { label: '白', name: '小白狗', base: '#F4F1EA', dark: '#D3CCBE', belly: '#FFFFFF', ears: 'up', curl: true },
    black: { label: '黑', name: '小黑狗', base: '#2E2A2A', dark: '#151212', belly: '#C98A4B', ears: 'up', curl: true },
    brown: { label: '棕', name: '小棕狗', base: '#7A5638', dark: '#5E412A', belly: '#D9B48A', ears: 'down' },
    cream: { label: '奶油', name: '奶油色小狗', base: '#E8C99A', dark: '#CFAE7C', belly: '#FFF6E6', ears: 'down' },
    spotted: { label: '斑点', name: '斑点狗', base: '#F4F1EA', dark: '#D3CCBE', belly: '#FFFFFF', ears: 'down', patches: ['#2E2A2A'] },
};

export const PLANT_KINDS = {
    cactus: { label: '仙人球', trait: '耐旱 · 会开花', fert: 7, pot: '#C9785A', stages: ['种下', '冒出新刺', '长高一圈', '长出花苞', '开花了'] },
    pothos: { label: '绿萝', trait: '好养 · 怕浇太多', fert: 5, pot: '#8FA9B8', stages: ['种下', '冒出新芽', '抽出藤蔓', '垂到盆外', '爬满一盆'] },
    mint: { label: '薄荷', trait: '长得快 · 能泡茶', fert: 5, pot: '#E2C38A', stages: ['种下', '发芽了', '长出新叶', '长满一盆', '开小白花'] },
    sunflower: { label: '向日葵', trait: '要晒太阳', fert: 4, pot: '#C9785A', stages: ['种下', '发芽了', '长高了', '结了花苞', '开花了'] },
    succulent: { label: '多肉', trait: '慢慢长', fert: 7, pot: '#D9D4C8', stages: ['种下', '扎根了', '冒出新叶', '长成一圈', '开花了'] },
    tomato: { label: '小番茄', trait: '会结果', fert: 4, pot: '#C9785A', stages: ['种下', '发芽了', '长高了', '开小黄花', '结果了'] },
};
// 长到每个阶段要攒的照顾：当天第一次浇水 +1，按时施肥 +2
export const STAGE_POINTS = [0, 3, 7, 12, 18];

// 捣蛋：模型照着这一句发挥，写成他的纸条
export const MISCHIEF = {
    cat: ['咬坏了他的手机充电线', '把桌上的水杯推到了地上', '在沙发扶手上磨爪子，抓花了一片', '在他的深色衣服上蹭了一身毛', '半夜从他脸上踩过去', '钻进衣柜，把衣服扒拉了一地', '把绿植的叶子啃了几口', '打翻了猫粮袋，撒了一地'],
    dog: ['叼走了他的一只拖鞋，藏起来了', '把垃圾桶翻了个底朝天', '啃坏了一条桌腿', '带着一身泥踩满了地板', '把沙发垫拖到了地上', '偷吃了桌上的面包', '把他的袜子叼回窝里藏起来'],
};

export function dayKey(ts) {
    const d = new Date(Number(ts) || 0);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function hash(text) {
    let h = 2166136261;
    const s = String(text);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

export function coatOf(animal) {
    const table = animal?.kind === 'dog' ? DOG_COATS : CAT_COATS;
    return table[animal?.coat] || Object.values(table)[0];
}

export function habitOf(animal) {
    return animal?.kind === 'custom' ? (animal.habit === 'dog' ? 'dog' : 'cat') : (animal?.kind === 'dog' ? 'dog' : 'cat');
}

export function animalLabel(animal) {
    if (animal?.kind === 'custom') return animal.species || '小家伙';
    return coatOf(animal).name;
}

export function genderLabel(animal) {
    return animal?.gender === 'boy' ? '男孩' : '女孩';
}

const level = (since, per) => Math.max(0, Math.min(5, 5 - Math.floor(since / per)));

// 动物现在怎么样：饱腹、口渴（各 5 格）、今天做过哪些照顾、头上要不要冒个小气泡
export function animalStatus(animal, t = Date.now()) {
    const born = Number(animal.adoptedAt) || t;
    const fedAt = Number(animal.fedAt) || 0;
    const waterAt = Number(animal.waterAt) || 0;
    const full = level(t - (fedAt || born - 4 * HOUR), 6 * HOUR);
    const water = level(t - (waterAt || born - 4 * HOUR), 5 * HOUR);
    const today = dayKey(t);
    const needsWalk = habitOf(animal) === 'dog';
    const fedToday = dayKey(fedAt) === today;
    const waterToday = dayKey(waterAt) === today;
    const walkedToday = dayKey(animal.walkedAt) === today;
    const recentMischief = animal.mischief && t - animal.mischief.at < 6 * HOUR ? animal.mischief : null;
    let bubble = '';
    if (recentMischief) bubble = '!';
    else if (full <= 1) bubble = '饿了';
    else if (water <= 1) bubble = '渴了';
    else if (needsWalk && !walkedToday && new Date(t).getHours() >= 16) bubble = '想出门';
    return { full, water, needsWalk, fedToday, waterToday, walkedToday, bubble, mischief: recentMischief };
}

// 动物这会儿在哪个房间：刚放下 / 刚捣完蛋的待在原处，其余时间每一个半小时随机换一间
export function animalRoom(animal, rooms, t = Date.now()) {
    const list = rooms || [];
    if (!list.length) return '';
    const has = id => list.some(r => r.id === id);
    if (animal.mischief && t - animal.mischief.at < 3 * HOUR && has(animal.mischief.room)) return animal.mischief.room;
    const placed = Number(animal.placedAt || animal.adoptedAt) || 0;
    if (t - placed < 2 * SLOT && has(animal.room)) return animal.room;
    const slot = Math.floor(t / SLOT);
    return list[hash(`${animal.id}:${slot}`) % list.length].id;
}

const POSES = {
    cat: [['sleep', '窝着睡觉'], ['sit', '蹲着发呆'], ['sit', '舔爪子'], ['sleep', '团成一团晒太阳'], ['sit', '盯着窗外的鸟']],
    dog: [['sleep', '趴着打盹'], ['sit', '摇着尾巴'], ['sit', '叼着玩具转圈'], ['sleep', '四脚朝天睡着了'], ['sit', '竖着耳朵听门外']],
};
// 姿势、在做什么、站在房间哪里（随时间变）
export function animalPose(animal, t = Date.now()) {
    const slot = Math.floor(t / SLOT);
    const habit = habitOf(animal);
    const st = animalStatus(animal, t);
    if (st.mischief) return { pose: 'sit', activity: `刚${st.mischief.text}`, x: 18 + hash(`${animal.id}:${slot}:x`) % 64 };
    let [pose, activity] = POSES[habit][hash(`${animal.id}:${slot}:p`) % POSES[habit].length];
    if (st.full <= 1) { pose = 'sit'; activity = '盯着饭碗'; }
    return { pose, activity, x: 14 + hash(`${animal.id}:${slot}:x`) % 72 };
}

// 植物现在怎么样
export function plantStatus(plant, t = Date.now()) {
    const kind = PLANT_KINDS[plant.kind] || PLANT_KINDS.mint;
    const waters = (plant.waters || []).map(Number).filter(Boolean);
    const lastWater = waters.length ? Math.max(...waters) : (Number(plant.plantedAt) || t);
    const daysDry = (t - lastWater) / DAY;
    const perDay = {};
    for (const w of waters) if (t - w < 3 * DAY) perDay[dayKey(w)] = (perDay[dayKey(w)] || 0) + 1;
    const extras = Object.values(perDay).reduce((s, n) => s + Math.max(0, n - 1), 0);
    const trouble = extras >= 2 ? 'soggy' : daysDry >= 2.5 ? 'dry' : '';
    const today = dayKey(t);
    const wateredToday = waters.some(w => dayKey(w) === today);
    const fertSince = (t - (Number(plant.fertAt) || Number(plant.plantedAt) || t)) / DAY;
    const fertDue = fertSince >= kind.fert;
    const stage = Math.max(0, Math.min(kind.stages.length - 1, Number(plant.stage) || 0));
    const maxed = stage >= kind.stages.length - 1;
    const points = Number(plant.points) || 0;
    const toNext = maxed ? 0 : Math.max(0, STAGE_POINTS[stage + 1] - points);
    return {
        kind, stage, stageName: kind.stages[stage], maxed, points, toNext,
        trouble, thirsty: !trouble && daysDry >= 1.2, wateredToday,
        fertDue, fertInDays: fertDue ? 0 : Math.max(1, Math.ceil(kind.fert - fertSince)),
        troubleText: trouble === 'soggy' ? '水浇太多，叶子发黄了' : trouble === 'dry' ? '好几天没浇水，蔫了' : '',
    };
}

export function stageFor(points) {
    let stage = 0;
    for (let i = 0; i < STAGE_POINTS.length; i++) if (points >= STAGE_POINTS[i]) stage = i;
    return stage;
}

// 下一个阶段大概还要做什么（给界面看的一句话）
export function nextStageHint(plant, t = Date.now()) {
    const st = plantStatus(plant, t);
    if (st.maxed) return '已经长到最后一个阶段了';
    const next = st.kind.stages[st.stage + 1];
    const ferts = Math.min(Math.floor(st.toNext / 2), 1);
    const waters = Math.max(0, st.toNext - ferts * 2);
    const todo = [waters ? `浇 ${waters} 次水` : '', ferts ? `施 ${ferts} 次肥` : ''].filter(Boolean).join('、');
    return `离「${next}」还要${todo || '一点点照顾'}`;
}

// 今天要做的照顾，做过的也列出来（划掉）
export function todayTasks(pets, t = Date.now()) {
    const out = [];
    for (const a of pets?.animals || []) {
        const st = animalStatus(a, t);
        out.push({ id: a.id, act: 'feed', label: `喂${a.name}`, done: st.fedToday });
        out.push({ id: a.id, act: 'water', label: `给${a.name}换水`, done: st.waterToday });
        if (st.needsWalk) out.push({ id: a.id, act: 'walk', label: `遛${a.name}`, done: st.walkedToday });
    }
    for (const p of pets?.plants || []) {
        const st = plantStatus(p, t);
        if (st.trouble !== 'soggy') out.push({ id: p.id, act: 'pwater', label: `给${p.name}浇水`, done: st.wateredToday });
        if (st.fertDue && !st.trouble) out.push({ id: p.id, act: 'fert', label: `给${p.name}施肥`, done: false });
    }
    return out;
}

// 给模型看的一行：家里养了谁
export function petsSummary(home) {
    const pets = home?.pets;
    if (!pets || (!pets.animals?.length && !pets.plants?.length)) return '';
    const rooms = home.house?.rooms || [];
    const roomName = id => rooms.find(r => r.id === id)?.name || '';
    const animals = (pets.animals || []).map(a => `${a.name}（${animalLabel(a)}，${genderLabel(a)}）`);
    const plants = (pets.plants || []).map(p => `${roomName(p.room)}的${p.name}（${plantStatus(p).stageName}）`);
    return `家里养的：${[...animals, ...plants].join('、')}`;
}

export function pickMischief(animal, rnd = Math.random) {
    const pool = MISCHIEF[habitOf(animal)];
    const recent = new Set((animal.mischiefLog || []).slice(-3));
    const fresh = pool.filter(x => !recent.has(x));
    const list = fresh.length ? fresh : pool;
    return list[Math.floor(rnd() * list.length) % list.length];
}

export const TIME = { HOUR, DAY, SLOT };

// ---------------- 装扮 ----------------
// slot：neck 脖子 / head 头顶 / face 脸上。同一个位置只戴一件，戴新的就换下旧的
export const GEAR = {
    collar: { label: '项圈', slot: 'neck', color: '#C2452D' },
    bell: { label: '铃铛', slot: 'neck', color: '#C2452D' },
    knot: { label: '平安结', slot: 'neck', color: '#C2452D' },
    bowtie: { label: '领结', slot: 'neck', color: '#2F5D4E' },
    scarf: { label: '小围巾', slot: 'neck', color: '#B2584A' },
    bow: { label: '蝴蝶结', slot: 'head', color: '#E8A0A8' },
    hat: { label: '小帽子', slot: 'head', color: '#5C8FD0' },
    flower: { label: '小花', slot: 'head', color: '#F2C46B' },
    glasses: { label: '小眼镜', slot: 'face', color: '#3A3A3A', templateOnly: true },
};
export const GEAR_COLORS = ['#C2452D', '#E8A0A8', '#F2C46B', '#2F5D4E', '#5C8FD0', '#7A5638', '#2A2A2A', '#F4F1EA'];
// 模型写的是「红绳平安结」「小铃铛」这样的话，按关键词认成能画出来的那一种
const GEAR_HINTS = [
    ['glasses', /眼镜|墨镜/], ['bowtie', /领结/], ['bow', /蝴蝶结|发带|头花|发夹/], ['knot', /平安结|中国结|绳结|红绳|编绳/],
    ['bell', /铃/], ['collar', /项圈|颈圈|脖套|狗牌|名牌/], ['scarf', /围巾|围脖|领巾|方巾|披肩/], ['hat', /帽/], ['flower', /花/],
];
export function gearTypeOf(text, type = '') {
    if (GEAR[type]) return type;
    const s = String(text || '');
    return GEAR_HINTS.find(([, re]) => re.test(s))?.[0] || '';
}
export function gearSummary(animal) {
    return (animal?.gear || []).map(g => g.item || GEAR[g.type]?.label).filter(Boolean).join('、');
}

// 模板猫狗戴东西的位置（80×64 的本地坐标）。rot：睡着时脖子是斜的
const TEMPLATE_ANCHORS = {
    cat: {
        sit: { neck: { x: 40, y: 38.5, w: 19 }, head: { x: 40, y: 12 }, face: { x: 40, y: 26 } },
        sleep: { neck: { x: 35, y: 45, w: 13, rot: -40 }, head: { x: 26, y: 22 }, face: { x: 26, y: 37 } },
    },
    dog: {
        sit: { neck: { x: 40, y: 38, w: 19 }, head: { x: 40, y: 11 }, face: { x: 40, y: 23 } },
        sleep: { neck: { x: 33, y: 50, w: 11, rot: -55 }, head: { x: 24, y: 34 }, face: { x: 24, y: 45 } },
    },
};
// 画出来的宠物：位置是按图片比例存的（0–1），换算成本地坐标。图片画在 (6,2) 起 68×60 的框里，底部对齐
export function animalAnchors(animal, pose = 'sit') {
    if (animal?.kind !== 'custom') return TEMPLATE_ANCHORS[habitOf(animal)][pose === 'sleep' ? 'sleep' : 'sit'];
    const a = animal.anchors || {};
    const ar = Number(a.ar) || 1;
    const box = ar > 68 / 60 ? { w: 68, h: 68 / ar } : { w: 60 * ar, h: 60 };
    box.x = 6 + (68 - box.w) / 2;
    box.y = 2 + 60 - box.h;
    const to = (p, dx, dy) => ({ x: box.x + (Number(p?.x ?? dx)) * box.w, y: box.y + (Number(p?.y ?? dy)) * box.h });
    const neck = to(a.neck, 0.5, 0.48);
    return { neck: { ...neck, w: Math.max(8, Math.min(40, (Number(a.neck?.w) || 0.3) * box.w)) }, head: to(a.head, 0.5, 0.06), box };
}

// 他在摸哪一只：叫他来摸的那半小时里是那一只；平时他在家、没坐在哪件家具旁边时，偶尔自己去逗一只
export function pettingNow(home, t = Date.now(), { away = false } = {}) {
    const animals = home?.pets?.animals || [];
    if (!animals.length || away || home.presence?.atHome === false) return null;
    const p = home.presence?.petting;
    if (p && p.until > t) {
        const a = animals.find(x => x.id === p.pet);
        if (a) return { id: a.id, asked: true };
    }
    if (home.presence?.spot) return null;
    const slot = Math.floor(t / SLOT);
    if (hash(`pat:${slot}`) % 3) return null;
    return { id: animals[hash(`patwho:${slot}`) % animals.length].id, asked: false };
}
