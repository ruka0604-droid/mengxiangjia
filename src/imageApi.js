// 梦想家独立生图连接。图片直接请求使用者配置的服务，不读取其他扩展。
import { getSettings } from './settings.js?mxj=0.8.1';
import { ctx, uid } from './util.js?mxj=0.8.1';
import { inflateRaw } from './inflate.js?mxj=0.8.1';

export function imageEndpoint(value) {
    const u = new URL(String(value || '').trim());
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('请填写有效的 API 地址');
    if (!/\/generate-image\/?$/.test(u.pathname)) u.pathname = u.pathname.replace(/\/$/, '').replace(/\/ai$/, '') + '/ai/generate-image';
    return u.href;
}
// 4 代及以后的模型只认结构化描述，选成「基础描述」会直接报 500
export function needsStructured(model) {
    return /diffusion-(?:[4-9]|\d{2,})/i.test(String(model || ''));
}
// Key 前面多粘了「Bearer」、带了空格换行，都整理掉
export function cleanImageKey(key) {
    return String(key || '').replace(/^\s*bearer\s+/i, '').replace(/\s+/g, '');
}
// 填写检查：看得出明显填错的地方就直接说
export function imageConfigProblems(s) {
    const out = [];
    try { imageEndpoint(s.imageBaseUrl); } catch { out.push('API 地址不是有效的网址（要以 https:// 开头）'); }
    const key = cleanImageKey(s.imageKey);
    if (!key) out.push('还没填 API Key');
    else if (/[^\x21-\x7e]/.test(key)) out.push('API Key 里有中文或全角字符，可能粘错了');
    const model = String(s.imageModel || '').trim();
    if (!model) out.push('还没填模型 ID');
    else if (/\s|[^\x21-\x7e]/.test(model)) out.push(`模型 ID「${model}」里有空格或中文，不像服务给的英文 ID。要填服务文档里的完整模型 ID，不是网站上显示的名字`);
    if (s.imagePromptFormat !== 'structured' && needsStructured(model)) out.push('这个模型要用「结构化描述」，插件生图时会自动按结构化描述发送');
    return out;
}

// 画布大小：人物和竖长家具用「人物宽高」，房间和扁家具用「房间／家具宽高」，方的家具取两者面积开方（按 64 取整，不超过原面积）
export function imageSize(s, shape) {
    if (shape === true || shape === 'portrait') return { width: Number(s.imagePortraitWidth), height: Number(s.imagePortraitHeight) };
    const width = Number(s.imageWidth), height = Number(s.imageHeight);
    if (shape !== 'square') return { width, height };
    const side = Math.max(64, Math.floor(Math.sqrt(width * height) / 64) * 64);
    return { width: side, height: side };
}

export function imageRequest(s, prompt, negative, shape = false) {
    const seed = Number(s.imageSeed) || crypto.getRandomValues(new Uint32Array(1))[0];
    const { width, height } = imageSize(s, shape);
    let extra = {};
    try { extra = JSON.parse(s.imageExtra || '{}'); } catch { throw new Error('高级参数需要有效的 JSON 对象'); }
    if (!extra || Array.isArray(extra) || typeof extra !== 'object') throw new Error('高级参数需要 JSON 对象');
    const parameters = {
        ...extra, width, height, steps: Number(s.imageSteps), scale: Number(s.imageScale),
        sampler: s.imageSampler, noise_schedule: s.imageNoise, seed, n_samples: 1,
        negative_prompt: negative, ucPreset: 0, qualityToggle: false,
    };
    // 新版模型的描述字段，旧版模型保持原请求格式；使用者可选择。
    if (s.imagePromptFormat === 'structured' || needsStructured(s.imageModel)) {
        parameters.params_version = 3;
        parameters.v4_prompt = { caption: {base_caption: prompt, char_captions: []}, use_coords: false, use_order: true };
        parameters.v4_negative_prompt = {caption: {base_caption: negative, char_captions: []}, legacy_uc: false};
    }
    return {input: prompt, model: s.imageModel.trim(), action: 'generate', parameters};
}

