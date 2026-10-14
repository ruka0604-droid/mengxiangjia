// 梦想家 · 小纸条
import { uid, now, parseJsonLoose, asText, clip } from './util.js?mxj=0.7.1';
import { generate } from './api.js?mxj=0.7.1';
import { gatherContext, contextBlock } from './character.js?mxj=0.7.1';
import { getHome, setHome } from './settings.js?mxj=0.7.1';
import { NOTE_SYSTEM, VISIT_SYSTEM } from './home-prompts.js?mxj=0.7.1';
import { liveHome, houseSummary, notesHistory } from './home-shared.js?mxj=0.7.1';

export const NOTE_KINDS = ['道歉', '纪念', '日常', '想你', '谢谢', '生气了'];
export const NOTE_PLACES = ['门边', '冰箱', '枕边', '书桌'];

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

export async function replyToNote(char, noteId, { signal } = {}) {
    const home = getHome(char);
    const note = home?.notes?.find(n => n.id === noteId);
    if (!note) throw new Error('找不到这张纸条');
    // 先确认这张能回，免得白花一次生成
    if (note.from !== 'user') throw new Error('只能请他回你写的纸条');
    if (note.replyId) throw new Error('这张纸条已经回复过了');
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
    // 接口回的是报错对象、或者一段没有正文的 JSON，就不当成他的回信
    const isObj = parsed && typeof parsed === 'object' && !Array.isArray(parsed);
    if (isObj && (parsed.error || parsed.message) && !parsed.text && !parsed.reply) throw new Error('纸条接口返回了报错，回信没有保存，纸条还在等他回。');
    const text = asText(parsed?.text || parsed?.reply, 400) || clip(String(raw || '').replace(/^["“]|["”]$/g, ''), 400);
    if (!text || (/^\s*[\[{]/.test(text) && !parsed?.text && !parsed?.reply)) throw new Error('模型没有返回纸条内容，纸条还在等他回，可以再请一次。');
    const fresh = liveHome(char);
    const target = (fresh.notes || []).find(n => n.id === noteId);
    if(!target)throw new Error('这张纸条已经不在了');
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
    const p=parseJsonLoose(raw);
    // 模型没按 JSON 写、直接写了纸条正文时，正文照样用
    const body=asText(p?.text||p?.note?.text||p?.content,400)||(p?'':clip(String(raw||'').replace(/^["“]|["”]$/g,'').trim(),400));
    if(!body)throw new Error('模型没有返回纸条内容，请再试一次');
    const fresh=liveHome(char);
    const note={id:uid('n'),from:'char',kind:NOTE_KINDS.includes(p?.kind)?p.kind:'日常',place:NOTE_PLACES.includes(p?.place)?p.place:'门边',text:body,at:now(),readAt:0};
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
