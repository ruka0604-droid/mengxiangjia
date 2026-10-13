// 梦想家 · 交换日记
import { uid, now, parseJsonLoose, asText, clip } from './util.js?mxj=0.6.7';
import { generate } from './api.js?mxj=0.6.7';
import { gatherContext, contextBlock } from './character.js?mxj=0.6.7';
import { getHome, setHome } from './settings.js?mxj=0.6.7';
import { DIARY_SYSTEM } from './home-prompts.js?mxj=0.6.7';
import { houseSummary, recentLog, notesHistory, nowLine } from './home-shared.js?mxj=0.6.7';

export const WEATHERS = ['晴', '多云', '阴', '小雨', '大雨', '雪', '雾', '起风'];
export const DIARY_MODES = [
    { id: 'visit', label: '他回家时' },
    { id: 'manual', label: '只手动写' },
];

export const DIARY_FORMAT = '{ "weather": "' + WEATHERS.join('/') + ' 之一", "text": "他的日记正文，第一人称，像真的手写日记，可以回应你上一篇里写的事", "stamp": "可选：2 到 4 个字的小印章，比如「书店」，不想盖就空" }';

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

export function applyCharDiary(home, raw, rawText) {
    if (typeof raw === 'string' && !rawText) rawText = raw;
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

export function diaryContext(home, n = 4) {
    const entries = getDiary(home).entries.slice(-n);
    if (!entries.length) return '';
    return '最近几篇日记：\n' + entries.map(e => {
        const who = e.author === 'user' ? '用户' : '他';
        const quote = e.quote ? `（引用了聊天里${e.quote.name}的话：「${e.quote.text}」）` : '';
        return `[${e.date}${e.weather ? ' ' + e.weather : ''}] ${who}写：${e.text}${quote}`;
    }).join('\n');
}

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
    if (!fresh) throw new Error('这个家已经不在了，这次生成的内容没有保存。');
    const entry = applyCharDiary(fresh, parsed?.diary || parsed, parsed ? '' : raw);
    setHome(char, fresh);
    if (!entry) throw new Error('他这次没写出来，可以再叫他写一次。');
    return entry;
}
