// 梦想家素材流程：固定主题 → 英文画面描述 → 生图预览 → 使用者确认保存。
import { generate } from './api.js?mxj=0.5.6';
import { gatherContext, contextBlock } from './character.js?mxj=0.5.6';
import { homeTheme } from './theme.js?mxj=0.5.6';
import { getHome, getSettings, setHome, characterKey } from './settings.js?mxj=0.5.6';
import { requestImage, saveImage, blobDataUrl } from './imageApi.js?mxj=0.5.6';

export const ART_STYLES = {
    scrapbook: 'warm watercolor and colored pencil illustration, vintage botanical scrapbook, textured handmade paper feeling, delicate ink outlines, cream and olive and honey brown palette, cozy lived-in atmosphere',
    pixel: 'detailed pixel art game asset, intentional crisp square pixels, limited harmonious palette, hand placed pixel shading, sea salt soda coastal cottage, soda blue and deep ocean blue, creamy ivory, pale sand gold, coral peach, sea glass green, light wood and plants, cozy life simulation game, no smooth gradients, no photographic rendering',
    storybook: 'refined romantic otome visual novel illustration, elegant storybook painting, soft cinematic sunlight, delicate line art and rich material detail, cream ivory dusty rose and pale gold palette, graceful proportions, no pixel art',
};
// Only portrait prompts use these chibi presets. House/furniture prompts remain unchanged.
export const CHIBI_STYLES = Object.freeze({
    pixel: 'Highly detailed Japanese pixel-art chibi character sprite, approximately 2.5 to 3 heads tall, attractive and age-appropriate, refined expressive pixel eyes, layered hair pixel clusters and highlights, detailed clothing and accessories, crisp hard-edged pixel outlines, controlled pixel dithering, readable silhouette, no blurred pixels, no smooth vector rendering, no 3D',
    storybook: 'Polished Japanese otome-game chibi illustration, approximately 2 to 2.5 heads tall, handsome or beautiful as appropriate to the character, expressive eyes with layered highlights, delicate clean anime linework, softly shaded skin, layered hair, subtle gradients, refined costume details, elegant collectible character-standee quality, no pixel art',
    scrapbook: 'Full-color hand-drawn vintage scrapbook chibi illustration, attractive and age-appropriate, rounded compact chibi proportions, simple yet expressive face, slightly imperfect organic pencil-and-crayon outlines, soft paper-grain texture, harmonious warm hand-colored palette, nuanced flat color shading, delicate hair, clothing and accessory details, charming handmade cut-paper illustration, never monochrome or grayscale, not an unfinished sketch',
});
export const CHIBI_RULES = 'Single full-body character, entire head and feet visible, natural standing pose, front or slight three-quarter view, centered isolated character. Respect canonical gender identity and age, distinctive face, hairstyle, hair color, eye color, skin tone, clothing and accessories from the character card and worldbook. Chibi stylization only, do not turn an adult into a baby or toddler. Do not add beard, moustache, stubble, facial hair, body hair, animal ears or tail unless explicitly stated in the character setting. Do not invent costume changes. Transparent background if supported, no scenery, no typography';
export const ART_NEGATIVE = 'text, watermark, logo, user interface, panels, buttons, collage, duplicated objects, blurry, low quality, distorted anatomy';
export const CHIBI_NEGATIVE = 'baby, toddler, infant, infantilized adult, randomly changed gender, invented beard, invented moustache, invented stubble, invented body hair, invented animal ears, invented tail, missing feet, cropped body, grayscale, monochrome, text, watermark, blurry, deformed limbs, extra people';
export function artTarget(home, kind, id) {
    return kind==='portrait' ? home : kind==='room' ? home?.house?.rooms.find(x=>x.id===id) : home?.house?.furniture.find(x=>x.id===id);
}
export function artPrompt(theme,kind,description,cutout) {
    if (kind === 'portrait') {
        const background = cutout ? 'solid flat bright magenta background RGB 255 0 255, no shadows on background, avoid magenta-colored character details' : 'transparent background';
        return `${CHIBI_STYLES[theme] || CHIBI_STYLES.pixel}. ${CHIBI_RULES}. Canonical character appearance: ${description}. ${background}.`;
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
    const theme=homeTheme(home), info=await gatherContext(char);
    const subject=kind==='portrait'?`Character appearance confirmed by the user: ${home.appearance || info.char.description}`:kind==='room'?`Room: ${target.name}. ${target.note || ''}. House: ${home.house.story || ''}. Wall color: ${target.wall || home.house.palette.wall}. Floor color: ${target.floor || home.house.palette.floor}.`:`Furniture: ${target.name}; type: ${target.type}; color: ${target.color || home.house.palette.accent}.`;
    const text=await generate({system:kind==='portrait'
        ? 'Extract a concise English visual description of THIS character from the character card, linked worldbook and user-confirmed appearance. Use canonical gender and age only if stated; do not assume male or female. If gender or age is unspecified or contradictory, keep it unspecified rather than guessing. Preserve explicit facial features, hairstyle, colors, clothing and accessories. Do not add facial hair, body hair, animal ears or tail unless explicitly stated. Do not infantilize an adult. Output plain English only, no markdown, no new invented features.'
        : 'Write a concise English image description for the requested asset. Preserve only the requested subject and confirmed physical features. Do not infer gender or age when not stated. Do not include UI, words, extra people, or any artist name. Output plain English only, without JSON or markdown.',user:`${contextBlock(info,{withRecent:false})}\n\nRequested asset: ${kind}\n${subject}`,signal,maxTokens:650});
    if(signal?.aborted) throw new DOMException('已取消','AbortError');
    const prompt=artPrompt(theme,kind,text.replace(/```/g,'').trim(),getSettings().imageCutout && kind!=='room');
    return {kind,id,theme,prompt,negative:kind==='portrait'?`${CHIBI_NEGATIVE}, ${ART_NEGATIVE}`:ART_NEGATIVE,owner:characterKey(char),house:home.house};
}
export async function generateArt(draft,{signal}={}) {
    draft = {...draft};
    let result=await requestImage(draft.prompt,{negative:draft.negative,portrait:draft.kind==='portrait',signal});
    if(draft.kind!=='room' && getSettings().imageCutout) result={...result,...await keyBackground(result.dataUrl)};
    if(signal?.aborted) throw new DOMException('已取消','AbortError');
    return {...draft,...result, generatedPrompt:draft.prompt, generatedNegative:draft.negative};
}
// 只清除与图像边缘相连的纯洋红底，保留图内衣服、头发等颜色。
export async function keyBackground(dataUrl) {
    const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=dataUrl;});
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const c=canvas.getContext('2d');c.drawImage(image,0,0);const pixels=c.getImageData(0,0,canvas.width,canvas.height), d=pixels.data,w=canvas.width,h=canvas.height;
    const visited=new Uint8Array(w*h), q=new Uint32Array(w*h);let head=0,tail=0,removed=0;
    const matches=n=>d[n*4]>210 && d[n*4+1]<65 && d[n*4+2]>210 && d[n*4+3]>0;
    const add=n=>{if(n<0||n>=w*h||visited[n]||!matches(n))return;visited[n]=1;q[tail++]=n;};
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const n=q[head++];d[n*4+3]=0;removed++;if(n%w)add(n-1);if(n%w<w-1)add(n+1);add(n-w);add(n+w);}
    if(removed){c.putImageData(pixels,0,0);return {dataUrl:canvas.toDataURL('image/png'),cutoutNote:'已去除与边缘相连的纯色背景，请核对发丝和轮廓。'};}
    if(d.some((value,index)=>index%4===3 && value<255)) return {dataUrl,cutoutNote:'图片已有透明区域，请核对人物或家具轮廓。'};
    return {dataUrl,cutoutNote:'未检测到可去除的纯色背景；请检查预览，背景不合适时可修改提示词重画。'};
}
export async function acceptArt(char,draft,{signal}={}) {
    const home=getHome(char),target=artTarget(home,draft.kind,draft.id);
    if(!target||characterKey(char)!==draft.owner||home.house!==draft.house||homeTheme(home)!==draft.theme) throw new Error('小屋或绘制对象已改变，请重新预览');
    const path=await saveImage(draft.dataUrl,char.name || home.charName,{signal,pixelArt:draft.theme==='pixel'});
    if(signal?.aborted || getHome(char)?.house!==draft.house || artTarget(getHome(char),draft.kind,draft.id)!==target) throw new Error('保存期间小屋已改变，原素材未替换');
    target.art={path,theme:draft.theme,prompt:draft.generatedPrompt,negative:draft.generatedNegative,seed:draft.seed,model:draft.model,width:draft.width,height:draft.height,at:Date.now()};
    setHome(char,home);return target.art;
}