// 独立 ZIP 中央目录读取，只提取第一张图片，支持 stored/deflate。
export function unzipImage(buffer) {
    const b = new Uint8Array(buffer); const v = new DataView(b.buffer,b.byteOffset,b.byteLength);
    let end = -1;
    for (let i=b.length-22;i>=Math.max(0,b.length-65557);i--) if(v.getUint32(i,true)===0x06054b50){end=i;break;}
    if(end<0) throw new Error('图片压缩包格式无法识别');
    let at=v.getUint32(end+16,true); const count=v.getUint16(end+10,true);
    for(let n=0;n<count;n++) {
        if(at+46>b.length || v.getUint32(at,true)!==0x02014b50) throw new Error('图片压缩包目录损坏');
        const flags=v.getUint16(at+8,true), method=v.getUint16(at+10,true), size=v.getUint32(at+20,true), rawSize=v.getUint32(at+24,true);
        const names=v.getUint16(at+28,true), extras=v.getUint16(at+30,true), comments=v.getUint16(at+32,true), local=v.getUint32(at+42,true);
        const name=new TextDecoder().decode(b.subarray(at+46,at+46+names));
        if(/\.(png|jpe?g|webp)$/i.test(name)) {
            if(flags&1 || rawSize>40*1024*1024 || local+30>b.length) throw new Error('图片压缩包不受支持');
            const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
            if(start+size>b.length) throw new Error('图片压缩包内容不完整');
            const packed=b.subarray(start,start+size);
            let bytes=null;
            try { bytes=method===0?packed:method===8?inflateRaw(packed):null; } catch { throw new Error('图片解压失败，返回的压缩包可能不完整'); }
            if(!bytes || bytes.length!==rawSize) throw new Error('图片解压失败');
            return new Blob([bytes],{type:/\.webp$/i.test(name)?'image/webp':/\.jpe?g$/i.test(name)?'image/jpeg':'image/png'});
        }
        at+=46+names+extras+comments;
    }
    throw new Error('服务没有返回图片');
}
export async function decodeImage(response) {
    const type=(response.headers.get('content-type') || '').toLowerCase();
    if(type.startsWith('image/')) return response.blob();
    if(type.includes('json')) {
        const d=await response.json(); const b64=d.data?.[0]?.b64_json || d.b64_json || d.image || d.images?.[0];
        if(typeof b64==='string' && !/^https?:/i.test(b64)) {
            const payload=b64.replace(/^data:image\/[^;]+;base64,/, '');
            let bytes; try {bytes=Uint8Array.from(atob(payload),c=>c.charCodeAt(0));} catch {throw new Error('服务返回的图片编码无法解析');}
            return new Blob([bytes],{type:b64.startsWith('data:image/jpeg')?'image/jpeg':b64.startsWith('data:image/webp')?'image/webp':'image/png'});
        }
        throw new Error('此服务的图片返回格式尚不支持；需要接口文档适配');
    }
    return unzipImage(await response.arrayBuffer());
}
// 服务拒绝时通常会写明原因（比如模型名不对），取出来给使用者看；去掉密钥样子的内容
async function errorReason(response) {
    let raw='';
    try { raw=await response.text(); } catch { return ''; }
    let msg=raw;
    try { const j=JSON.parse(raw); msg=j?.message||j?.error?.message||(typeof j?.error==='string'?j.error:'')||j?.detail||''; } catch { if(/<html|<!doctype/i.test(raw)) msg=''; }
    return String(msg||'').replace(/Bearer\s+\S+/gi,'Bearer [已隐藏]').replace(/\b(?:sk|pst)-[A-Za-z0-9_\-]{6,}/g,'[已隐藏]').replace(/\s+/g,' ').trim().slice(0,200);
}

// 常用的生图模型 ID（作者 2026-10 要求列出，大家不知道完整 ID 怎么填）。官方生图服务没有模型列表接口，
// 地址是官方服务、或别的地址拉不到列表时，就给这份。新模型出来时在这里加。
export const RECOMMENDED_IMAGE_MODELS = [
    { id: 'nai-diffusion-4-5-full', note: '推荐 · 完整版，用的人最多' },
    { id: 'nai-diffusion-4-5-curated', note: '精选版，画面更稳' },
    { id: 'nai-diffusion-5-full', note: '最新 · 完整版' },
    { id: 'nai-diffusion-5-curated', note: '最新 · 精选版' },
    { id: 'nai-diffusion-4-full', note: '上一代 · 完整版' },
    { id: 'nai-diffusion-4-curated-preview', note: '上一代 · 精选版' },
    { id: 'nai-diffusion-3', note: '旧版，描述格式要选「基础描述」' },
    { id: 'nai-diffusion-furry-3', note: '旧版兽人画风，描述格式要选「基础描述」' },
];
function isOfficialImageHost(baseUrl) {
    try { return /(^|\.)novelai\.net$/i.test(new URL(String(baseUrl || '').trim()).host); } catch { return false; }
}

