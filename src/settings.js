// 梦想家 · 设置与存档（存在酒馆的扩展设置里，换设备也在）
import { ctx, clamp } from './util.js?mxj=0.9.0';

export const MODULE_NAME = 'mengxiangjia';

const DEFAULTS = Object.freeze({
    // 生成通道：follow = 跟随当前 API；independent = 副 API
    generationSource: 'follow',
    floatingLauncher: false,
    floatingPosition: null,
    // 生图配置独立于文字生成，使用者自行填写兼容服务。
    imageBaseUrl: '', imageKey: '', imageModel: '',
    imagePromptFormat: 'structured', imageSampler: 'k_euler', imageNoise: 'karras',
    imageWidth: 1216, imageHeight: 832, imagePortraitWidth: 832, imagePortraitHeight: 1216,
    imageSteps: 28, imageScale: 5.5, imageSeed: 0, imageExtra: '{}', imageCutout: true,
    independentConnectionProfileId: '',
    independentApiBaseUrl: '',
    independentApiKey: '',
    independentApiModel: '',
    independentModelCache: null,
    independentApiTemperature: 0.9,
    independentApiMaxTokens: 4096,
    // 读哪些上下文
    readCharacterWorldBook: true,
    readRecentChat: true,
    recentChatCount: 8,
    // 他什么时候回家：open = 打开小屋时（隔一段时间才算一次），manual = 只在我点「等他回家」时
    visitMode: 'open',
    visitGapMinutes: 60,
});

const NUMERIC = {
    imageWidth: [64, 4096], imageHeight: [64, 4096], imagePortraitWidth: [64, 4096], imagePortraitHeight: [64, 4096],
    imageSteps: [1, 100], imageScale: [0, 30], imageSeed: [0, 4294967295],
    independentApiTemperature: [0, 2],
    independentApiMaxTokens: [256, 64000],
    recentChatCount: [0, 40],
    visitGapMinutes: [0, 10080],
};

function root() {
    const c = ctx();
    const store = c.extensionSettings || globalThis.extension_settings;
    if (!store) return null;
    if (!store[MODULE_NAME] || typeof store[MODULE_NAME] !== 'object') store[MODULE_NAME] = {};
    return store[MODULE_NAME];
}

export function getSettings() {
    const r = root() || {};
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (r[key] === undefined) r[key] = value;
    }
    for (const [key, [min, max]] of Object.entries(NUMERIC)) {
        r[key] = clamp(r[key], min, max);
    }
    if (!['follow', 'independent'].includes(r.generationSource)) r.generationSource = 'follow';
    if (!['open', 'manual'].includes(r.visitMode)) r.visitMode = 'open';
    if (!r.imageConnections || typeof r.imageConnections !== 'object') r.imageConnections = {};
    if (!r.homes || typeof r.homes !== 'object') r.homes = {};
    return r;
}

export function save() {
    const c = ctx();
    const fn = c.saveSettingsDebounced || globalThis.saveSettingsDebounced;
    try {
        if (typeof fn === 'function') fn();
    } catch (error) {
        console.warn('[梦想家] 保存设置失败', error);
    }
}

export function updateSettings(patch) {
    const s = getSettings();
    if (patch.imageBaseUrl !== undefined && String(patch.imageBaseUrl).trim() !== s.imageBaseUrl) {
        if (s.imageBaseUrl) s.imageConnections[s.imageBaseUrl] = {key:s.imageKey,model:s.imageModel};
        patch = {...patch, imageBaseUrl:String(patch.imageBaseUrl).trim()};
        // 换到记过的地址就取回那边的 Key 和模型；同一个网站只是改了路径或错字，就沿用现在填的；换到别的网站则清空，免得把旧 Key 发给别人。
        const known = s.imageConnections[patch.imageBaseUrl];
        const host = v => { try { return new URL(String(v).trim()).host.toLowerCase(); } catch { return ''; } };
        const sameSite = host(patch.imageBaseUrl) && host(patch.imageBaseUrl) === host(s.imageBaseUrl);
        // 原来没填地址时（先填了 Key 和模型再填地址），填的东西都留着
        const keep = sameSite || !s.imageBaseUrl;
        patch.imageKey = patch.imageKey ?? known?.key ?? (keep ? s.imageKey : '') ?? '';
        patch.imageModel = patch.imageModel ?? known?.model ?? (keep ? s.imageModel : '') ?? '';
    }
    Object.assign(s, patch);
    // 选了酒馆连接配置时，不再保留手动填写的 Key
    if (String(s.independentConnectionProfileId || '').trim()) s.independentApiKey = '';
    getSettings();
    save();
    return s;
}

// ---------- 每个角色一个家 ----------

export function currentCharacter() {
    const c = ctx();
    if (c.groupId) return null;
    const id = c.characterId;
    if (id === undefined || id === null || id === '') return null;
    const char = c.characters?.[id];
    if (!char) return null;
    return char;
}

export function characterKey(char) {
    return String(char?.avatar || char?.name || '').trim();
}

export function getHome(char) {
    const key = characterKey(char);
    if (!key) return null;
    const s = getSettings();
    const home = s.homes[key] || null;
    if (home) migrateHome(home);
    return home;
}

// 旧存档整理：0.5.6 移除房间时家具存进了 furnitureStorage，仓库读的是 storage，这里合并过去。
function migrateHome(home) {
    const house = home.house;
    if (!house) return;
    if (Array.isArray(house.furnitureStorage) && house.furnitureStorage.length) {
        house.storage = Array.isArray(house.storage) ? house.storage : [];
        const ids = new Set(house.storage.map(x => x?.id));
        for (const item of house.furnitureStorage) {
            if (!item || ids.has(item.id)) continue;
            const { room, x, z, ...rest } = item;
            house.storage.push({ ...rest, previousRoom: rest.previousRoom || room || '' });
        }
        delete house.furnitureStorage;
        save();
    }
}

export function setHome(char, home) {
    const key = characterKey(char);
    if (!key) return null;
    const s = getSettings();
    home.updatedAt = Date.now();
    s.homes[key] = home;
    trimHome(home);
    save();
    return home;
}

export function removeHome(char) {
    const key = characterKey(char);
    const s = getSettings();
    if (key && s.homes[key]) {
        delete s.homes[key];
        save();
    }
}

// 控制存档体积：纸条留最近 300 张，回家记录留最近 40 次
function trimHome(home) {
    if (Array.isArray(home.notes) && home.notes.length > 300) home.notes = home.notes.slice(-300);
    if (Array.isArray(home.visits) && home.visits.length > 40) home.visits = home.visits.slice(-40);
}
