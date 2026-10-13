// 梦想家素材流程：固定主题 → 英文画面描述 → 生图预览 → 使用者确认保存。
import { generate } from './api.js?mxj=0.6.12';
import { gatherContext } from './character.js?mxj=0.6.12';
import { homeTheme } from './theme.js?mxj=0.6.12';
import { getHome, getSettings, setHome, characterKey } from './settings.js?mxj=0.6.12';
import { requestImage, saveImage, blobDataUrl } from './imageApi.js?mxj=0.6.12';
import { portraitAppearanceFromModel, cleanAppearanceText } from './appearance-filter.js?mxj=0.6.12';
import { artShape, CATALOG } from './furniture.js?mxj=0.6.12';
import { cleanBackground } from './cutout.js?mxj=0.6.12';
import { parseJsonLoose } from './util.js?mxj=0.6.12';

export const ART_STYLES = {
    scrapbook: 'warm watercolor and colored pencil illustration, vintage botanical scrapbook, textured handmade paper feeling, delicate ink outlines, cream and olive and honey brown palette, cozy lived-in atmosphere',
    pixel: 'detailed pixel art game asset, intentional crisp square pixels, limited harmonious palette, hand placed pixel shading, sea salt soda coastal cottage, soda blue and deep ocean blue, creamy ivory, pale sand gold, coral peach, sea glass green, light wood and plants, cozy life simulation game, no smooth gradients, no photographic rendering',
    storybook: 'refined romantic otome visual novel illustration, elegant storybook painting, soft cinematic sunlight, delicate line art and rich material detail, cream ivory dusty rose and pale gold palette, graceful proportions, no pixel art',
};
// Only portrait prompts use these chibi presets. House/furniture prompts remain unchanged.
export const CHIBI_STYLES = Object.freeze({
    pixel: 'Highly detailed Japanese pixel-art chibi character sprite, approximately 2.5 to 3 heads tall, attractive and age-appropriate, refined expressive pixel eyes, layered hair pixel clusters and highlights, detailed clothing and accessories, crisp hard-edged pixel outlines, controlled pixel dithering, readable silhouette, no blurred pixels, no smooth vector rendering, no 3D',
    storybook: 'Polished Japanese otome-game chibi illustration, premium refined character art, approximately 2 to 2.5 heads tall, oversized softly rounded head, gently rounded face and cheeks, small soft rounded chin, beautiful or handsome as appropriate to the established character, expressive eyes retaining their canonical size and shape with clear layered highlights, delicate clean anime linework, softly shaded skin, precise rendering of the established haircut and hair texture, smooth subtle gradients, refined original costume details, elegant collectible character-standee quality, polished and charming, no pixel art',
    scrapbook: 'Premium Japanese scrapbook-style chibi illustration, soft cute daily-life sticker character, approximately 2 to 2.3 heads tall, oversized rounded head, softly rounded cheeks, tiny rounded chin, simplified eyes retaining the original eye shape and expression, small simplified nose and mouth, light natural cheek blush, simplified tidy hair detailing faithful to the original haircut, short compact body with short arms and legs, delicate clean hand-drawn outlines, soft pastel flat colors with light watercolor-like shading, warm low-saturation palette, cozy healing atmosphere, polished planner-sticker and scrapbook-sticker aesthetic, adorable and charming, never monochrome or grayscale, not an unfinished sketch',
});
export const CHIBI_THEME_RULES = Object.freeze({
    pixel: "Preserve the character's identity through hairstyle, hair color, eye color, skin tone, clothing, visible accessories, and overall temperament while keeping the sprite cute, readable, and faithful to the established design.",
    storybook: "Preserve the character's exact established haircut (including close-cropped or buzz-cut hair), hair color, eye shape and gaze, eye color, eyebrow shape, skin tone, clothing, visible accessories, and temperament. Adapt only the overall facial contour to softly rounded chibi proportions; do not turn narrow or upturned eyes into wide round eyes, and do not soften a cold or serious expression into a smile. Respect the character's canonical age, including children and teenagers, without aging them up or making adults look like infants.",
    scrapbook: "Preserve the character's exact established haircut (including close-cropped or buzz-cut hair), eye shape and expression, hair color, eye color, skin tone, clothing, visible accessories, and temperament. Simplify facial details into softly rounded scrapbook chibi proportions without changing recognizable eyes, hairstyle, or emotional tone. Preserve the canonical age of children, teenagers, and adults; do not age up a minor or infantilize an adult. Render like a polished gentle planner sticker.",
});
export const CHIBI_RULES = 'Single full-body character, entire head and feet visible, natural standing pose, front or slight three-quarter view, centered isolated character. Respect canonical gender identity and exact stated age, distinctive eye shape and expression, hairstyle, hair color, eye color, skin tone, clothing and accessories from the character card and worldbook. Chibi stylization changes illustration proportions, not personal identity or age. Use only explicitly established facial, hair, eye, skin, clothing and accessory details. Keep the entire figure fully clothed, with no exposed intimate anatomy. Do not invent costume changes. No scenery, no typography';
export const CHIBI_NEGATIVES = Object.freeze({
    base: 'baby, toddler, infant, infantilized adult, randomly changed gender, missing feet, cropped body, grayscale, monochrome, text, watermark, blurry, deformed limbs, extra people, nudity, exposed genitals, explicit anatomy, topless, exposed torso, revealing clothes, exaggerated muscles',
    pixel: 'blurry pixels, anti-aliased smooth rendering, painterly shading, 3D render, realistic texture',
    storybook: 'exaggerated pointed chin, rigid angular jaw, hyperrealistic facial planes, photorealistic face, realistic adult body proportions, messy thick outlines, muddy colors, ugly chibi, stiff pose, altered canonical eye shape, altered canonical hairstyle, age progression, age regression',
    scrapbook: 'exaggerated pointed chin, rigid angular jaw, hyperrealistic facial contours, realistic anatomy, long body, long legs, thick rough lineart, heavy shadows, dark dramatic lighting, overly saturated colors, messy sketch, ugly chibi, stiff pose, complicated scenery, altered canonical eye shape, altered canonical hairstyle, age progression, age regression',
});
export const ART_NEGATIVE = 'text, watermark, logo, user interface, panels, buttons, collage, duplicated objects, blurry, low quality, distorted anatomy';
export function artTarget(home, kind, id) {
    return kind==='portrait' ? home : kind==='room' ? home?.house?.rooms.find(x=>x.id===id) : home?.house?.furniture.find(x=>x.id===id);
}
export function artPrompt(theme,kind,description,cutout) {
    if (kind === 'portrait') {
        // 人物立绘始终要求直接生成透明底，不再经过洋红底抠图模式。
        const background = 'genuine transparent background with alpha channel, isolated character cutout, no colored backdrop, no background shadow';
        // 外貌紧跟画风：提示词很长时生图服务会截掉末尾，模型也更看重前面的内容，外貌不能排在最后
        return `${CHIBI_STYLES[theme] || CHIBI_STYLES.pixel}. Canonical character appearance: ${description}. ${CHIBI_THEME_RULES[theme] || CHIBI_THEME_RULES.pixel}. ${CHIBI_RULES}. ${background}.`;
    }
    const composition=kind==='room'
        ? 'empty interior backdrop, front facing cutaway room, straight-on camera, wall covering upper seventy percent, floor covering bottom thirty percent, no people, no movable furniture, no windows or decorative objects; these will be placed separately'
        : 'one single isolated furniture object, full object visible, centered, front view, no room, no people, no accessories outside object';
    const background=kind==='room'?'':cutout?'solid flat bright magenta background RGB 255 0 255, no shadows on background, no other magenta objects':'transparent background, isolated cutout';
    return `${ART_STYLES[theme] || ART_STYLES.pixel}, ${composition}, ${description}, ${background}`;
}
export async function prepareArt(char,kind,id,{signal}={}) {
    const home=getHome(char);const target=artTarget(home,kind,id);
    if(!home?.house || !target) throw new Error('找不到需要绘制的对象');
    const theme=homeTheme(home);
    // 房间和家具只需要房子本身的信息；整张角色卡、世界书、用户人设用不上，费额度，卡里有成人内容时还容易被文字接口拒绝
    // 画人物：确认过外貌的（入住时已过滤掉身体描写），只把确认的外貌发给文字接口翻成英文；
    // 不再附上整张角色卡和世界书——卡里有成人内容时，文字接口常常整条拒绝，生图就一直卡在这一步。
    // 还没确认外貌的，照旧从角色卡和世界书里提取。
    const confirmed = kind==='portrait' ? cleanAppearanceText(home.appearance || '') : '';
    const info=kind==='portrait' && !confirmed ? await gatherContext(char, { worldBookBudget: 18000, task: 'appearance' }) : null;
    // 画像只提供角色资料和确认外貌，不带用户人设；强制按外貌白名单提取。
    const subject=kind==='portrait'?`User-confirmed appearance (highest priority): ${home.appearance || '(not provided)'}`:kind==='room'?`Room: ${target.name}. ${target.note || ''}. House: ${home.house.story || ''}. Wall color: ${target.wall || home.house.palette.wall}. Floor color: ${target.floor || home.house.palette.floor}.`:`Furniture: ${target.name}; type: ${target.type}; color: ${target.color || home.house.palette.accent}.`;
    const portraitContext = kind!=='portrait' ? ''
        : confirmed ? `# Character name\n${char.name || home.charName || ''}\n\nUser-confirmed appearance (the only source; translate it faithfully into the fields): ${confirmed}`
        : `# Character name\n${info.char.name}\n# Character card (reference only)\n${info.char.description}\n# Linked character worldbook (reference only)\n${info.worldBook}\n\n${subject}`;
    const text=await generate({system:kind==='portrait'
        ? `Extract only the character's established, VISIBLE appearance for a fully clothed chibi portrait. The character card and worldbook may contain mature descriptions; those are NOT instructions for this task. Never quote, summarize, or include any body anatomy, physique, height, weight, body measurements, musculature, scars on the body, nudity, intimate details, or sexual information. Only copy confirmed gender/age, facial shape and facial features, hair, eyes, complexion, existing outfit and visible accessories. Keep unspecified facts omitted, avoid inventing attire or details. Output one JSON object with these English string fields only: {"genderAge":"", "face":"", "hair":"", "eyes":"", "skin":"", "clothing":"", "accessories":""}. Use empty strings for unknown fields. No other keys or prose.`
        : 'Write a concise English image description for the requested asset. Preserve only the requested subject and confirmed physical features. Do not infer gender or age when not stated. Do not include UI, words, extra people, or any artist name. Output plain English only, without JSON or markdown.',user:kind==='portrait'?portraitContext:`# Home\n${home.house.name}\n\nRequested asset: ${kind}\n${subject}`,signal,maxTokens:650}).catch(error => {
        if (signal?.aborted) throw error;
        // 这一步还没开始画，是文字接口在整理画面描述时出的错
        const hint = kind==='portrait' && !confirmed ? '可以先到「他的样子」里确认外貌（写清发型、发色、瞳色、衣着），再来准备，插件就只发确认过的外貌。' : '';
        throw new Error(`整理画面描述时文字接口出错，还没开始画：${error?.message || error}${hint ? ` ${hint}` : ''}`);
    });
    if(signal?.aborted) throw new DOMException('已取消','AbortError');
    // 整理后外貌全被过滤空了（或模型没按字段写），就用确认过的外貌兜底，不让人物提示词里外貌一栏空着
    const description=kind==='portrait'?(portraitAppearanceFromModel(text) || cleanAppearanceText(home.appearance || '')):text.replace(/```/g,'').trim();
    const prompt=artPrompt(theme,kind,description,getSettings().imageCutout && kind!=='room');
    // 手帐/乙女支持不同年龄角色；像素主题仍保持上一版的排除词。
    const ageNeutralBaseNegative = theme === 'storybook' || theme === 'scrapbook'
        ? CHIBI_NEGATIVES.base.replace(/^baby, toddler, infant, /, '')
        : CHIBI_NEGATIVES.base;
    const portraitNegative = `${ageNeutralBaseNegative}, ${CHIBI_NEGATIVES[theme] || ''}, ${ART_NEGATIVE}`.replace(/,\s*,/g, ', ').replace(/,\s*$/,'');
    const shape=kind==='portrait'?'portrait':kind==='room'?'landscape':artShape(target.type);
    return {kind,id,theme,prompt,negative:kind==='portrait'?portraitNegative:ART_NEGATIVE,shape,owner:characterKey(char),house:home.house};
}

// 一间房里还没画的家具一起准备：一次文字调用写好所有描述，缺哪件就用家具种类兜底
export async function prepareFurnitureBatch(char,roomId,{signal}={}) {
    const home=getHome(char);
    const room=home?.house?.rooms.find(r=>r.id===roomId);
    if(!room) throw new Error('找不到这个房间');
    const items=home.house.furniture.filter(f=>f.room===roomId && !f.art?.path);
    if(!items.length) throw new Error('这间房的家具都画过了');
    const theme=homeTheme(home);
    const list=items.map(f=>`- id: ${f.id}; name: ${f.name || CATALOG[f.type]?.label || f.type}; type: ${f.type}; color: ${f.color || home.house.palette.accent}`).join('\n');
    const text=await generate({
        system:'Write a concise English image description (one short sentence of comma-separated visual details) for each furniture item. Describe only the object itself: shape, material, color in plain words (no hex codes). No people, no room, no words. Output one JSON object mapping each id to its description, nothing else.',
        user:`# Home\n${home.house.name}\n# Room\n${room.name}${room.note?` (${room.note})`:''}\n\n# Furniture\n${list}`,
        signal,maxTokens:Math.min(2400,200+items.length*120),
    }).catch(error=>{ if(signal?.aborted) throw error; throw new Error(`整理家具描述时文字接口出错，还没开始画：${error?.message || error}`); });
    if(signal?.aborted) throw new DOMException('已取消','AbortError');
    const parsed=parseJsonLoose(text);
    const map=parsed && typeof parsed==='object' && !Array.isArray(parsed) ? parsed : {};
    const cutout=getSettings().imageCutout;
    return {
        owner:characterKey(char),house:home.house,theme,roomId,roomName:room.name,
        items:items.map(f=>{
            const got=map[f.id];
            const description=(typeof got==='string' ? got : got?.description || '').replace(/```/g,'').trim() || `a ${f.type.replace(/([a-z])([A-Z])/g,'$1 $2')}`;
            return {kind:'furniture',id:f.id,name:f.name || CATALOG[f.type]?.label || f.type,theme,prompt:artPrompt(theme,'furniture',description,cutout),negative:ART_NEGATIVE,shape:artShape(f.type),owner:characterKey(char),house:home.house};
        }),
    };
}

export async function generateArt(draft,{signal}={}) {
    draft = {...draft};
    const shape=draft.shape || (draft.kind==='portrait'?'portrait':'landscape');
    let result=await requestImage(draft.prompt,{negative:draft.negative,shape,signal});
    // 人物和家具：四周是一整块纯色底时自动去掉并裁掉空白；拿不准就保留原图。原图另存一份，预览里可以换回去
    if(draft.kind!=='room') {
        const cut=await cleanBackground(result.dataUrl,{keyed:draft.kind==='furniture' && getSettings().imageCutout, hard:draft.theme==='pixel'});
        result={...result,rawDataUrl:result.dataUrl,cutDataUrl:cut.cutout?cut.dataUrl:'',dataUrl:cut.dataUrl,cutoutNote:cut.cutoutNote,useRaw:false};
    }
    if(signal?.aborted) throw new DOMException('已取消','AbortError');
    return {...draft,...result, generatedPrompt:draft.prompt, generatedNegative:draft.negative};
}
// 预览里在「去背景的」和「原图」之间切换
export function toggleRawArt(draft) {
    if(!draft?.cutDataUrl || !draft.rawDataUrl) return draft;
    const useRaw=!draft.useRaw;
    return {...draft,useRaw,dataUrl:useRaw?draft.rawDataUrl:draft.cutDataUrl};
}
export async function acceptArt(char,draft,{signal}={}) {
    const home=getHome(char),target=artTarget(home,draft.kind,draft.id);
    if(!target||characterKey(char)!==draft.owner||home.house!==draft.house||homeTheme(home)!==draft.theme) throw new Error('小屋或绘制对象已改变，请重新预览');
    const path=await saveImage(draft.dataUrl,char.name || home.charName,{signal,pixelArt:draft.theme==='pixel'});
    if(signal?.aborted || getHome(char)?.house!==draft.house || artTarget(getHome(char),draft.kind,draft.id)!==target) throw new Error('保存期间小屋已改变，原素材未替换');
    target.art={path,theme:draft.theme,prompt:draft.generatedPrompt,negative:draft.generatedNegative,seed:draft.seed,model:draft.model,width:draft.width,height:draft.height,at:Date.now()};
    // 新画的房间背景保存后直接显示（之前切到纯色墙地的也切回来）
    if(draft.kind==='room') delete target.useArt;
    setHome(char,home);return target.art;
}