// 拉取生图模型列表：根地址、/v1 地址、完整生图地址都可以；不改动已保存的地址。
// 很多生图服务不提供模型列表或不允许浏览器直接访问，这时手动填模型 ID。
export async function fetchImageModels(baseUrl, apiKey) {
    // 官方服务不提供模型列表，直接给常用模型
    if (isOfficialImageHost(baseUrl)) return { models: RECOMMENDED_IMAGE_MODELS.map(m => m.id), recommended: true };
    let url;
    try { url = new URL(String(baseUrl || '').trim()); }
    catch { throw new Error('请先填写有效的生图 API 地址'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('生图 API 地址格式不正确');
    if (url.search || url.hash) throw new Error('请使用不含查询参数的 API 地址拉取模型');
    let path = url.pathname.replace(/\/+$/, '');
    path = path.replace(/\/(?:ai\/generate-image|images\/generations|generate-image|generate|models)\/?$/i, '');
    const bases = [path];
    if (/\/v1$/i.test(path)) bases.push(path.replace(/\/v1$/i, ''));
    else bases.push(path + '/v1');
    const candidates = [...new Set(bases.map(p => url.origin + (p || '') + '/models'))];
    const failures = [];
    for (const endpoint of candidates) {
        try {
            const response = await fetch(endpoint, {
                method: 'GET', credentials: 'omit', redirect: 'follow',
                headers: apiKey ? { Authorization: `Bearer ${String(apiKey).trim()}`, Accept: 'application/json' } : { Accept: 'application/json' },
            });
            const raw = await response.text();
            if (/<\s*(?:!doctype|html|head|body)\b/i.test(raw.slice(0, 400))) { failures.push('返回网页而非模型数据'); continue; }
            if (!response.ok) { failures.push(`HTTP ${response.status}`); continue; }
            let payload;
            try { payload = JSON.parse(raw); } catch { failures.push('返回内容不是有效 JSON'); continue; }
            const entries = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : Array.isArray(payload) ? payload : [];
            const models = [...new Set(entries.map(m => typeof m === 'string' ? m : (m?.id || m?.name || '')).filter(Boolean))];
            if (models.length) return { models, recommended: false };
            failures.push('返回了 JSON，但没有可识别的模型列表');
        } catch (error) {
            failures.push(error instanceof TypeError ? '浏览器网络或跨域访问失败' : String(error?.message || '请求失败'));
        }
    }
    // 拉不到就给常用模型，并说明原因
    return { models: RECOMMENDED_IMAGE_MODELS.map(m => m.id), recommended: true, failed: [...new Set(failures)].join('；') };
}

export function blobDataUrl(blob) {
    return new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=()=>reject(new Error('读取图片失败'));f.readAsDataURL(blob);});
}
export async function requestImage(prompt,{negative='',portrait=false,shape,signal}={}) {
    const s={...getSettings()};
    if(!s.imageBaseUrl || !s.imageKey || !s.imageModel) throw new Error('请先填写生图地址、密钥和模型 ID');
    const body=imageRequest(s,prompt,negative,shape || portrait);
    let response;
    try { response=await fetch(imageEndpoint(s.imageBaseUrl),{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',Authorization:`Bearer ${cleanImageKey(s.imageKey)}`},body:JSON.stringify(body),signal}); }
    catch(e){if(signal?.aborted) throw e; throw new Error('连不上生图服务，请求没发出去。常见原因：网络或代理不通（手机上可以开关一下代理再试）；API 地址填错了（填服务的网址就行，插件会自动补上生图路径）；这个地址不允许从浏览器直接访问。');}
    if(!response.ok) {
        const reason=await errorReason(response);
        const st=response.status;
        const head=st===401||st===403?`生图鉴权失败（HTTP ${st}）：API Key 不对或已失效。要填服务给的持久令牌，不是登录密码`
            :st===402?'生图额度不够（HTTP 402）：账号余额不足，或这次的尺寸、步数超出了免费范围。可以在设置的「画幅与高级参数」里把尺寸、步数调小再试'
            :st===404?'生图地址不对（HTTP 404）：API 地址填服务的网址就行，插件会自动补上生图路径'
            :st===409||st===429?`生图服务正忙（HTTP ${st}）：同一个账号同时只能画一张，网页上也在画的话会冲突。稍等一会儿再点「绘制一张」`
            :st===400?'生图请求被拒绝（HTTP 400）：多半是模型 ID 填错了，要填服务文档里的完整模型 ID'
            :st>=500?(s.imagePromptFormat!=='structured'?`生图服务出错（HTTP ${st}）：描述格式请改成「结构化描述」再试`:`生图服务出错（HTTP ${st}），可以稍后再试一次`)
            :`生图请求失败（HTTP ${st}）`;
        throw new Error(reason?`${head}。服务说：${reason}`:head);
    }
    const blob=await decodeImage(response);
    if(signal?.aborted) throw new DOMException('已取消','AbortError');
    const dataUrl=await blobDataUrl(blob);
    // 解码一次，阻止“成功响应但没有图片”的情况覆盖已有素材。
    const dimensions=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>reject(new Error('返回内容不是可显示的图片'));image.src=dataUrl;});
    return {dataUrl,seed:body.parameters.seed,model:body.model,...dimensions};
}
/** Optimize once before persistent upload. Never strip transparency or enlarge an image. */
export async function compressImageForUpload(dataUrl,{pixelArt=false}={}) {
    const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('无法解码待压缩图片'));i.src=dataUrl;});
    const maxSide=pixelArt?1024:1600;
    const longest=Math.max(image.naturalWidth,image.naturalHeight);
    // 像素图只按整数倍缩小（1/2、1/3……），每个像素格大小一致，不会忽大忽小
    const scale=pixelArt ? 1/Math.max(1,Math.ceil(longest/maxSide)) : Math.min(1,maxSide/longest);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.imageSmoothingEnabled=!pixelArt;
    if(!pixelArt)context.imageSmoothingQuality='high';
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
    let transparent=false;
    for(let i=3;i<pixels.length;i+=4){if(pixels[i]!==255){transparent=true;break;}}
    // Preserve transparent outlines with lossless PNG; for opaque art use high-quality WebP.
    const type=transparent?'image/png':'image/webp';
    const result=canvas.toDataURL(type,0.9);
    // If WebP is unsupported, the browser may silently fall back to PNG.
    if(!/^data:image\/(png|webp);base64,/.test(result))return dataUrl;
    return result.length<dataUrl.length?result:dataUrl;
}
export async function saveImage(dataUrl, charName, {signal,pixelArt=false}={}) {
    dataUrl=await compressImageForUpload(dataUrl,{pixelArt});
    const match=String(dataUrl).match(/^data:image\/(png|jpeg|webp);base64,(.+)$/s);
    if(!match) throw new Error('图片无法保存');
    const c=ctx();let headers=c.getRequestHeaders;
    if(typeof headers!=='function') try {headers=(await import('../../../../../script.js')).getRequestHeaders;}catch{}
    if(typeof headers!=='function') throw new Error('当前酒馆缺少图片保存所需能力，请更新酒馆');
    // 文件夹名里去掉 # % ? 这类会让图片地址失效的字符
    const folder=('梦想家_'+String(charName||'角色')).replace(/[\\/:*?"<>|#%&{}\[\]^`~]+/g,'_').replace(/\.{2,}/g,'_').replace(/\s+/g,' ').trim().slice(0,60)||'梦想家';
    const response=await fetch('/api/images/upload',{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({image:match[2],format:match[1]==='jpeg'?'jpg':match[1],ch_name:folder,filename:uid('mxj')}),signal});
    if(!response.ok) throw new Error(`图片保存失败（HTTP ${response.status}），当前预览仍保留，可重试保存`);
    const d=await response.json(); const path=String(d.path || '');
    if(!path || /^(?:[a-z]+:|\/\/)/i.test(path) || path.includes('..')) throw new Error('酒馆返回的图片路径无效');
    const clean=path.startsWith('/')?path:'/'+path;
    // 路径里有中文或空格时转成网址能用的写法
    return clean.split('/').map(seg=>{try{return encodeURIComponent(decodeURIComponent(seg));}catch{return encodeURIComponent(seg);}}).join('/');
}
