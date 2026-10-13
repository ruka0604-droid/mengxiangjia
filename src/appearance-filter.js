// 梦想家 · 人物外貌白名单。只供人物形象使用，不影响正文角色设定与剧情。
import { parseJsonLoose } from './util.js?mxj=0.6.11';

// 身体特征和隐私部位不会进入人物立绘提示词。对中英双语描述均适用。
const BODY_DETAIL_RE = /(?:\b(?:\d+(?:\.\d+)?\s*(?:cm|mm|kg|lbs?|pounds?|meters?|feet|inches?)\b|height|weight|weigh(?:s|ing)?|measurements?|bust|waist|hips?|physique|build|muscular|muscles?|abs|pectorals?|biceps|triceps|torso|chest|belly|abdomen|ribcage|ribs?|shoulders?|forearms?|upper arms?|thighs?|legs?|butt(?:ocks)?|groin|body hair|body scars?|bullet scars?|knife scars?|scarr?ing|scars?|scars? on (?:his|her|their) (?:body|arms?|back|chest)|genitals?|penis|shaft|erect(?:ion)?|glans|testicles?|scrotum|pubic|vagina|vulva|labia|nipples?|breasts?|areola|underwear|lingerie|naked|nude|topless|sex(?:ual)? anatomy)\b|身高|体重|三围|胸围|腰围|臀围|体型|身材|体格|体魄|肌肉|腹肌|胸肌|背肌|肩宽|宽肩|倒三角|上半身|下半身|背部|胸部|胸膛|腹部|小腹|腰腹|手臂|胳膊|大腿|臀部|私处|隐私部位|生殖器|阴茎|龟头|阴囊|睾丸|阴道|阴唇|乳房|乳头|阴毛|勃起|裸身|裸体|赤裸|裸露|裸上身|刀疤|弹孔|枪伤|身体疤痕|旧疤|疤痕|伤疤)/i;
const OTHER_DETAIL_RE = /(?:\b(?:sexual|nsfw|intimate|erotic|explicit|fetish|intercourse)\b|性爱|做爱|性行为|色情|情色|私密)/i;
const APPEARANCE_KEYS = ['genderAge', 'face', 'hair', 'eyes', 'skin', 'clothing', 'accessories'];

// 「及肩 / 齐腰长发」这类发型写法里的 shoulder、waist 不算身体描写；脸上的疤（眉骨、脸颊……）是认人的特征，也保留。
const HAIR_LENGTH_RE = /\b(?:shoulder|chest|waist|hip|back|mid-back|chin|ear)[- ]length\b|\b(?:shoulder|waist|hip)[- ]long\b/gi;
const FACE_RE = /(?:\b(?:face|facial|eyebrows?|brows?|eyes?|eyelids?|forehead|cheeks?|nose|lips?|chin|jaw|temple)\b|脸|面颊|脸颊|眉|眼|额|鼻|唇|嘴角|下巴|下颌|太阳穴)/i;
const SCAR_RE = /\b(?:scarr?ing|scars?)\b|刀疤|伤疤|疤痕|旧疤/gi;
function bodyCheckText(sentence) {
    let t = sentence.replace(HAIR_LENGTH_RE, ' ');
    if (FACE_RE.test(t)) t = t.replace(SCAR_RE, ' ');
    return t;
}

export function cleanAppearanceText(value) {
    if (typeof value !== 'string') return '';
    return value
        .replace(/<[^>]+>/g, ' ')
        .replace(/```(?:json)?/gi, ' ')
        // 逐短句过滤；保留同一句里不涉及身体的五官、衣着信息。
        .split(/[,，;；。！!？?\n]+/)
        .map(s => s.trim().replace(/^[\s:：.]+|[\s:：.]+$/g, ''))
        .filter(s => s && !BODY_DETAIL_RE.test(bodyCheckText(s)) && !OTHER_DETAIL_RE.test(s))
        .join(', ')
        .slice(0, 1200);
}

// 性别年龄有时与身高体重混在一句，单独取明示的信息，避免一起被过滤。
function cleanGenderAge(value) {
    const clean = cleanAppearanceText(value);
    if (clean) return clean;
    const source = String(value || '');
    const age = source.match(/\b\d{1,3}[- ](?:year[- ]old|years? old)\b/i)?.[0]
        || source.match(/\d{1,3}\s*岁/)?.[0] || '';
    const gender = source.match(/\b(?:male|female|man|woman|nonbinary|non-binary)\b/i)?.[0]
        || source.match(/(?:男性|女性|男人|女人|男|女)/)?.[0] || '';
    return [age, gender].filter(Boolean).join(' ');
}

/** 模型可以输出少字段、甚至非 JSON；均可降级，不把原文身体描写转给生图接口。 */
export function portraitAppearanceFromModel(raw) {
    const parsed = parseJsonLoose(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const items = APPEARANCE_KEYS
            .map(key => key === 'genderAge' ? cleanGenderAge(parsed[key]) : cleanAppearanceText(parsed[key]))
            .filter(Boolean);
        if (items.length) return items.join('. ');
    }
    return cleanAppearanceText(String(raw || '').replace(/\{[\s\S]*\}/g, ''));
}
