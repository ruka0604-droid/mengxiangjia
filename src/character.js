// 梦想家 · 读取角色卡、用户人设、角色世界书和最近聊天
import { ctx, clip } from './util.js?mxj=0.5.12';
import { getSettings } from './settings.js?mxj=0.5.12';

function first(...values) {
    return values.map(v => String(v ?? '').trim()).find(Boolean) || '';
}

export function characterView(char) {
    const data = char?.data && typeof char.data === 'object' ? char.data : {};
    return {
        name: first(char?.name, data.name) || '他',
        description: clip(first(data.description, char?.description), 6000),
        personality: clip(first(data.personality, char?.personality), 1600),
        scenario: clip(first(char?.scenario, data.scenario), 900),
        firstMes: clip(first(char?.first_mes, data.first_mes), 600),
    };
}

export function personaView() {
    const c = ctx();
    const name = first(c.name1, globalThis.name1) || '你';
    const description = clip(first(
        c.powerUserSettings?.persona_description,
        globalThis.power_user?.persona_description,
        c.personaDescription,
    ), 1200);
    return { name, description };
}

export function avatarUrl(char) {
    const avatar = String(char?.avatar || '').trim();
    if (!avatar || avatar === 'none') return '';
    return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;
}

async function requestHeaders() {
    const c = ctx();
    let fn = c.getRequestHeaders;
    if (typeof fn !== 'function') {
        try {
            fn = (await import('../../../../../script.js')).getRequestHeaders;
        } catch { /* 忽略 */ }
    }
    return { ...(typeof fn === 'function' ? fn() : {}), 'Content-Type': 'application/json' };
}

/**
 * 角色世界书（卡内嵌的 + 绑定的那本），只取启用且有内容的条目，按字数截断。
 * 读不到时返回空字符串，不阻止生成。
 */
export async function characterWorldBookText(char, budget = 5000, { strict = false } = {}) {
    if (!getSettings().readCharacterWorldBook && strict) throw new Error('人物生图必须读取世界书，请先在设置中启用角色世界书。');
    if (!getSettings().readCharacterWorldBook) return '';
    const rows = [];
    const seen = new Set();
    const errors = [];
    const pushEntries = (book) => {
        const entries = book?.entries;
        if (!entries) return;
        const list = Array.isArray(entries) ? entries : Object.values(entries);
        for (const entry of list) {
            if (!entry || entry.enabled === false || entry.disable === true) continue;
            const content = String(entry.content || entry.text || '').trim();
            if (!content) continue;
            const title = String(entry.comment || entry.name || entry.title || '').trim();
            const row = title ? `【${title}】${content}` : content;
            if (!seen.has(row)) { seen.add(row); rows.push(row); }
        }
    };
    try {
        const embedded = char?.data?.character_book ?? char?.character_book ?? char?.data?.extensions?.character_book;
        const linkedName = String(char?.data?.extensions?.world || char?.extensions?.world || '').trim();
        if (embedded) pushEntries(embedded);
        if (linkedName) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            try {
                const response = await fetch('/api/worldinfo/get', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: await requestHeaders(),
                    body: JSON.stringify({ name: linkedName }),
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                pushEntries(await response.json());
            } finally {
                clearTimeout(timer);
            }
        }
    } catch (error) {
        errors.push(error?.message || String(error));
        console.debug('[梦想家] 读取绑定世界书失败', error);
    }
    if (strict && errors.length) throw new Error(`绑定世界书读取失败：${errors.join('；')}。请重试，不能忽略世界书继续生图。`);
    // 优先提供外貌相关条目，避免重要特征被世界书前面的长篇背景挤出预算。
    const appearanceRe = /外貌|外观|容貌|长相|形象|发型|发色|瞳色|眼睛|眼眸|肤色|身高|体型|服装|衣着|穿着|特征|appearance|physical|looks|hair|eyes|outfit|skin|clothing|gender|性别|年龄/i;
    rows.sort((a,b) => Number(appearanceRe.test(b)) - Number(appearanceRe.test(a)));
    let out = '';
    for (const row of rows) {
        if (out.length + row.length > budget) {
            out += `${row.slice(0, Math.max(0, budget - out.length))}…`;
            break;
        }
        out += `${row}\n`;
    }
    return out.trim();
}

export function recentChatText() {
    const s = getSettings();
    if (!s.readRecentChat || !s.recentChatCount) return '';
    const c = ctx();
    const chat = Array.isArray(c.chat) ? c.chat : [];
    const picked = [];
    for (let i = chat.length - 1; i >= 0 && picked.length < s.recentChatCount; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        const text = String(m.mes || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        picked.unshift(`${m.is_user ? (m.name || '用户') : (m.name || '角色')}：${clip(text, 400)}`);
    }
    return picked.join('\n');
}

export async function gatherContext(char, { portrait = false } = {}) {
    const view = characterView(char);
    const persona = personaView();
    const worldBook = await characterWorldBookText(char, portrait ? 18000 : 5000, { strict: portrait });
    const recent = recentChatText();
    return { char: view, persona, worldBook, recent };
}

export function contextBlock(info, { withRecent = true } = {}) {
    const parts = [];
    parts.push(`# 角色：${info.char.name}`);
    if (info.char.description) parts.push(`## 角色描述\n${info.char.description}`);
    if (info.char.personality) parts.push(`## 性格\n${info.char.personality}`);
    if (info.char.scenario) parts.push(`## 场景\n${info.char.scenario}`);
    if (info.worldBook) parts.push(`## 角色世界书摘录\n${info.worldBook}`);
    parts.push(`# 用户：${info.persona.name}`);
    if (info.persona.description) parts.push(`## 用户人设\n${info.persona.description}`);
    if (withRecent && info.recent) parts.push(`# 最近的聊天（只作为两人近况参考）\n${info.recent}`);
    return parts.join('\n\n');
}

// 模型返回的拒绝/故障文本不得写入外貌或生图提示词。
export function isGenerationFailure(value) {
    const t = String(value || '').trim();
    return !t || /the prompt could not be submitted|generative ai prohibited use policy|sensitive words that violate|send feedback|ai\.google\.dev\/gemini-api\/docs\/troubleshooting|^(?:error|exception|request failed|api error|http [45]\d\d)\s*[:：]/i.test(t)
        || /(?:内容审核|违反.*政策|敏感词.*(?:拒绝|禁止)|请求被拒绝)/i.test(t);
}

export function validatedAppearance(value) {
    const t = String(value || '').replace(/```/g, '').trim();
    if (isGenerationFailure(t)) throw new Error('外貌整理接口返回了拒绝或错误信息，已停止生图；请核对角色资料后重试。');
    return t;
}
