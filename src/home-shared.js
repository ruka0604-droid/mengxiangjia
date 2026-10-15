// 梦想家 · 生成时共用的小工具：确认家还在、给模型看的家的近况
import { homeTheme, themeName } from './theme.js?mxj=0.9.0';
import { getHome } from './settings.js?mxj=0.9.0';
import { petsSummary } from './pets-data.js?mxj=0.9.0';

// 生成要等一会儿；等完时这个家可能已经被拆掉了，就不再往里写，给一句看得懂的提示。
export function liveHome(char) {
    const home = getHome(char);
    if (!home?.house) throw new Error('这个家已经不在了，这次生成的内容没有保存。');
    return home;
}

// ---------------- 家的近况（给模型看） ----------------


export function houseSummary(home) {
    const h = home.house;
    if (!h) return '';
    const lines = [`家：${h.name}。${h.story || ''}`, `固定画风：${themeName(homeTheme(home))}。`, `确认的角色外貌：${home.appearance || '以角色卡为准'}。`];
    for (const r of h.rooms) {
        const items = h.furniture.filter(f => f.room === r.id).map(f => `${f.name}[${f.id}]${f.by === 'user' ? '(用户放的)' : ''}`);
        lines.push(`- ${r.name}：${items.join('、') || '空着'}`);
    }
    const pets = petsSummary(home);
    if (pets) lines.push(pets);
    return lines.join('\n');
}

export function recentLog(home, n = 5) {
    return (home.visits || []).slice(-n).map(v => {
        let line = `[${new Date(v.at).toLocaleString()}] 他：${v.event}`;
        for (const t of v.turns || []) line += `\n  用户：${t.user}\n  他：${t.reply}`;
        return line;
    }).join('\n');
}

export function notesHistory(home, n = 6) {
    return (home.notes || []).slice(-n).map(x => `${x.from === 'user' ? '用户' : '他'}写的${x.kind}纸条（${x.place}）：${x.text}`).join('\n');
}

export function nowLine() {
    const d = new Date();
    const h = d.getHours();
    const part = h < 5 ? '深夜' : h < 9 ? '清晨' : h < 12 ? '上午' : h < 14 ? '中午' : h < 18 ? '下午' : h < 22 ? '晚上' : '深夜';
    return `${d.getMonth() + 1}月${d.getDate()}日 ${part} ${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
