// 梦想家 · 他回家、回应他、什么时候回家
import { uid, now, parseJsonLoose, asText, clip } from './util.js?mxj=0.6.2';
import { generate } from './api.js?mxj=0.6.2';
import { gatherContext, contextBlock } from './character.js?mxj=0.6.2';
import { getHome, setHome, getSettings } from './settings.js?mxj=0.6.2';
import { VISIT_SYSTEM, RESPOND_SYSTEM } from './home-prompts.js?mxj=0.6.2';
import { liveHome, houseSummary, recentLog, notesHistory, nowLine } from './home-shared.js?mxj=0.6.2';
import { NOTE_KINDS, NOTE_PLACES } from './home-notes.js?mxj=0.6.2';
import { pendingChanges } from './home-decor.js?mxj=0.6.2';
import { getDiary, charTurn, applyCharDiary, diaryContext, DIARY_FORMAT } from './home-diary.js?mxj=0.6.2';

// ---------------- 他回家 ----------------

function notesForVisit(home) {
    return (home.notes || []).filter(n => n.from === 'user' && !n.readAt);
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
    const changes = pendingChanges(home);
    const changeCutoff = changes.reduce((m, c) => Math.max(m, Number(c.at) || 0), 0);
    const diaryDue = getDiary(home).mode !== 'manual' && (charTurn(home) || (freshStory && newEvents.some(e=>/纪念日|旅行|约会/.test(e.kind))) || changes.some(e=>/搬家|住宅从/.test(e.text)));
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
    const visit = applyVisit(char, parsed, raw, unread, {fingerprint:freshStory?fingerprint:'', eventKeys:newEvents.map(e=>storyFingerprint([e])), hasChanges:changes.length>0, changeCutoff, diaryDue});
    return visit;
}

function applyVisit(char, parsed, raw, unread, meta = {}) {
    const home = liveHome(char);
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
    // 这次回家写出了日记就记下来（模型有时把日记直接写成一段文字）
    const diaryEntry = meta.diaryDue && p.diary ? applyCharDiary(home, p.diary, typeof p.diary === 'string' ? p.diary : '') : null;
    const wroteNote = !!asText(p.note?.text || (typeof p.note === 'string' ? p.note : ''), 400);
    // 写出纸条或日记，才算他注意到了这些装修变化；只算到这次提示词里带上的那些，生成期间新做的改动留到下次。
    if (meta.hasChanges && (wroteNote || diaryEntry)) home.changesSeenAt = Math.max(Number(home.changesSeenAt) || 0, meta.changeCutoff || 0);
    // 仅在实际写出回应时消费事件；失败时下次回家重试。
    if (meta.fingerprint && (wroteNote || diaryEntry)) {
        home.storyFingerprint = meta.fingerprint;
        home.processedStoryEvents = [...new Set([...(home.processedStoryEvents||[]),...(meta.eventKeys||[])])].slice(-200);
    }
    home.storyScanAt = visit.at;
    if (spot) {
        const f = home.house.furniture.find(x => x.id === spot);
        if (f) home.currentRoom = f.room;
    }

    // 没有生成回信的纸条保留未读，供下次回家或手动回复。
    home.notes ||= [];
    const replies = (Array.isArray(p.replies) ? p.replies : []).filter(x => x && typeof x === 'object');
    const cleanId = v => String(v ?? '').replace(/^\s*(?:id\s*[=:：]\s*)?/i, '').replace(/[「」"'`\s]/g, '');
    const used = new Set();
    const pick = (n, i) => {
        let k = replies.findIndex((x, j) => !used.has(j) && cleanId(x.to) === n.id);
        if (k < 0) k = replies.findIndex((x, j) => !used.has(j) && String(x.to || '').includes(n.id));
        // 都对不上编号时，回信数量和纸条数量一样就按顺序配
        if (k < 0 && replies.length === unread.length && !replies.some(x => unread.some(u => cleanId(x.to) === u.id))) k = used.has(i) ? -1 : i;
        if (k < 0 && unread.length === 1 && replies.length) k = 0;
        if (k < 0) return null;
        used.add(k);
        return replies[k];
    };
    for (const [i, n] of unread.entries()) {
        const target = home.notes.find(x => x.id === n.id) || n;
        if (target.replyId) continue;
        const r = pick(n, i);
        const text = asText(r?.text, 400);
        if (text) {
            target.readAt = visit.at;
            const reply = { id: uid('n'), from: 'char', kind: target.kind, place: target.place, text, at: visit.at, replyTo: target.id, readAt: 0 };
            home.notes.push(reply);
            target.replyId = reply.id;
        }
    }
    if (p.note && (typeof p.note === 'object' || typeof p.note === 'string')) {
        const text = asText(typeof p.note === 'string' ? p.note : p.note.text, 400);
        if (text) {
            home.notes.push({
                id: uid('n'),
                from: 'char',
                kind: NOTE_KINDS.includes(p.note?.kind) ? p.note.kind : '日常',
                place: NOTE_PLACES.includes(p.note?.place) ? p.note.place : '门边',
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
    const fresh = liveHome(char);
    const last = fresh.visits?.[fresh.visits.length - 1];
    if (!last) throw new Error('这个家已经不在了，这次生成的内容没有保存。');
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
