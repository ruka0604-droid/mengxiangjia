// 梦想家 · 读取角色卡、用户人设、角色世界书和最近聊天
import { ctx, clip } from './util.js?mxj=0.5.16';
import { getSettings } from './settings.js?mxj=0.5.16';

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

// 人物外貌专用：世界书是唯一的基础来源；正文只补齐缺失的字段。
// 不调用文字模型，避免模型拒绝、幻觉及将 API 错误混入生图提示词。
const LOOK_FIELDS = [
    ['age', /年龄|岁|年纪|age|years? old/i],
    ['gender', /性别|男性|女性|男人|女人|男生|女生|gender|\bmale\b|\bfemale\b/i],
    ['hair', /发型|发色|头发|短发|长发|寸头|刘海|卷发|直发|马尾|辫子|秃头|黑发|金发|银发|白发|棕发|红发|hair|buzz cut|crew cut|undercut/i],
    ['eyes', /眼睛|眼眸|瞳色|瞳孔|眸色|眼型|eyes?|iris|pupil/i],
    ['skin', /肤色|皮肤|肤质|skin|complexion/i],
    ['build', /身高|体型|身材|肩宽|肌肉|体重|高挑|修长|健壮|纤细|height|build|physique|tall|slim|muscular/i],
    ['clothes', /服装|服饰|穿着|衣着|衣服|外套|衬衫|西装|制服|校服|裙子|长裤|短裤|领带|领结|鞋子|披风|outfit|clothing|wears?|dress|shirt|suit|uniform|coat|jacket/i],
    ['features', /外貌|容貌|五官|长相|面容|面部|眉毛|鼻梁|嘴唇|伤疤|疤痕|纹身|胎记|耳朵|尾巴|眼镜|配饰|饰品|appearance|facial|scar|tattoo|glasses|accessor/i],
];
const LOOK_LABELS = {age:'年龄',gender:'性别',hair:'发型与发色',eyes:'眼睛',skin:'肤色',build:'身材',clothes:'服装',features:'其他外貌特征'};
function relevantLines(text, {chat=false, charName=''}={}) {
    const rows=String(text||'').split(/\n|[。！？!?；;]/).map(x=>x.trim()).filter(Boolean);
    const selected=[];
    for (const row of rows) {
        if (isGenerationFailure(row)) continue;
        if (!LOOK_FIELDS.some(([,pattern])=>pattern.test(row))) continue;
        if (chat) {
            // 只接受角色本人发言或明确提到该角色的叙述，不借用其他 NPC/用户外貌。
            const colon=row.indexOf('：');
            if (colon<0) continue;
            const speaker=row.slice(0,colon).trim();
            const body=row.slice(colon+1).trim();
            if (speaker!==charName && !body.includes(charName)) continue;
            if (/^(?:你|我|用户|user)的?(?:头发|眼睛|衣服|发型|肤色)/i.test(body)) continue;
        }
        selected.push(row.slice(0,450));
    }
    return selected;
}
// 人物外貌：角色描述优先；世界书仅采用能确认属于当前 char 的条目；正文最后补缺。
// 不把其他 NPC 的独立人设混进 char，也不让后级来源覆盖前级字段。
function charWorldbookLines(worldBook, charName) {
    const sections = String(worldBook || '').split(/(?=【[^】]+】)/);
    const result = [];
    const name = String(charName || '').trim();
    for (const section of sections) {
        const header = (section.match(/^【([^】]+)】/) || [,''])[1].trim();
        const body = section.replace(/^【[^】]+】/, '').trim();
        if (!body) continue;
        // 明确写着其他人的角色档案，不允许取用；无归属的通用条目也不猜测。
        const identityHeading = /(?:人物|角色|NPC|档案|设定|人设|外貌|外观|形象|资料|简介|character|appearance|profile)/i.test(header);
        const named = name && (header.includes(name) || new RegExp(`(?:姓名|名字|角色名|name)\\s*[:：]\\s*${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`).test(body));
        if (!named) {
            // 通用「外貌」条目可用，但含其他人名标题或显式 NPC 档案一律排除。
            if (!/^(?:外貌|外观|容貌|人物外貌|形象设定|appearance|physical appearance)$/i.test(header)) continue;
            if (/(?:NPC|配角|其他角色|他人|路人)/i.test(body.slice(0,160))) continue;
        }
        for (const line of relevantLines(body)) result.push(line);
    }
    return result;
}
export function extractPortraitAppearance(description, worldBook='', chatText='', charName='') {
    const descLines = relevantLines(description);
    const bookLines = charWorldbookLines(worldBook, charName);
    const chatLines = relevantLines(chatText,{chat:true,charName});
    const details={}; const origins={};
    for (const [field,pattern] of LOOK_FIELDS) {
        const source = [
            ['角色描述',descLines],
            ['世界书补缺',bookLines],
            ['正文补缺',chatLines],
        ].find(([,lines])=>lines.some(line=>pattern.test(line)));
        if (!source) continue;
        const [origin,lines]=source;
        details[field]=lines.filter(line=>pattern.test(line)).slice(0,3).join('；');
        origins[field]=origin;
    }
    const missing=LOOK_FIELDS.filter(([field])=>!details[field]).map(([field])=>LOOK_LABELS[field]);
    const lines=LOOK_FIELDS.filter(([field])=>details[field]).map(([field])=>`${LOOK_LABELS[field]}（${origins[field]}）：${details[field]}`);
    return {text:lines.join('\n'),details,origins,missing,descriptionMatched:descLines.length,worldBookMatched:bookLines.length,chatMatched:chatLines.length};
}
export async function gatherPortraitAppearance(char) {
    const description=characterView(char).description;
    // 世界书仍主动读取；没有绑定世界书或没有外貌条目，不再阻止角色描述优先的生图。
    const worldBook=await characterWorldBookText(char, 60000, {strict:false});
    const c=ctx(); const name=characterView(char).name;
    const chat=Array.isArray(c.chat)?c.chat:[];
    const recent=chat.slice(-80).filter(m=>m && !m.is_system).map(m=>`${m.name || (m.is_user?'用户':name)}：${String(m.mes||'').replace(/<[^>]*>/g,' ').slice(0,1200)}`).join('\n');
    const extracted=extractPortraitAppearance(description,worldBook,recent,name);
    if (!extracted.text) throw new Error('角色描述、属于当前角色的世界书条目和正文中都没有可用外貌信息；请先补充角色外貌。');
    return extracted;
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
