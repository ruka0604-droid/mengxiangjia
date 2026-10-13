// 梦想家独立生图连接。图片直接请求使用者配置的服务，不读取其他扩展。
import { getSettings } from './settings.js?mxj=0.5.11';
import { ctx, uid } from './util.js?mxj=0.5.11';
import { inflateRaw } from './inflate.js?mxj=0.5.11';

export function imageEndpoint(value) {
    const u = new URL(String(value || '').trim());
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('请填写有效的 API 地址');
    if (!/\/generate-image\/?$/.test(u.pathname)) u.pathname = u.pathname.replace(/\/$/, '').replace(/\/ai$/, '') + '/ai/generate-image';
    return u.href;
}
export function imageRequest(s, prompt, negative, portrait = false) {
    const seed = Number(s.imageSeed) || crypto.getRandomValues(new Uint32Array(1))[0];
    const width = Number(portrait ? s.imagePortraitWidth : s.imageWidth);
    const height = Number(portrait ? s.imagePortraitHeight : s.imageHeight);
    let extra = {};
    try { extra = JSON.parse(s.imageExtra || '{}'); } catch { throw new Error('高级参数需要有效的 JSON 对象'); }
    if (!extra || Array.isArray(extra) || typeof extra !== 'object') throw new Error('高级参数需要 JSON 对象');
    const parameters = {
        ...extra, width, height, steps: Number(s.imageSteps), scale: Number(s.imageScale),
        sampler: s.imageSampler, noise_schedule: s.imageNoise, seed, n_samples: 1,
        negative_prompt: negative, ucPreset: 0, qualityToggle: false,
    };
    // 新版模型的描述字段，旧版模型保持原请求格式；使用者可选择。
    if (s.imagePromptFormat === 'structured') {
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
            const packed=b.subarray(start,start+size); const bytes=method===0?packed:method===8?inflateRaw(packed):null;
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
export function blobDataUrl(blob) {
    return new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=()=>reject(new Error('读取图片失败'));f.readAsDataURL(blob);});
}
export async function requestImage(prompt,{negative='',portrait=false,signal}={}) {
    const s={...getSettings()};
    if(!s.imageBaseUrl || !s.imageKey || !s.imageModel) throw new Error('请先填写生图地址、密钥和模型 ID');
    const body=imageRequest(s,prompt,negative,portrait);
    let response;
    try { response=await fetch(imageEndpoint(s.imageBaseUrl),{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.imageKey.trim()}`},body:JSON.stringify(body),signal}); }
    catch(e){if(signal?.aborted) throw e; throw new Error('生图服务无法连接。请核对地址、网络及服务的跨域支持。');}
    if(!response.ok) throw new Error(response.status===429?'生图服务限流，请稍后手动重试':response.status===401||response.status===403?'生图鉴权失败，请检查密钥和权限':`生图请求失败（HTTP ${response.status}），请核对模型和参数`);
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
    const scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
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
    const response=await fetch('/api/images/upload',{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({image:match[2],format:match[1]==='jpeg'?'jpg':match[1],ch_name:'梦想家_'+charName,filename:uid('mxj')}),signal});
    if(!response.ok) throw new Error(`图片保存失败（HTTP ${response.status}），当前预览仍保留，可重试保存`);
    const d=await response.json(); const path=String(d.path || '');
    if(!path || /^(?:[a-z]+:|\/\/)/i.test(path) || path.includes('..')) throw new Error('酒馆返回的图片路径无效');
    return path.startsWith('/')?path:'/'+path;
}
