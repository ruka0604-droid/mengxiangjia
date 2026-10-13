// 梦想家 · 可选浮窗入口。按钮点击打开，拖动只移动位置。
import { getSettings, updateSettings, currentCharacter, getHome } from './settings.js?mxj=0.6.10';
import { homeTheme } from './theme.js?mxj=0.6.10';

const ID = 'mxj-floating-entry';
const SIZE = 56;
let button = null, openPanel = null, drag = null, skipClick = false;
let removeListeners = [];
const iconUrl = new URL('./floating-house.png', import.meta.url).href;

export function floatBounds(viewport) {
    const x = Number(viewport?.offsetLeft) || 0, y = Number(viewport?.offsetTop) || 0;
    const width = Math.max(SIZE, Number(viewport?.width) || 390), height = Math.max(SIZE, Number(viewport?.height) || 844);
    return {left:x+8, top:y+8, width:Math.max(0,width-SIZE-16), height:Math.max(0,height-SIZE-16)};
}
export function floatPoint(position, bounds) {
    const ratio = (n, fallback) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0,Math.min(1,n)) : fallback;
    return {x:bounds.left+ratio(position?.x,1)*bounds.width,y:bounds.top+ratio(position?.y,0.62)*bounds.height};
}
function bounds() {
    return floatBounds(globalThis.visualViewport || {width:globalThis.innerWidth,height:globalThis.innerHeight});
}
function place(point) {
    if (!button) return;
    button.style.left = `${point.x}px`; button.style.top = `${point.y}px`;
}
function layout() { if (button) place(floatPoint(getSettings().floatingPosition,bounds())); }
function listen(target,event,fn,options) {
    target.addEventListener(event,fn,options);
    removeListeners.push(()=>target.removeEventListener(event,fn,options));
}
function stopDrag(event, cancelled = false) {
    if(!drag || event.pointerId!==drag.id) return;
    const d=drag; drag=null;skipClick=d.moved || cancelled;
    if(d.moved && !cancelled) {
        const b=bounds();
        updateSettings({floatingPosition:{x:b.width ? (d.x-b.left)/b.width : 0,y:b.height ? (d.y-b.top)/b.height : 0}});
    }
    try {button?.releasePointerCapture(d.id);} catch {}
    button?.classList.remove('is-dragging');
    layout();
}
export function mountFloating(callback) {
    openPanel=callback;
    if(button?.isConnected) {refreshFloating();return;}
    button=document.createElement('button');button.id=ID;button.type='button';button.setAttribute('aria-label','打开梦想家（可以拖动）');button.setAttribute('aria-haspopup','dialog');button.title='梦想家 · 拖动调整位置';
    const image=document.createElement('img');image.src=iconUrl;image.alt='';image.draggable=false;
    button.append(image);document.body.append(button);
    listen(button,'pointerdown',event=>{
        if(event.button!==0) return;
        const rect=button.getBoundingClientRect();skipClick=false;
        drag={id:event.pointerId,clientX:event.clientX,clientY:event.clientY,startX:rect.left,startY:rect.top,x:rect.left,y:rect.top,moved:false};
        try {button.setPointerCapture(event.pointerId);} catch {}
    });
    listen(button,'pointermove',event=>{
        if(!drag || drag.id!==event.pointerId) return;
        const dx=event.clientX-drag.clientX,dy=event.clientY-drag.clientY;
        if(!drag.moved && Math.hypot(dx,dy)<8) return;
        drag.moved=true;button.classList.add('is-dragging');
        const b=bounds();drag.x=Math.min(b.left+b.width,Math.max(b.left,drag.startX+dx));drag.y=Math.min(b.top+b.height,Math.max(b.top,drag.startY+dy));place(drag);
    });
    listen(button,'pointerup',event=>stopDrag(event));
    listen(button,'pointercancel',event=>stopDrag(event,true));
    listen(button,'click',event=>{
        if(skipClick && event.detail!==0) {skipClick=false;event.preventDefault();return;}
        skipClick=false;void openPanel?.();
    });
    listen(globalThis.window,'resize',layout);
    if(globalThis.visualViewport) {listen(globalThis.visualViewport,'resize',layout);listen(globalThis.visualViewport,'scroll',layout);}
    refreshFloating();
}
export function refreshFloating() {
    if(!button) return;
    const isOpen=document.getElementById('mxj-root')?.open;
    button.hidden=!getSettings().floatingLauncher || !!isOpen;
    const char=currentCharacter();button.dataset.theme=homeTheme(char ? getHome(char) : null);
    layout();
}
export function destroyFloating() {
    for(const remove of removeListeners) remove();removeListeners=[];
    if(drag) try {button?.releasePointerCapture(drag.id);} catch {}
    button?.remove();button=null;openPanel=null;drag=null;skipClick=false;
}
