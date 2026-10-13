// 梦想家 · 读取角色卡、用户人设、角色世界书和最近聊天
import { ctx, clip } from './util.js?mxj=0.6.10';
import { getSettings } from './settings.js?mxj=0.6.10';

function first(...values) {
    return values.map(v => String(v ?? '').trim()).find(Boolean) || '';
}

export function characterView(char) {
    const data = char?.data && typeof char.data === 'object' ? char.data : {};
    return {
        name: first(char?.name, data.name) || '他',
        // 角色描述放宽到 6000 字，外貌常写在后半段，截短了会丢
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
export async function characterWorldBookText(char, budget = 5000, { task = 'general' } = {}) {
    if (!getSettings().readCharacterWorldBook) return '';
    const rows = [];
    const pushEntries = (book) => {
        const entries = book?.entries;
        if (!entries) return;
        const list = Array.isArray(entries) ? entries : Object.values(entries);
        for (const entry of list) {
            if (!entry || entry.enabled === false || entry.disable === true) continue;
            const content = String(entry.content || entry.text || '').trim();
            if (!content) continue;
            const title = String(entry.comment || entry.name || entry.title || '').trim();
            rows.push({
                title,
                text: title ? `【${title}】${content}` : content,
                order: rows.length,
            });
        }
    };
    // 绑定了世界书就读绑定的那本（最新、开关状态也准）；读不到才用卡里内嵌的。
    // 酒馆保存角色时会把绑定的世界书复制一份进卡里，两份都读会重复，还会把已关掉的条目读进来。
    const embedded = char?.data?.character_book ?? char?.character_book ?? char?.data?.extensions?.character_book;
    const linkedName = String(char?.data?.extensions?.world || char?.extensions?.world || '').trim();
    let linkedOk = false;
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
            if (response.ok) {
                const book = await response.json();
                const entries = book?.entries;
                if (entries && Object.keys(entries).length) {
                    pushEntries(book);
                    linkedOk = true;
                }
            }
        } catch (error) {
            console.debug('[梦想家] 读取绑定世界书失败，改用卡内嵌的世界书', error);
        } finally {
            clearTimeout(timer);
        }
    }
    if (!linkedOk && embedded) {
        try {
            pushEntries(embedded);
        } catch (error) {
            console.debug('[梦想家] 读取内嵌世界书失败，跳过', error);
        }
    }
    // 条目是 {title, text, order}：去重、排序、拼接都按 text 来（不能直接拿对象拼字符串，会变成 [object Object]）
    const seen = new Set();
    const list = rows.filter(row => {
        if (seen.has(row.text)) return false;
        seen.add(row.text);
        return true;
    });
    // 只有看外貌的任务（盖房子、定小人外形、画人物）把外貌条目排前面；其他生成保持世界书原来的顺序
    if (task === 'appearance') {
        const appearanceRe = /外貌|外观|容貌|长相|形象|五官|脸型|眉毛|发型|发色|瞳色|眼睛|眼眸|肤色|服装|衣着|穿着|配饰|appearance|face|looks|hair|eyes|outfit|skin|clothing|gender|性别|年龄/i;
        list.sort((a, b) => (Number(appearanceRe.test(b.text)) - Number(appearanceRe.test(a.text))) || (a.order - b.order));
    }
    let out = '';
    for (const { text } of list) {
        if (out.length + text.length > budget) {
            out += `${text.slice(0, Math.max(0, budget - out.length))}…`;
            break;
        }
        out += `${text}\n`;
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

// worldBookBudget：长世界书时的截取上限。task='appearance' 时外貌相关条目优先；其他任务保持原有顺序。
export async function gatherContext(char, { worldBookBudget = 5000, task = 'general' } = {}) {
    const view = characterView(char);
    const persona = personaView();
    const worldBook = await characterWorldBookText(char, worldBookBudget, { task });
    const recent = recentChatText();
    return { char: view, persona, worldBook, recent, task };
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
