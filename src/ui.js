import { refreshFloating } from './floating.js?mxj=0.5.7';
import { prepareArt, generateArt, acceptArt } from './art.js?mxj=0.5.7';
import { imageEndpoint, imageRequest } from './imageApi.js?mxj=0.5.7';
import { THEMES, homeTheme, themeName, moodFace } from './theme.js?mxj=0.5.7';
// 梦想家 · 界面
import { esc, formatTime, daysSince, LOG_PREFIX, ctx, clip } from './util.js?mxj=0.5.7';
import { getSettings, updateSettings, currentCharacter, characterKey, getHome, setHome, removeHome } from './settings.js?mxj=0.5.7';
import { renderRoom, renderFloorPlan, SCENE_W, SCENE_H, CATALOG } from './furniture.js?mxj=0.5.7';
import { characterView, avatarUrl } from './character.js?mxj=0.5.7';
import { spriteInRoom, spriteSvg, poseFor, HAIR_STYLES, ACCESSORIES, LOOK_COLORS } from './sprite.js?mxj=0.5.7';
import { HOUSE_SIZES, ROOM_MODULES, roomModulesFromText, addRoomModules, removeRoomModule, upgradeHouse } from './home-rooms.js?mxj=0.5.7';
import { designHouse, createHome, getLook, setLook, generateLook } from './home-house.js?mxj=0.5.7';
import { comeHome, respond, shouldAutoVisit, isAway } from './home-visit.js?mxj=0.5.7';
import { NOTE_KINDS, NOTE_PLACES, postNote, replyToNote, writeCharNote, markCharNotesRead, unreadFromChar } from './home-notes.js?mxj=0.5.7';
import { WEATHERS, DIARY_MODES, getDiary, charTurn, unreadDiary, markDiaryRead, setDiaryMode, addUserEntry, writeCharDiary } from './home-diary.js?mxj=0.5.7';
import { listConnectionProfiles, fetchManualModels, fetchProfileModels, testConnection } from './api.js?mxj=0.5.7';
import { createDecorator } from './decorate.js?mxj=0.5.7';

const ROOT_ID = 'mxj-root';

const ICON = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11l3 3v13H5z"/><path d="M8 10h8M8 14h6"/></svg>',
    house: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    sofa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11V8a3 3 0 013-3h8a3 3 0 013 3v3"/><rect x="3" y="11" width="18" height="6" rx="2"/><path d="M6 17v2M18 17v2"/></svg>',
    diary: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h11a2 2 0 012 2v16H8a2 2 0 01-2-2z"/><path d="M6 19a2 2 0 012-2h11M10 7h6M10 11h4"/></svg>',
    log: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 21V5M9 8h6M9 12h6"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 7l8 6 8-6"/></svg>',
    pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 11-2.3-5.6M20 4v5h-5"/></svg>',
};

const state = {
    view: 'home',
    busy: '',
    error: '',
    toast: '',
    abort: null,
    selectedFurniture: '',
    draft: { theme: 'pixel', size: 'flat', extra: '', emptyWall: true, proposal: null },
    composer: { kind: '日常', place: '门边', text: '', deferred: true },
    models: [],
    changelog: null,
    roomExtra: '',
    expandOpen: false,
    modelFilter: '',
    diaryDraft: { weather: '晴', text: '', quote: null, picking: false },
    diaryAll: false,
    artDraft: null,
};

let root = null;
let viewportCleanup = null;
let originFocus = null;
const decorator = createDecorator({ state, render, run, flash, getRoot: () => root });

// ---------------- 打开 / 关闭 ----------------

function ensureRoot() {
    if (root?.isConnected) return root;
    root = document.createElement('dialog');
    root.id = ROOT_ID;
    root.className = 'mxj-root';
    root.setAttribute('aria-label', '梦想家');
    root.innerHTML = `
      <div class="mxj-window" role="document">
        <header class="mxj-top">
          <button type="button" class="mxj-icon-btn mxj-back" data-act="close" aria-label="关闭梦想家"></button>
          <div class="mxj-titles"><div class="mxj-title"></div><div class="mxj-subtitle"></div></div>
          <button type="button" class="mxj-icon-btn" data-act="settings" aria-label="设置">${ICON.gear}</button>
        </header>
        <div class="mxj-status" hidden></div>
        <main class="mxj-main"></main>
      </div>`;
    if (globalThis.__TAURITAVERN__?.api?.layout) {
        root.setAttribute('data-tt-mobile-surface', 'backdrop');
        root.firstElementChild.setAttribute('data-tt-mobile-surface', 'fullscreen-window');
    }
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeydown);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('toggle', event => {
        if (event.target?.classList?.contains('mxj-expand')) state.expandOpen = event.target.open;
    }, true);
    root.addEventListener('cancel', event => {
        event.preventDefault();
        // 按返回键或 Esc：有确认框就只关确认框
        if (root.querySelector('.mxj-confirm')) dismissConfirm();
        else close();
    });
    document.body.append(root);
    return root;
}

function syncViewport() {
    if (!root) return;
    const vv = globalThis.visualViewport;
    const width = vv?.width || innerWidth;
    const height = vv?.height || innerHeight;
    root.style.setProperty('--mxj-vw', `${width}px`);
    root.style.setProperty('--mxj-vh', `${height}px`);
    root.style.setProperty('--mxj-vl', `${vv?.offsetLeft || 0}px`);
    root.style.setProperty('--mxj-vt', `${vv?.offsetTop || 0}px`);
}

function watchViewport() {
    syncViewport();
    const vv = globalThis.visualViewport;
    vv?.addEventListener('resize', syncViewport);
    vv?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    viewportCleanup = () => {
        vv?.removeEventListener('resize', syncViewport);
        vv?.removeEventListener('scroll', syncViewport);
        window.removeEventListener('resize', syncViewport);
    };
}

export function open() {
    ensureRoot();
    originFocus = document.activeElement;
    const char = currentCharacter();
    const home = char ? getHome(char) : null;
    state.error = '';
    state.artDraft = null;
    state.selectedFurniture = '';
    state.view = !char ? 'nochar' : (home?.house ? 'home' : 'build');
    state.draft = { theme: homeTheme(home), size: 'flat', extra: '', emptyWall: true, proposal: null };
    root.hidden = false;
    if (typeof root.showModal === 'function') {
        if (!root.open) root.showModal();
    } else {
        root.setAttribute('open', '');
    }
    watchViewport();
    refreshFloating();
    render();
    if (char && home?.house && shouldAutoVisit(home) && !state.busy) void doVisit();
}

export function close() {
    if (!root) return;
    if (state.view === 'decorate') {
        decorator.commit();
        state.view = 'home';
    }
    state.abort?.abort();
    dismissConfirm();
    if (root.open && typeof root.close === 'function') root.close();
    root.removeAttribute('open');
    root.hidden = true;
    refreshFloating();
    viewportCleanup?.();
    viewportCleanup = null;
    try {
        originFocus?.focus?.({ preventScroll: true });
    } catch { /* 忽略 */ }
}

export function destroy() {
    close();
    root?.remove();
    root = null;
    document.removeEventListener('submit', onSubmit, true);
}

// 禁用后重新启用时，把表单监听装回来
export function revive() {
    document.removeEventListener('submit', onSubmit, true);
    document.addEventListener('submit', onSubmit, true);
}

// ---------------- 面板内确认框 ----------------
// TT（iOS WebView）里系统的 confirm 弹窗不一定能弹出来，这里在面板里自己画一个。
let confirmDone = null;
function dismissConfirm() {
    if (confirmDone) confirmDone(false);
    root?.querySelector('.mxj-confirm')?.remove();
}

function askConfirm(text, { yes = '确定', no = '取消', danger = false } = {}) {
    return new Promise(resolve => {
        if (!root) return resolve(false);
        dismissConfirm();
        const box = document.createElement('div');
        box.className = 'mxj-confirm';
        box.setAttribute('role', 'alertdialog');
        box.setAttribute('aria-modal', 'true');
        box.innerHTML = `<div class="mxj-confirm-card"><p>${esc(text)}</p><div class="mxj-row">
            <button type="button" class="mxj-btn mxj-grow" data-confirm="no">${esc(no)}</button>
            <button type="button" class="mxj-btn mxj-grow ${danger ? 'is-danger-solid' : 'is-primary'}" data-confirm="yes">${esc(yes)}</button></div></div>`;
        const done = value => {
            if (confirmDone !== done) return;
            confirmDone = null;
            box.remove();
            resolve(value);
        };
        confirmDone = done;
        box.addEventListener('click', event => {
            event.stopPropagation();
            const b = event.target.closest('[data-confirm]');
            if (b) done(b.dataset.confirm === 'yes');
            else if (event.target === box) done(false);
        });
        root.querySelector('.mxj-window').append(box);
        // 危险操作默认把焦点放在「取消」上，免得一按回车就删
        box.querySelector(danger ? '[data-confirm="no"]' : '[data-confirm="yes"]').focus({ preventScroll: true });
    });
}

// 扩建、搬家、加减房间：出错时在面板上说清楚原因，保持滚动位置和展开状态
function roomAction(char, fn, okText) {
    // 确认框弹着的时候可能切了聊天或开始了生成，这时不再动这个家
    if (!char || characterKey(currentCharacter()) !== characterKey(char)) return;
    if (state.busy) {
        flash('正在生成，等这次结束再改房间');
        return;
    }
    try {
        fn();
        state.error = '';
        state.keepScroll = true;
        render();
        if (okText) flash(okText);
    } catch (error) {
        state.error = error?.message || String(error);
        state.keepScroll = true;
        render();
    }
}

// ---------------- 渲染 ----------------

function render() {
    if (!root) return;
    const char = currentCharacter();
    const home = char ? getHome(char) : null;
    root.dataset.theme = home?.house ? homeTheme(home) : state.draft.theme;
    const back = root.querySelector('.mxj-back');
    const isTop = state.view === 'home' || state.view === 'nochar' || (state.view === 'build' && !home?.house);
    back.innerHTML = isTop ? ICON.close : ICON.back;
    back.setAttribute('aria-label', isTop ? '关闭梦想家' : '返回小屋');
    back.dataset.act = isTop ? 'close' : 'back';

    const [title, subtitle] = titles(char, home);
    root.querySelector('.mxj-title').textContent = title;
    root.querySelector('.mxj-subtitle').textContent = subtitle;

    renderStatus();
    const main = root.querySelector('.mxj-main');
    const scrollTop = main.scrollTop;
    const views = { home: viewHome, build: viewBuild, notes: viewNotes, log: viewLog, settings: viewSettings, nochar: viewNoChar, decorate: decorator.view, diary: viewDiary, look: viewLook, art: viewArt };
    main.innerHTML = (views[state.view] || viewHome)(char, home);
    if (state.view === 'decorate' && char) decorator.attach(char);
    main.scrollTop = state.keepScroll ? scrollTop : 0;
    if (state.view === 'settings') {
        // 列表很长时，把选中的模型滚到列表里看得见的位置（只滚列表本身，不动整页）
        const list = main.querySelector('.mxj-model-list');
        const on = list?.querySelector('.mxj-model-item.is-on');
        if (list && on) list.scrollTop = Math.max(0, on.offsetTop - list.offsetTop - list.clientHeight / 2 + on.offsetHeight / 2);
    }
    state.keepScroll = false;
    if (state.view === 'notes' && char && home) markCharNotesRead(char);
    if (state.view === 'diary' && char && home) markDiaryRead(char);
}

function titles(char, home) {
    const name = char ? characterView(char).name : '';
    switch (state.view) {
        case 'build': return [home?.house ? '房子档案' : `给${name}盖一间房`, home?.house ? home.house.name : '按人设设计'];
        case 'notes': return ['小纸条', `${(home?.notes || []).length} 张`];
        case 'log': return ['回家记录', `${(home?.visits || []).length} 次`];
        case 'settings': return ['梦想家设置', '生成 · 读取 · 回家'];
        case 'decorate': return ['布置', home?.house?.name || ''];
        case 'diary': {
            const n = getDiary(home).entries.length;
            return ['交换日记', n ? `第 ${Math.floor((n - 1) / 2) + 1} 页` : '新本子'];
        }
        case 'art': return ['画出我们的家', '预览满意后保存'];
        case 'look': return [`${name}的样子`, home ? themeName(homeTheme(home)) : '人物外貌'];
        case 'nochar': return ['梦想家', ''];
        default: return [home?.house ? `${name}的家` : '梦想家', home?.house ? `${home.house.name} · 住了 ${daysSince(home.createdAt)} 天` : ''];
    }
}

function renderStatus() {
    const el = root.querySelector('.mxj-status');
    if (state.busy) {
        el.hidden = false;
        el.className = 'mxj-status is-busy';
        el.innerHTML = `<span class="mxj-spinner" aria-hidden="true"></span><span>${esc(state.busy)}</span><button type="button" class="mxj-link-btn" data-act="cancel">取消</button>`;
    } else if (state.error) {
        el.hidden = false;
        el.className = 'mxj-status is-error';
        el.innerHTML = `<span>${esc(state.error)}</span><button type="button" class="mxj-link-btn" data-act="dismiss">知道了</button>`;
    } else if (state.toast) {
        el.hidden = false;
        el.className = 'mxj-status is-toast';
        el.innerHTML = `<span>${esc(state.toast)}</span>`;
    } else {
        el.hidden = true;
        el.innerHTML = '';
    }
}

function isNight() {
    const h = new Date().getHours();
    return h >= 19 || h < 6;
}

function viewNoChar() {
    return `<section class="mxj-card mxj-empty">
      <p>先打开一个角色的单人聊天，再从魔法棒进入梦想家。</p>
      <p class="mxj-muted">每个角色都有自己的家，群聊暂时不支持。</p>
    </section>`;
}

function viewHome(char, home) {
    if (!home?.house) return viewBuild(char, home);
    const house = home.house;
    const roomId = house.rooms.some(r => r.id === home.currentRoom) ? home.currentRoom : house.rooms[0].id;
    const room = house.rooms.find(r => r.id === roomId);
    const furniture = house.furniture.filter(f => f.room === roomId);
    const night = isNight();
    const presence0 = home.presence || {};
    const awayNow = isAway(home) && !state.busy;
    const spotItem = house.furniture.find(f => f.id === presence0.spot);
    const showFigure = !awayNow && presence0.atHome !== false && (!spotItem || spotItem.room === roomId);
    const look = getLook(home, char);
    const pose = poseFor({ spotType: spotItem?.type || '', activity: presence0.activity, night });
    const figure = showFigure && !home.art?.path
        ? (anchors) => spriteInRoom(look, pose, spotItem ? anchors[spotItem.id] : null, SCENE_H, { theme: homeTheme(home), mood: home.presence?.mood, label: `${characterView(char).name}（点一下看他的样子）` })
        : null;
    const { svg } = renderRoom(room, furniture, house.palette, { night, selectedId: state.selectedFurniture, figure });
    const away = isAway(home) && !state.busy;
    const presence = home.presence || {};
    const name = characterView(char).name;
    const unread = unreadFromChar(home);
    const diaryBadge = unreadDiary(home);

    const tabs = house.rooms.length > 1
        ? `<div class="mxj-chips" role="tablist">${house.rooms.map(r => `<button type="button" role="tab" aria-selected="${r.id === roomId}" class="mxj-chip${r.id === roomId ? ' is-on' : ''}" data-act="room" data-id="${esc(r.id)}">${esc(r.name)}</button>`).join('')}</div>`
        : '';

    const statusLine = away
        ? `<span class="mxj-dot is-away"></span><span class="mxj-grow">他还没回来</span>`
        : `<span class="mxj-dot"></span><span class="mxj-grow">他在家${presence.activity ? ` · ${esc(presence.activity)}` : ''}</span>`;

    const portrait = showFigure && home.art?.path ? `<button type="button" class="mxj-art-person is-${homeTheme(home)}" data-act="avatar" aria-label="查看角色形象"><img src="${esc(home.art.path)}" alt="${esc(name)}"><span>${esc(moodFace(presence.mood,homeTheme(home)))}</span></button>` : '';
    return `
      <div class="mxj-strip">${statusLine}<span class="mxj-muted">${night ? '夜里' : '白天'} · ${esc(formatTime(Date.now()).replace('今天 ', ''))}</span></div>
      ${tabs}
      <div class="mxj-scene">
        ${svg}${portrait}
        ${unread ? `<button type="button" class="mxj-badge-btn" data-act="go" data-view="notes">${ICON.mail}<span>${unread} 张新纸条</span></button>` : ''}
        <div class="mxj-scene-hint">点家具可以互动</div>
      </div>
      <div class="mxj-row"><button type="button" class="mxj-btn mxj-grow" data-act="go" data-view="art">绘制人物、房间与家具</button></div>
      ${getSettings().visitMode === 'manual' && !away ? '<p class="mxj-muted">当前为手动回家模式；他已在家。下次离家后可点击「等他回家」。</p>' : ''}
      <details class="mxj-expand"${state.expandOpen ? ' open' : ''}><summary>扩建与搬家 · 房间模块</summary>
        <p class="mxj-muted">只增加房间数据，不会生成新房屋图片。原有家具、记录和装修保留。</p>
        <div class="mxj-chips is-wrap">${HOUSE_SIZES.filter(z=>z.maxRooms>HOUSE_SIZES.find(h=>h.id===house.size).maxRooms).map(z=>`<button type="button" class="mxj-chip" data-act="upgrade" data-id="${z.id}">搬到${esc(z.name)}</button>`).join('')}</div>
        <p class="mxj-muted">当前 ${house.rooms.length} / ${HOUSE_SIZES.find(h=>h.id===house.size)?.maxRooms||8} 个模块 · 删除房间前会确认，家具移入仓库</p>
        <div class="mxj-chips is-wrap">${house.rooms.length>1?house.rooms.map(r=>`<button type="button" class="mxj-chip" data-act="remove-room" data-id="${esc(r.id)}">移除${esc(r.name)}</button>`).join(''):''}</div>
        <div class="mxj-chips is-wrap">${Object.entries(ROOM_MODULES).map(([id,label])=>`<button type="button" class="mxj-chip" data-act="add-room" data-id="${id}">＋${esc(label)}</button>`).join('')}</div>
        <label class="mxj-field"><span>补充房间（例如：三个卧室、一个阳光房）</span><input class="mxj-input" data-field="roomExtra" placeholder="描述想增加的房间" value="${esc(state.roomExtra||'')}"></label>
        <button type="button" class="mxj-btn" data-act="add-room-text">按描述添加房间</button>
      </details>
      ${home.v >= 2 && !room.art?.path ? '<p class="mxj-muted">当前为布局草图。到绘制页生成并保存房间背景和家具，房间里就会换成所选画风的图片。</p>' : ''}
      ${state.selectedFurniture ? furnitureCard(home, away) : eventCard(char, home, away)}
      <nav class="mxj-entries" aria-label="小屋功能">
        <button type="button" class="mxj-entry" data-act="decorate">${ICON.sofa}<span>布置</span></button>
        <button type="button" class="mxj-entry" data-act="go" data-view="notes">${ICON.note}<span>小纸条</span>${unread ? `<i class="mxj-badge">${unread}</i>` : ''}</button>
        <button type="button" class="mxj-entry" data-act="go" data-view="diary">${ICON.diary}<span>交换日记</span>${diaryBadge ? `<i class="mxj-badge">${diaryBadge}</i>` : ''}</button>
        <button type="button" class="mxj-entry" data-act="go" data-view="log">${ICON.log}<span>回家记录</span></button>
        <button type="button" class="mxj-entry" data-act="go" data-view="build">${ICON.house}<span>房子档案</span></button>
      </nav>`;
}

function eventCard(char, home, away) {
    const name = characterView(char).name;
    if (away) {
        return `<section class="mxj-card">
          <p class="mxj-event">家里静悄悄的，${esc(name)}还没回来。</p>
          <div class="mxj-row"><button type="button" class="mxj-btn is-primary mxj-grow" data-act="visit">等他回家</button></div>
        </section>`;
    }
    const visit = home.visits?.[home.visits.length - 1];
    if (!visit) {
        return `<section class="mxj-card">
          <p class="mxj-event">新家刚布置好，${esc(name)}还没回来过。</p>
          <div class="mxj-row"><button type="button" class="mxj-btn is-primary mxj-grow" data-act="visit">等他回家</button></div>
        </section>`;
    }
    const url = avatarUrl(char);
    const turns = (visit.turns || []).slice(-4).map(t => `
        <div class="mxj-turn is-user">${esc(t.user)}</div>
        <div class="mxj-turn">${esc(t.reply)}</div>`).join('');
    let options = (visit.options || []).map(o => `<button type="button" class="mxj-btn" data-act="option" data-text="${esc(o)}">${esc(o)}</button>`).join('');
    if (state.newLayout) options = `<button type="button" class="mxj-btn is-primary" data-act="show-layout">叫他来看看新布置</button>${options}`;
    return `<section class="mxj-card">
      <div class="mxj-event-head">
        <span class="mxj-avatar">${url ? `<img src="${esc(url)}" alt="">` : esc(name.slice(0, 1))}</span>
        <p class="mxj-event">${esc(visit.event)}</p>
      </div>
      ${turns ? `<div class="mxj-turns">${turns}</div>` : ''}
      ${options ? `<div class="mxj-options">${options}</div>` : ''}
      <form class="mxj-say" data-form="say">
        <label class="mxj-sr" for="mxj-say-input">自己写一句</label>
        <input id="mxj-say-input" type="text" class="mxj-input" placeholder="做点什么，或者对他说…" autocomplete="off" enterkeyhint="send">
        <button type="submit" class="mxj-icon-btn is-solid" aria-label="发送">${ICON.pen}</button>
      </form>
    </section>`;
}

function furnitureCard(home, away) {
    const f = home.house.furniture.find(x => x.id === state.selectedFurniture);
    if (!f) {
        state.selectedFurniture = '';
        return '';
    }
    const who = f.by === 'user' ? '你放的' : (f.by === 'char' ? '他放的' : '搬进来时就有');
    return `<section class="mxj-card">
      <div class="mxj-row mxj-between">
        <div><b>${esc(f.name)}</b><div class="mxj-muted">${f.name === CATALOG[f.type]?.label ? '' : `${esc(CATALOG[f.type]?.label || '')} · `}${who}</div></div>
        <button type="button" class="mxj-link-btn" data-act="unselect">收起</button>
      </div>
      ${away ? '<p class="mxj-muted">他不在家。等他回来再一起用吧。</p>' : `
      <div class="mxj-options">
        <button type="button" class="mxj-btn" data-act="furniture-act" data-text="叫他到${esc(f.name)}这边来">叫他过来</button>
        <button type="button" class="mxj-btn" data-act="furniture-act" data-text="坐到${esc(f.name)}旁边，陪着他">在这儿陪他</button>
      </div>
      <form class="mxj-say" data-form="furniture-say">
        <label class="mxj-sr" for="mxj-furniture-input">在${esc(f.name)}旁边做点什么</label>
        <input id="mxj-furniture-input" type="text" class="mxj-input" placeholder="在${esc(f.name)}旁边做点什么…" autocomplete="off" enterkeyhint="send">
        <button type="submit" class="mxj-icon-btn is-solid" aria-label="发送">${ICON.pen}</button>
      </form>`}
    </section>`;
}

function viewBuild(char, home) {
    if (!char) return viewNoChar();
    const d = state.draft;
    const s = getSettings();
    const name = characterView(char).name;
    const themes = home?.house ? `<p class="mxj-muted">固定风格：${esc(themeName(homeTheme(home)))}。重新设计房屋也会保留此风格。</p>` : `<h3>小屋风格</h3><p class="mxj-muted">入住后固定风格，人物与家具沿用同一套表现。三个主题目前为独立界面主题；图片需要配置生图连接后生成。</p><div class="mxj-chips is-wrap">${THEMES.map(t => `<button type="button" class="mxj-chip${d.theme === t.id ? ' is-on' : ''}" data-act="theme" data-id="${t.id}" aria-pressed="${d.theme === t.id}">${esc(t.name)}</button>`).join('')}</div><p class="mxj-muted">${esc(THEMES.find(t => t.id === d.theme)?.note || '')}</p>`;
    const sizes = HOUSE_SIZES.map(z => `
      <button type="button" class="mxj-size${d.size === z.id ? ' is-on' : ''}" data-act="size" data-id="${z.id}" aria-pressed="${d.size === z.id}">
        <b>${esc(z.name)}</b><span>${esc(z.sub)}</span>
      </button>`).join('');
    if (home?.house) {
        return `
      <section class="mxj-card">${themes}</section>
      ${proposalCard(home.house, true)}
      <section class="mxj-card">
        <h3>想换个样子？</h3>
        <p class="mxj-muted">已经住进来的家不会被整个重新设计掉。想加房间、搬到更大的房子，在小屋首页点「扩建与搬家」；想换家具和墙地颜色，用「布置」。</p>
        <div class="mxj-row">
          <button type="button" class="mxj-btn mxj-grow" data-act="open-expand">扩建与搬家</button>
          <button type="button" class="mxj-btn mxj-grow" data-act="decorate">去布置</button>
        </div>
      </section>`;
    }
    const showing = d.proposal || null;
    const isCurrent = false;
    return `
      <section class="mxj-card">${themes}</section>
      ${showing ? proposalCard(showing, isCurrent) : ''}
      <section class="mxj-card">
        <h3>${showing ? '再设计一版' : '① 从人设里读'}</h3>
        <p class="mxj-muted">会读取 ${esc(name)} 的角色卡和你的用户人设${s.readCharacterWorldBook ? '，以及角色世界书' : ''}。</p>
        <label class="mxj-field">
          <span>补充给 AI 的要求（可空）</span>
          <input type="text" class="mxj-input" data-field="extra" value="${esc(d.extra)}" placeholder="比如：想要一个能看到海的阳台">
        </label>
      </section>
      <section class="mxj-card">
        <h3>${showing ? '房子大小' : '② 房子大小'}</h3>
        <div class="mxj-sizes">${sizes}</div>
        <label class="mxj-check">
          <span>留些空位，等我们一起布置</span>
          <input type="checkbox" data-field="emptyWall" ${d.emptyWall ? 'checked' : ''}>
        </label>
      </section>
      <div class="mxj-row">
        <button type="button" class="mxj-btn is-primary mxj-grow" data-act="design" ${state.busy ? 'disabled' : ''}>${showing ? '按人设重新设计' : '开始设计'}</button>
      </div>`;
}

function proposalCard(house, isCurrent) {
    const swatches = ['wall', 'floor', 'accent', 'trim'].map(k => `<span class="mxj-swatch"><i style="background:${esc(house.palette[k])}"></i>${{ wall: '墙', floor: '地板', accent: '主色', trim: '木作' }[k]}</span>`).join('');
    const rooms = house.rooms.map(r => {
        const items = house.furniture.filter(f => f.room === r.id).map(f => esc(f.name)).join('、');
        return `<li><b>${esc(r.name)}</b>：${items || '空着'}</li>`;
    }).join('');
    return `<section class="mxj-card mxj-proposal">
      <div class="mxj-row mxj-between">
        <h3>${isCurrent ? '现在的家' : 'AI 的设计提案'}</h3>
      </div>
      <div class="mxj-house-name">${esc(house.name)}</div>
      ${house.story ? `<p>${esc(house.story)}</p>` : ''}
      ${renderFloorPlan(house.rooms, house.palette)}
      <div class="mxj-swatches">${swatches}</div>
      <ul class="mxj-room-list">${rooms}</ul>
      ${isCurrent ? '<button type="button" class="mxj-btn" data-act="go" data-view="look">他的样子与外貌</button>' : ''}
      ${isCurrent ? '' : `<h3>入住前确认外貌 · ${esc(themeName(house.theme))}</h3><p class="mxj-muted">核对 AI 提取的描述并手动修改。入住后按这份描述生成所选画风的人物图片。</p><label class="mxj-field"><span>角色外貌描述</span><textarea class="mxj-input" data-field="draftAppearance" rows="4">${esc(house.appearance || '')}</textarea></label>${['hair','eyes','skin','outfit'].map(k => `<label class="mxj-field"><span>${({hair:'发色',eyes:'瞳色',skin:'肤色',outfit:'衣服颜色'})[k]}</span><input type="color" data-field="draftColor" data-key="${k}" value="${getLook({look:house.look}, currentCharacter())[k]}"></label>`).join('')}<label class="mxj-field"><span>发型</span><select class="mxj-input" data-field="draftHair">${HAIR_STYLES.map(x=>`<option value="${x.id}" ${getLook({look:house.look},currentCharacter()).hairStyle === x.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label><label class="mxj-field"><span>配饰</span><select class="mxj-input" data-field="draftAccessory">${ACCESSORIES.map(x=>`<option value="${x.id}" ${getLook({look:house.look},currentCharacter()).accessory === x.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label><div class="mxj-row">
        <button type="button" class="mxj-btn mxj-grow" data-act="design">${ICON.refresh}换一版</button>
        <button type="button" class="mxj-btn is-primary mxj-grow" data-act="accept">确认外貌，就住这里</button>
      </div>`}
    </section>`;
}

function noteCard(n, home, name) {
    const from = n.from === 'user' ? '我写的' : name;
    const isNew = n.from === 'char' && !n.readAt;
    let status = '';
    if (n.from === 'user') {
        if (n.replyId) status = '<span class="mxj-note-status is-ok">他回了</span>';
        else if (n.readAt) status = '<span class="mxj-note-status">他看过了</span>';
        else status = '<span class="mxj-note-status">他还没看到</span>';
    }
    let replyTo = '';
    if (n.replyTo) {
        const orig = home.notes.find(x => x.id === n.replyTo);
        if (orig) replyTo = `<div class="mxj-note-quote">回你的「${esc(orig.text.slice(0, 18))}${orig.text.length > 18 ? '…' : ''}」</div>`;
    }
    const tilt = ((n.id.charCodeAt(n.id.length - 1) % 5) - 2) * 0.6;
    return `<article class="mxj-note kind-${NOTE_KINDS.indexOf(n.kind)}${n.from === 'user' ? ' is-mine' : ''}" style="transform:rotate(${tilt}deg)">
      <div class="mxj-note-meta"><span class="mxj-note-kind">${esc(n.kind)}</span><span>${esc(from)} · ${esc(n.place)} · ${esc(formatTime(n.at))}${isNew ? ' · 新' : ''}</span></div>
      ${replyTo}
      <div class="mxj-note-text">${esc(n.text)}</div>
      <div class="mxj-row mxj-between">${status || '<span></span>'}${n.from === 'char' ? `<button type="button" class="mxj-link-btn" data-act="reply-note" data-kind="${esc(n.kind)}">回他一张</button>` : (!n.replyId ? `<button type="button" class="mxj-link-btn" data-act="note-reply" data-id="${esc(n.id)}" ${state.busy ? 'disabled' : ''}>请他现在回</button>` : '')}</div>
    </article>`;
}

function viewNotes(char, home) {
    if (!home) return viewNoChar();
    const name = characterView(char).name;
    const notes = (home.notes || []).slice().reverse();
    const c = state.composer;
    const kinds = NOTE_KINDS.map(k => `<button type="button" class="mxj-chip${c.kind === k ? ' is-on is-red' : ''}" data-act="kind" data-id="${esc(k)}" aria-pressed="${c.kind === k}">${esc(k)}</button>`).join('');
    const places = NOTE_PLACES.map(p => `<button type="button" class="mxj-place${c.place === p ? ' is-on' : ''}" data-act="place" data-id="${esc(p)}" aria-pressed="${c.place === p}">${esc(p)}</button>`).join('');
    return `
      <section class="mxj-board">
        ${notes.length ? notes.map(n => noteCard(n, home, name)).join('') : '<p class="mxj-board-empty">门边的软木板还空着。</p>'}
      </section>
      <section class="mxj-card" id="mxj-composer">
        <h3>写一张</h3>
        <div class="mxj-chips is-wrap">${kinds}</div>
        <label class="mxj-field">
          <span>写给${esc(name)}</span>
          <textarea class="mxj-input mxj-paper" rows="3" data-field="noteText" placeholder="想说的话…">${esc(c.text)}</textarea>
        </label>
        <div class="mxj-field"><span>贴在哪里</span><div class="mxj-places">${places}</div></div>
        <label class="mxj-check">
          <span>他回家时再读（不马上回复）</span>
          <input type="checkbox" data-field="deferred" ${c.deferred ? 'checked' : ''}>
        </label>
        <button type="button" class="mxj-btn" data-act="note-ask" ${state.busy ? 'disabled' : ''}>请他现在留一张纸条</button>
        <button type="button" class="mxj-btn is-red" data-act="post-note" ${state.busy ? 'disabled' : ''}>贴上去</button>
      </section>`;
}

function viewLog(char, home) {
    if (!home) return viewNoChar();
    const visits = (home.visits || []).slice().reverse();
    if (!visits.length) return '<section class="mxj-card mxj-empty"><p>他还没回过家。</p></section>';
    return visits.map(v => `<section class="mxj-card">
        <div class="mxj-muted">${esc(formatTime(v.at))}${v.activity ? ` · ${esc(v.activity)}` : ''}${v.mood ? ` · ${esc(v.mood)}` : ''}</div>
        <p class="mxj-event">${esc(v.event)}</p>
        ${(v.turns || []).map(t => `<div class="mxj-turn is-user">${esc(t.user)}</div><div class="mxj-turn">${esc(t.reply)}</div>`).join('')}
      </section>`).join('');
}

function viewLook(char, home) {
    if (!home) return viewNoChar();
    const look = getLook(home, char);
    const poses = [
        { label: '站着', pose: {} },
        { label: '坐着看书', pose: { sit: true, prop: 'book' } },
        { label: '拿着杯子', pose: { prop: 'mug' } },
        { label: '睡着了', pose: { sit: true, closed: true } },
    ];
    const preview = poses.map(p => `<figure class="mxj-look-pose">${spriteSvg(look, p.pose, { theme: homeTheme(home), attrs: 'class="mxj-pixel" aria-hidden="true"' })}<figcaption>${p.label}</figcaption></figure>`).join('');
    const chips = (list, cur, act) => list.map(x => `<button type="button" class="mxj-chip${x.id === cur ? ' is-on' : ''}" data-act="${act}" data-id="${x.id}" aria-pressed="${x.id === cur}">${esc(x.label)}</button>`).join('');
    const colors = (key, label) => `<div class="mxj-field"><span>${label}</span><div class="mxj-colors">${LOOK_COLORS[key].map(c => `<button type="button" class="mxj-color${c.toLowerCase() === String(look[key]).toLowerCase() ? ' is-on' : ''}" style="background:${c}" data-act="look-color" data-key="${key}" data-color="${c}" aria-label="${label}换成这个颜色" aria-pressed="${c.toLowerCase() === String(look[key]).toLowerCase()}"></button>`).join('')}</div></div>`;
    return `
      <section class="mxj-card">
        <h3>${esc(themeName(homeTheme(home)))} · 风格已固定</h3><label class="mxj-field"><span>确认的外貌（可手动修改，修改后可重新绘制人物）</span><textarea class="mxj-input" data-field="appearance" rows="4">${esc(home.appearance || "")}</textarea></label><p class="mxj-muted">当前表情：${esc(moodFace(home.presence?.mood, homeTheme(home)))}，根据回家时的心情显示。</p><div class="mxj-look-preview${home.art?.path ? ' is-art' : ''}">${home.art?.path ? `<img class="mxj-art-preview" src="${esc(home.art.path)}" alt="已保存的角色形象">` : preview}</div><button type="button" class="mxj-btn is-primary" data-act="go" data-view="art">${home.art?.path?'重新生成形象（额外消耗生图请求）':'按确认外貌绘制人物（首次一次）'}</button>
        <p class="mxj-muted">确认的描述用于绘制人物。已保存的立绘暂不生成动作动画，心情通过表情显示。</p>
        <button type="button" class="mxj-btn" data-act="look-gen" ${state.busy ? 'disabled' : ''}>重新提取基础外貌数据</button>
      </section>
      ${home.art?.path ? '<p class="mxj-muted mxj-pad">房间里显示的是画好的人物图片。想换样子，改上面的外貌描述后重新绘制。</p>' : `
      <section class="mxj-card">
        <p class="mxj-muted">还没有画人物图片时，房间里用这个小人代替，下面改了马上能看到。</p>
        <h3>发型</h3>
        <div class="mxj-chips is-wrap">${chips(HAIR_STYLES, look.hairStyle, 'look-style')}</div>
        <h3>配饰</h3>
        <div class="mxj-chips is-wrap">${chips(ACCESSORIES, look.accessory, 'look-acc')}</div>
      </section>
      <section class="mxj-card">
        ${colors('hair', '发色')}
        ${colors('eyes', '瞳色')}
        ${colors('skin', '肤色')}
        ${colors('outfit', '衣服')}
      </section>`}`;
}

function recentChatForQuote() {
    const chat = Array.isArray(ctx().chat) ? ctx().chat : [];
    const out = [];
    for (let i = chat.length - 1; i >= 0 && out.length < 8; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        const text = String(m.mes || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (text) out.push({ name: m.name || (m.is_user ? '我' : '他'), text: clip(text, 200) });
    }
    return out;
}

function diaryEntryHtml(e, name) {
    const mine = e.author === 'user';
    const [y, m, d] = String(e.date || '').split('-');
    const dateText = m ? `${Number(m)} 月 ${Number(d)} 日` : '';
    return `<article class="mxj-diary-entry${mine ? ' is-mine' : ''}">
      <div class="mxj-diary-meta"><span>${esc(dateText)}${e.weather ? ` · ${esc(e.weather)}` : ''}</span><span>${mine ? '你写的' : `${esc(name)}写的`}</span></div>
      ${e.quote ? `<blockquote class="mxj-diary-quote">${esc(e.quote.name)}：${esc(e.quote.text)}</blockquote>` : ''}
      <div class="mxj-diary-text">${esc(e.text)}</div>
      ${e.stamp ? `<div class="mxj-stamp" aria-label="印章">${esc(e.stamp)}</div>` : ''}
    </article>`;
}

function viewDiary(char, home) {
    if (!home) return viewNoChar();
    const name = characterView(char).name;
    const diary = getDiary(home);
    const entries = diary.entries;
    const shown = state.diaryAll ? entries : entries.slice(-8);
    const hisTurn = charTurn(home);
    const dr = state.diaryDraft;
    const modeText = { visit: `${name}下次回家时会接着写。`, daily: `${name}每天会写一篇，今天写过就等明天。`, manual: `等你叫${name}写。` }[diary.mode];
    let writer = '';
    if (hisTurn) {
        writer = `<section class="mxj-card">
          <p><b>轮到${esc(name)}写了。</b>${esc(modeText)}</p>
          <button type="button" class="mxj-btn" data-act="diary-ask" ${state.busy ? 'disabled' : ''}>叫他现在写</button>
        </section>`;
    } else {
        const weathers = WEATHERS.map(w => `<button type="button" class="mxj-chip${dr.weather === w ? ' is-on' : ''}" data-act="diary-weather" data-id="${esc(w)}" aria-pressed="${dr.weather === w}">${esc(w)}</button>`).join('');
        const quotes = dr.picking ? recentChatForQuote() : [];
        writer = `<section class="mxj-diary-page is-writing">
          <div class="mxj-diary-meta"><span>${new Date().getMonth() + 1} 月 ${new Date().getDate()} 日 · 轮到你写</span></div>
          <div class="mxj-chips">${weathers}</div>
          ${dr.quote ? `<blockquote class="mxj-diary-quote">${esc(dr.quote.name)}：${esc(dr.quote.text)} <button type="button" class="mxj-link-btn" data-act="diary-unquote">去掉</button></blockquote>` : ''}
          <label class="mxj-sr" for="mxj-diary-text">今天的日记</label>
          <textarea id="mxj-diary-text" class="mxj-input mxj-diary-input" rows="6" data-field="diaryText" placeholder="写点今天发生的事…">${esc(dr.text)}</textarea>
          <button type="button" class="mxj-btn" data-act="diary-pick">${dr.picking ? '收起聊天' : '引用一段聊天'}</button>
          ${dr.picking ? `<div class="mxj-quote-list">${quotes.length ? quotes.map((q, i) => `<button type="button" class="mxj-quote-item" data-act="diary-quote" data-idx="${i}"><b>${esc(q.name)}</b>${esc(q.text)}</button>`).join('') : '<p class="mxj-muted">当前聊天里还没有可以引用的话。</p>'}</div>` : ''}
        </section>`;
    }
    const modes = DIARY_MODES.map(m => `<button type="button" class="mxj-place${diary.mode === m.id ? ' is-on' : ''}" data-act="diary-mode" data-id="${m.id}" aria-pressed="${diary.mode === m.id}">${esc(m.label)}</button>`).join('');
    return `
      <div class="mxj-strip"><span class="mxj-dot${hisTurn ? ' is-away' : ' is-red'}"></span><span class="mxj-grow">${hisTurn ? `轮到${esc(name)}写` : '轮到你写'}</span><span class="mxj-muted">共 ${entries.length} 篇</span></div>
      <section class="mxj-notebook">
        ${entries.length > shown.length ? `<button type="button" class="mxj-link-btn" data-act="diary-more">看更早的 ${entries.length - shown.length} 篇</button>` : ''}
        ${shown.length ? shown.map(e => diaryEntryHtml(e, name)).join('') : `<p class="mxj-diary-empty">新本子。你先写第一篇，${esc(name)}会接着写。</p>`}
      </section>
      ${writer}
      <section class="mxj-card">
        <h3>${esc(name)}自动写日记的时机</h3><p class="mxj-muted">无论选哪种，都可以使用上方「叫他现在写」手动生成。</p>
        <div class="mxj-places">${modes}</div>
      </section>
      ${hisTurn ? '' : '<button type="button" class="mxj-btn is-primary" data-act="diary-save">合上本子，放回书桌</button>'}`;
}

function viewSettings(char, home) {
    const s = getSettings();
    const profiles = listConnectionProfiles();
    const independent = s.generationSource === 'independent';
    const profileOptions = [`<option value="">不用连接配置（手动填写接口）</option>`]
        .concat(profiles.map(p => `<option value="${esc(p.id)}" ${p.id === s.independentConnectionProfileId ? 'selected' : ''}>${esc(p.name)}</option>`))
        .join('');
    const usingProfile = !!s.independentConnectionProfileId;
    const modelBox = modelListBox(s);
    return `
      <section class="mxj-card">
        <h3>小浮窗入口</h3>
        <label class="mxj-check"><span>显示可拖动的小屋浮窗</span><input type="checkbox" data-field="floatingLauncher" ${s.floatingLauncher ? "checked" : ""}></label>
        <p class="mxj-muted">打开后，小屋图标会显示在酒馆页面；拖动调整位置，轻点打开梦想家。关闭梦想家后浮窗重新出现。魔法棒入口始终保留。</p>
      </section>
      <section class="mxj-card">
        <h3>文字生成用哪个 API</h3>
        <div class="mxj-places is-two" role="radiogroup" aria-label="生成用哪个 API">
          <button type="button" role="radio" class="mxj-place${!independent ? ' is-on' : ''}" data-act="source" data-id="follow" aria-checked="${!independent}">跟随当前 API</button>
          <button type="button" role="radio" class="mxj-place${independent ? ' is-on' : ''}" data-act="source" data-id="independent" aria-checked="${independent}">使用副 API</button>
        </div>
        <p class="mxj-muted">${independent ? '现在用的是下面配置的副 API。' : '现在跟着酒馆当前的 API 生成。想单独用一个 API，选「使用副 API」，再填下面的设置。'}</p>
        <button type="button" class="mxj-btn" data-act="test" ${state.busy ? 'disabled' : ''}>测试连接</button>
      </section>
      <section class="mxj-card${independent ? '' : ' is-dim'}">
        <h3>副 API 设置</h3>
        <label class="mxj-field"><span>酒馆连接配置（可选）</span>
          <div class="mxj-row"><select class="mxj-input mxj-grow" data-field="independentConnectionProfileId">${profileOptions}</select>
          <button type="button" class="mxj-icon-btn" data-act="refresh-profiles" aria-label="刷新连接配置">${ICON.refresh}</button></div>
        </label>
        ${usingProfile ? '' : `
        <label class="mxj-field"><span>API 地址</span>
          <input type="text" class="mxj-input" data-field="independentApiBaseUrl" value="${esc(s.independentApiBaseUrl)}" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="API 地址">
        </label>
        <label class="mxj-field"><span>API Key</span>
          <input type="password" class="mxj-input" data-field="independentApiKey" value="${esc(s.independentApiKey)}" autocomplete="off" placeholder="API Key">
        </label>`}
        ${modelBox}
        <label class="mxj-field"><span>模型 ID（可以从上面的列表点选，也可以直接填）${usingProfile ? '，空着就用连接配置里的模型' : ''}</span>
          <input type="text" class="mxj-input" data-field="independentApiModel" value="${esc(s.independentApiModel)}" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="模型 ID">
        </label>
        <div class="mxj-two">
          <label class="mxj-field"><span>温度</span><input type="number" class="mxj-input" data-field="independentApiTemperature" value="${esc(s.independentApiTemperature)}" min="0" max="2" step="0.05" inputmode="decimal"></label>
          <label class="mxj-field"><span>最大输出</span><input type="number" class="mxj-input" data-field="independentApiMaxTokens" value="${esc(s.independentApiMaxTokens)}" min="256" max="64000" step="256" inputmode="numeric"></label>
        </div>
      </section>
      <section class="mxj-card">
        <h3>生成时读取</h3>
        <label class="mxj-check"><span>角色世界书</span><input type="checkbox" data-field="readCharacterWorldBook" ${s.readCharacterWorldBook ? 'checked' : ''}></label>
        <label class="mxj-check"><span>最近的聊天</span><input type="checkbox" data-field="readRecentChat" ${s.readRecentChat ? 'checked' : ''}></label>
        ${s.readRecentChat ? `<label class="mxj-field"><span>读最近几条</span><input type="number" class="mxj-input" data-field="recentChatCount" value="${esc(s.recentChatCount)}" min="1" max="40" step="1" inputmode="numeric"></label>` : ''}
      </section>
      <section class="mxj-card">
        <h3>他什么时候回家</h3>
        <label class="mxj-radio"><input type="radio" name="mxj-visit" data-field="visitMode" value="open" ${s.visitMode === 'open' ? 'checked' : ''}><span>打开小屋时，离上次回家够久就回来</span></label>
        <label class="mxj-radio"><input type="radio" name="mxj-visit" data-field="visitMode" value="manual" ${s.visitMode === 'manual' ? 'checked' : ''}><span>只在我点「等他回家」时</span></label>
        ${s.visitMode === 'open' ? `<label class="mxj-field"><span>至少隔多少分钟</span><input type="number" class="mxj-input" data-field="visitGapMinutes" value="${esc(s.visitGapMinutes)}" min="0" step="10" inputmode="numeric"></label>` : ''}
      </section>
      ${imageSettingsCard()}
      ${changelogCard()}
      ${home?.house ? `<section class="mxj-card">
        <h3>拆掉这个家</h3>
        <p class="mxj-muted">删除${esc(characterView(char).name)}的家，连同纸条和回家记录。删除后不能恢复。</p>
        <button type="button" class="mxj-btn is-danger" data-act="demolish">拆掉这个家</button>
      </section>` : ''}`;
}

// ---------- 副 API 的模型列表框 ----------
function modelSourceKey(s) {
    return s.independentConnectionProfileId ? `profile:${s.independentConnectionProfileId}` : `manual:${String(s.independentApiBaseUrl || '').trim()}`;
}

function modelListBox(s) {
    const cache = s.independentModelCache;
    const models = cache && cache.key === modelSourceKey(s) && Array.isArray(cache.models) ? cache.models : [];
    const current = String(s.independentApiModel || '');
    const q = String(state.modelFilter || '').trim().toLowerCase();
    const items = models.map(m => {
        const on = m === current;
        const hidden = q && !m.toLowerCase().includes(q) ? ' hidden' : '';
        return `<button type="button" role="option" aria-selected="${on}" class="mxj-model-item${on ? ' is-on' : ''}" data-act="pick-model" data-id="${esc(m)}"${hidden}><span>${esc(m)}</span>${on ? '<i aria-hidden="true">✓</i>' : ''}</button>`;
    }).join('');
    return `<div class="mxj-field mxj-model-box">
      <span>模型列表</span>
      <div class="mxj-row mxj-wrap">
        <button type="button" class="mxj-btn mxj-grow" data-act="fetch-models" ${state.busy ? 'disabled' : ''}>${models.length ? '重新拉取模型列表' : '拉取模型列表'}</button>
      </div>
      ${models.length ? `
      <label class="mxj-sr" for="mxj-model-filter">搜索模型</label>
      <input id="mxj-model-filter" type="text" class="mxj-input" data-field="modelFilter" value="${esc(state.modelFilter || '')}" placeholder="搜索模型（共 ${models.length} 个）" autocapitalize="off" autocomplete="off" spellcheck="false" enterkeyhint="search">
      <div class="mxj-model-list" role="listbox" aria-label="模型列表">${items}</div>
      <p class="mxj-muted mxj-model-empty"${q && !models.some(m => m.toLowerCase().includes(q)) ? '' : ' hidden'}>没有找到包含这几个字的模型。</p>`
        : `<p class="mxj-muted">${s.independentConnectionProfileId ? '会用选中的酒馆连接配置去拉取。' : '先填好 API 地址和 Key，'}点「拉取模型列表」，可选的模型会列在这里，点一下就选上。</p>`}
    </div>`;
}

function filterModelList() {
    const box = root?.querySelector('.mxj-model-box');
    if (!box) return;
    const q = String(state.modelFilter || '').trim().toLowerCase();
    let shown = 0;
    for (const item of box.querySelectorAll('.mxj-model-item')) {
        const match = !q || String(item.dataset.id || '').toLowerCase().includes(q);
        item.hidden = !match;
        if (match) shown++;
    }
    const empty = box.querySelector('.mxj-model-empty');
    if (empty) empty.hidden = shown > 0;
}

function imageSettingsCard() {
    const cfg = getSettings();
    const text = (key,label,type='text') => `<label class="mxj-field"><span>${label}</span><input class="mxj-input" type="${type}" data-field="${key}" value="${esc(cfg[key])}" autocomplete="off" placeholder="${label}"></label>`;
    const number = (key,label,step=1) => `<label class="mxj-field"><span>${label}</span><input class="mxj-input" type="number" step="${step}" data-field="${key}" value="${esc(cfg[key])}" inputmode="decimal"></label>`;
    return `<section class="mxj-card"><h3>生图连接 · 独立设置</h3><p class="mxj-muted">图片接口与文字接口分别配置。每位使用者填写自己的兼容服务；此模块不连接任何其他扩展。</p>
      ${text('imageBaseUrl','API 地址')}${text('imageKey','API Key','password')}${text('imageModel','模型 ID')}
      <label class="mxj-field"><span>描述格式（按服务要求选择）</span><select class="mxj-input" data-field="imagePromptFormat"><option value="structured" ${cfg.imagePromptFormat==='structured'?'selected':''}>结构化描述</option><option value="legacy" ${cfg.imagePromptFormat==='legacy'?'selected':''}>基础描述</option></select></label>
      <button type="button" class="mxj-btn" data-act="image-check" ${state.busy?'disabled':''}>检查填写（不生图）</button>
      <p class="mxj-muted">需要服务允许浏览器跨域访问。地址可填写站点根地址或完整生图端点。更换地址会分别记住密钥。</p>
      <details><summary>画幅与高级参数</summary><div class="mxj-two">${number('imageWidth','房间／家具宽',64)}${number('imageHeight','房间／家具高',64)}${number('imagePortraitWidth','人物宽',64)}${number('imagePortraitHeight','人物高',64)}${number('imageSteps','步数')}${number('imageScale','提示词相关性',0.1)}${number('imageSeed','种子（0 随机）')}</div>
      ${text('imageSampler','采样器 ID')}${text('imageNoise','噪声计划 ID')}
      <label class="mxj-check"><span>人物／家具使用纯色底辅助抠图</span><input type="checkbox" data-field="imageCutout" ${cfg.imageCutout?'checked':''}></label>
      <label class="mxj-field"><span>额外参数 JSON（可选）</span><textarea class="mxj-input" rows="4" data-field="imageExtra">${esc(cfg.imageExtra)}</textarea></label><p class="mxj-muted">附加参数放入绘图 parameters 中；画幅、提示词和单张数量由本页设置控制。</p></details></section>`;
}

function viewArt(char,home) {
    if (!home?.house) return viewBuild(char,home);
    const d = state.artDraft;
    const portrait = `<section class="mxj-card"><h3>人物 · ${esc(themeName(homeTheme(home)))}</h3><p>${esc(home.appearance || '尚未确认外貌；请先在人物形象页核对描述。')}</p>${home.art?.path?`<img class="mxj-art-preview" src="${esc(home.art.path)}" alt="已保存的人物">`:''}<div class="mxj-row"><button type="button" class="mxj-btn" data-act="go" data-view="look">确认外貌</button><button type="button" class="mxj-btn" data-act="art-prepare" data-kind="portrait" ${state.busy?'disabled':''}>${home.art?.path?'重新生成提示词':'准备人物提示词'}</button></div></section>`;
    const rooms = home.house.rooms.map(r => `<section class="mxj-card"><h3>${esc(r.name)} · 背景与家具</h3>${r.art?.path?`<img class="mxj-art-preview is-room" src="${esc(r.art.path)}" alt="${esc(r.name)}背景">`:''}<button type="button" class="mxj-btn" data-act="art-prepare" data-kind="room" data-id="${esc(r.id)}" ${state.busy?'disabled':''}>准备空房间背景提示词</button><div class="mxj-art-list">${home.house.furniture.filter(f=>f.room===r.id).map(f=>`<div class="mxj-art-item">${f.art?.path?`<img src="${esc(f.art.path)}" alt="${esc(f.name)}">`:''}<span>${esc(f.name)}</span><button type="button" class="mxj-btn" data-act="art-prepare" data-kind="furniture" data-id="${esc(f.id)}" ${state.busy?'disabled':''}>${f.art?.path?'重画':'绘制'}</button></div>`).join('')}</div></section>`).join('');
    return `<section class="mxj-card"><h3>把这个家画出来</h3><p>固定画风：${esc(themeName(homeTheme(home)))}。背景、人物与家具独立生成，不会在打开小屋时自动生图。</p><p class="mxj-muted">每次准备提示词调用一次文字接口；每次绘制请求一张图片，可能消耗服务额度。确认保存后才替换原图。人物图片暂时保持静态。</p><button type="button" class="mxj-btn" data-act="settings">配置生图连接</button></section>
    ${d?`<section class="mxj-card mxj-art-draft"><h3>画面预览 · ${esc(({portrait:'人物',room:'背景',furniture:'家具'})[d.kind])}</h3><label class="mxj-field"><span>生图提示词（可修改）</span><textarea class="mxj-input" data-field="artPrompt" rows="6">${esc(d.prompt)}</textarea></label><label class="mxj-field"><span>排除内容</span><textarea class="mxj-input" data-field="artNegative" rows="2">${esc(d.negative)}</textarea></label>${d.dataUrl?`<img class="mxj-art-preview" src="${esc(d.dataUrl)}" alt="待确认的生成图片"><p class="mxj-muted">${esc(d.cutoutNote || '')}尺寸 ${d.width} × ${d.height} · 种子 ${d.seed}</p>`:''}<div class="mxj-row"><button type="button" class="mxj-btn is-primary" data-act="art-draw" ${state.busy?'disabled':''}>${d.dataUrl?'重画一张':'绘制一张'}</button>${d.dataUrl?`<button type="button" class="mxj-btn" data-act="art-save" ${state.busy?'disabled':''}>满意，保存</button>`:''}<button type="button" class="mxj-btn" data-act="art-discard" ${state.busy?'disabled':''}>放弃预览</button></div></section>`:''}
    ${portrait}${rooms}`;
}

function changelogCard() {
    if (state.changelog === null) {
        void loadChangelog();
        return '<section class="mxj-card"><h3>更新日志</h3><p class="mxj-muted">读取中…</p></section>';
    }
    if (!state.changelog) return '';
    return `<section class="mxj-card"><h3>更新日志 · ${esc(state.changelog.title)}</h3><ul class="mxj-changelog">${state.changelog.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></section>`;
}

async function loadChangelog() {
    state.changelog = false;
    try {
        const url = new URL('../README.md', import.meta.url);
        const text = await (await fetch(url, { cache: 'no-cache' })).text();
        const lines = text.split(/\r?\n/);
        const start = lines.findIndex(l => /^##\s+\S/.test(l));
        if (start < 0) return;
        const items = [];
        for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
            const m = lines[i].match(/^\s*[-*]\s+(.*)$/);
            if (m) items.push(m[1].replace(/`/g, ''));
        }
        state.changelog = { title: lines[start].replace(/^##\s+/, ''), items };
    } catch {
        state.changelog = false;
    }
    if (state.view === 'settings') {
        state.keepScroll = true;
        render();
    }
}

// ---------------- 交互 ----------------

function go(view) {
    if (state.view === 'decorate' && view !== 'decorate') decorator.commit();
    state.view = view;
    state.error = '';
    state.selectedFurniture = '';
    if (view === 'diary') {
        state.diaryAll = false;
        state.diaryDraft.picking = false;
    }
    render();
    root.querySelector('.mxj-main').scrollTop = 0;
    if (view === 'diary') {
        const char = currentCharacter();
        const home = char ? getHome(char) : null;
        // 自动日记只在 char 回家时触发；手动写作入口保留。
    }
}

async function askDiary(char) {
    const name = characterView(char).name;
    await run(`${name}在写日记…`, signal => writeCharDiary(char, { signal }));
    if (state.view === 'diary') {
        const main = root?.querySelector('.mxj-main');
        if (main) main.scrollTop = main.scrollHeight;
    }
}

async function run(label, task) {
    if (state.busy) return;
    state.busy = label;
    state.error = '';
    state.toast = '';
    state.abort = new AbortController();
    state.keepScroll = true;
    render();
    try {
        await task(state.abort.signal);
    } catch (error) {
        if (state.abort?.signal.aborted) state.error = '已取消。';
        else {
            state.error = error?.message || String(error);
            console.warn(LOG_PREFIX, error);
        }
    } finally {
        state.busy = '';
        state.abort = null;
        state.keepScroll = true;
        if (root?.open) render();
    }
}

function flash(text) {
    state.toast = text;
    renderStatus();
    setTimeout(() => {
        if (state.toast === text) {
            state.toast = '';
            if (root) renderStatus();
        }
    }, 2600);
}

async function doVisit() {
    const char = currentCharacter();
    if (!char) return;
    const name = characterView(char).name;
    await run(`${name}正在回家的路上…`, signal => comeHome(char, { signal }));
    const h = getHome(char);
    if (h && h.changesSeenAt >= Date.now() - 60000) state.newLayout = '';
}

async function doRespond(text, furnitureId = '') {
    const char = currentCharacter();
    const action = String(text || '').trim();
    if (!char || !action) return;
    state.selectedFurniture = '';
    await run('他在想怎么回应…', signal => respond(char, action, { signal, furnitureId }));
}

function onKeydown(event) {
    const g = event.target?.closest?.('g[data-act="furniture"]');
    if (g && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
}

function onClick(event) {
    if (event.target === root) {
        close();
        return;
    }
    const el = event.target?.closest?.('[data-act]');
    if (!el || !root.contains(el)) return;
    if (el.tagName === 'BUTTON' && el.type === 'submit') return;
    const act = el.dataset.act;
    const char = currentCharacter();
    switch (act) {
        case 'close': close(); break;
        case 'back':
            if (state.view === 'decorate') decorator.leave();
            else go(char && getHome(char)?.house ? 'home' : 'build');
            break;
        case 'open-expand':
            state.expandOpen = true;
            go('home');
            requestAnimationFrame(() => root?.querySelector('.mxj-expand')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
            break;
        case 'decorate':
            if (!char || !getHome(char)?.house) break;
            decorator.enter(char);
            go('decorate');
            break;
        case 'upgrade': {
            if(!char || !getHome(char)?.house || state.busy) break;
            const name=HOUSE_SIZES.find(x=>x.id===el.dataset.id)?.name;
            if(!name) break;
            void askConfirm(`搬到${name}？原房间和家具全部保留，只补上新房子该有的房间。`, { yes: '搬过去' }).then(ok => {
                if (ok) roomAction(char, () => upgradeHouse(char, el.dataset.id), `搬到${name}了`);
            });
            break;
        }
        case 'add-room': {
            if(char && getHome(char)?.house && ROOM_MODULES[el.dataset.id]) roomAction(char, () => addRoomModules(char,[el.dataset.id]), `加了一间${ROOM_MODULES[el.dataset.id]}`);
            break;
        }
        case 'add-room-text': {
            if(!char)break;
            const value=root.querySelector('[data-field="roomExtra"]')?.value||state.roomExtra||'';
            const types=roomModulesFromText(value);
            if(!types.length){state.error='没有认出要加的房间，可以写「两个卧室、一个书房」这样，或者直接点上面的按钮。';state.keepScroll=true;render();break;}
            void askConfirm(`增加 ${types.map(t=>ROOM_MODULES[t]).join('、')}？`, { yes: '增加' }).then(ok => {
                if (ok) roomAction(char, () => { addRoomModules(char,types); state.roomExtra=''; }, '房间加好了');
            });
            break;
        }
        case 'show-layout': {
            const summary = state.newLayout;
            state.newLayout = '';
            void doRespond(`你把家里重新布置了一下（${summary}），叫他过来看看`).then(() => {
                const h = getHome(char);
                if (h) {
                    // 装修反馈仍留待下次回家时写入小纸条。
                }
            });
            break;
        }
        case 'settings': go('settings'); break;
        case 'go': go(el.dataset.view); break;
        case 'cancel': state.abort?.abort(); break;
        case 'dismiss': state.error = ''; renderStatus(); break;
        case 'room': {
            const home = getHome(char);
            home.currentRoom = el.dataset.id;
            state.selectedFurniture = '';
            setHome(char, home);
            state.keepScroll = true;
            render();
            break;
        }
        case 'furniture':
            if (state.view === 'decorate') {
                state.deco.selected = el.dataset.id;
                state.keepScroll = true;
                render();
                break;
            }
            state.selectedFurniture = state.selectedFurniture === el.dataset.id ? '' : el.dataset.id;
            state.keepScroll = true;
            render();
            break;
        case 'unselect': state.selectedFurniture = ''; state.keepScroll = true; render(); break;
        case 'image-check':
            void run('检查生图配置…', async () => {
                const cfg = getSettings();
                imageEndpoint(cfg.imageBaseUrl);
                if (!cfg.imageKey || !cfg.imageModel) throw new Error('请填写密钥和模型 ID');
                imageRequest(cfg, 'configuration check', '', false);
                flash('填写格式有效；尚未验证鉴权或实际出图');
            }); break;
        case 'art-prepare':
            if (!char || state.busy) break;
            void run('整理画面描述…', async signal => {
                const draft = await prepareArt(char, el.dataset.kind, el.dataset.id || '', {signal});
                if (!signal.aborted && characterKey(currentCharacter()) === characterKey(char)) state.artDraft = draft;
            }).then(() => { if (root?.open && state.view === 'art' && state.artDraft) root.querySelector('.mxj-main').scrollTop = 0; }); break;
        case 'art-draw':
            if (!state.artDraft || state.busy) break;
            void run('正在绘制一张图片…', async signal => {
                const draft = state.artDraft;
                const result = await generateArt(draft, {signal});
                if (!signal.aborted && characterKey(currentCharacter()) === draft.owner) state.artDraft = result;
            }); break;
        case 'art-save':
            if (!state.artDraft?.dataUrl || state.busy) break;
            void run('保存图片…', async signal => {
                const draft = state.artDraft;
                await acceptArt(char, draft, {signal});
                if (state.artDraft === draft) state.artDraft = null;
                flash('图片已保存到这个家');
            }); break;
        case 'art-discard': if (!state.busy) { state.artDraft = null; render(); } break;
        case 'avatar': go('look'); break;
        case 'look-style': setLook(char, { hairStyle: el.dataset.id }); state.keepScroll = true; render(); break;
        case 'look-acc': setLook(char, { accessory: el.dataset.id }); state.keepScroll = true; render(); break;
        case 'look-color': setLook(char, { [el.dataset.key]: el.dataset.color }); state.keepScroll = true; render(); break;
        case 'look-gen': void run('正在按人设画他…', signal => generateLook(char, { signal })); break;
        case 'diary-weather': state.diaryDraft.weather = el.dataset.id; state.keepScroll = true; render(); break;
        case 'diary-pick': state.diaryDraft.picking = !state.diaryDraft.picking; state.keepScroll = true; render(); break;
        case 'diary-quote': {
            const q = recentChatForQuote()[Number(el.dataset.idx)];
            if (q) state.diaryDraft.quote = q;
            state.diaryDraft.picking = false;
            state.keepScroll = true;
            render();
            break;
        }
        case 'diary-unquote': state.diaryDraft.quote = null; state.keepScroll = true; render(); break;
        case 'diary-more': state.diaryAll = true; state.keepScroll = true; render(); break;
        case 'diary-mode': setDiaryMode(char, el.dataset.id); state.keepScroll = true; render(); break;
        case 'diary-ask': void askDiary(char); break;
        case 'diary-save': {
            const dr = state.diaryDraft;
            const text = String(dr.text || '').trim();
            if (text) {
                addUserEntry(char, dr);
                state.diaryDraft = { weather: dr.weather, text: '', quote: null, picking: false };
                go('home');
                flash('本子放回书桌了');
            } else {
                go('home');
            }
            break;
        }
        case 'visit': void doVisit(); break;
        case 'note-ask': if(char) void run('正在写纸条…',signal=>writeCharNote(char,{signal})); break;
        case 'note-reply': if(char && el.dataset.id) void run('他在看你的纸条…', signal => replyToNote(char, el.dataset.id, { signal })); break;
        case 'remove-room': {
            if(!char||state.busy)break;const h=getHome(char);const r=h?.house?.rooms?.find(x=>x.id===el.dataset.id);
            if(!r) break;
            void askConfirm(`移除「${r.name}」？房间里的家具会收进仓库（布置页的「仓库」里能拿出来），纸条和日记不受影响。`, { yes: '移除', danger: true }).then(ok => {
                if (ok) roomAction(char, () => removeRoomModule(char,r.id), '房间已移除，家具收进仓库了');
            });
            break;
        }
        case 'option': void doRespond(el.dataset.text); break;
        case 'furniture-act': void doRespond(el.dataset.text, state.selectedFurniture); break;
        case 'theme':
            if (!getHome(char)?.house && !state.busy) {
                state.draft.theme = THEMES.some(t => t.id === el.dataset.id) ? el.dataset.id : 'pixel';
                state.draft.proposal = null; render();
            }
            break;
        case 'size': state.draft.size = el.dataset.id; state.keepScroll = true; render(); break;
        case 'design':
            if (getHome(char)?.house) break;
            void run('正在按人设设计房子…', async signal => {
                const proposal = await designHouse(char, { ...state.draft, signal });
                if (!signal.aborted && characterKey(currentCharacter()) === characterKey(char)) state.draft.proposal = proposal;
            }).then(() => {
                if (state.draft.proposal && root?.open) root.querySelector('.mxj-main').scrollTop = 0;
            });
            break;
        case 'accept': {
            if (!state.draft.proposal || state.busy) break;
            const fresh = !getHome(char)?.house;
            const existing = getHome(char);
            if(existing?.house){flash('已入住的住宅请使用扩建与搬家，不能覆盖旧存档');break;}
            createHome(char, state.draft.proposal);
            state.draft.proposal = null;
            go('art');
            if (fresh && getSettings().visitMode === 'open') void doVisit();
            break;
        }
        case 'kind': state.composer.kind = el.dataset.id; state.keepScroll = true; render(); break;
        case 'place': state.composer.place = el.dataset.id; state.keepScroll = true; render(); break;
        case 'reply-note':
            state.composer.kind = el.dataset.kind || '日常';
            state.keepScroll = true;
            render();
            root.querySelector('#mxj-composer')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
            root.querySelector('[data-field="noteText"]')?.focus({ preventScroll: true });
            break;
        case 'post-note': void submitNote(char); break;
        case 'source':
            updateSettings({ generationSource: el.dataset.id === 'independent' ? 'independent' : 'follow' });
            state.keepScroll = true;
            render();
            break;
        case 'refresh-profiles': state.keepScroll = true; render(); flash('已刷新连接配置'); break;
        case 'fetch-models': {
            const s = getSettings();
            const key = modelSourceKey(s);
            const profileId = s.independentConnectionProfileId;
            void run('正在拉取模型…', async () => {
                const list = profileId
                    ? await fetchProfileModels(profileId)
                    : await fetchManualModels(s.independentApiBaseUrl, s.independentApiKey);
                updateSettings({ independentModelCache: { key, models: list, at: Date.now() } });
                state.modelFilter = '';
                flash(`拿到 ${list.length} 个模型，点一下就能选`);
            });
            break;
        }
        case 'pick-model':
            if (el.dataset.id) {
                updateSettings({ independentApiModel: el.dataset.id });
                state.keepScroll = true;
                render();
                flash(`已选择 ${el.dataset.id}`);
            }
            break;
        case 'test':
            void run('正在测试连接…', async () => {
                const reply = await testConnection();
                flash(`连接正常：${reply}`);
            });
            break;
        case 'demolish':
            if (state.busy) break;
            void askConfirm('确定要拆掉这个家吗？纸条、日记和回家记录也会一起删除，不能恢复。', { yes: '拆掉', danger: true }).then(ok => {
                if (!ok || state.busy) return;
                const c = currentCharacter();
                if (!c || characterKey(c) !== characterKey(char)) return;
                removeHome(char);
                state.draft = { theme: 'pixel', size: 'flat', extra: '', emptyWall: true, proposal: null };
                go('build');
            });
            break;
        default:
            if (act.startsWith('deco-') && char) decorator.onAct(act, el, char);
            break;
    }
}

async function submitNote(char) {
    const c = state.composer;
    const text = String(c.text || '').trim();
    if (!text) {
        state.error = '纸条还是空的。';
        renderStatus();
        return;
    }
    const note = postNote(char, c);
    c.text = '';
    if (state.busy && !c.deferred) {
        state.keepScroll = false;
        render();
        flash('贴好了。他这会儿在忙，可以等一下点「请他现在回」，或者等他回家时看');
        return;
    }
    if (c.deferred) {
        state.keepScroll = false;
        render();
        flash('贴好了，他回家时会看到');
        return;
    }
    await run('他在看你的纸条…', signal => replyToNote(char, note.id, { signal }));
}

function onChange(event) {
    const el = event.target;
    const field = el?.dataset?.field;
    if (!field) return;
    const value = el.type === 'checkbox' ? el.checked : el.value;
    switch (field) {
        case 'artPrompt': if (state.artDraft) state.artDraft.prompt = value; return;
        case 'artNegative': if (state.artDraft) state.artDraft.negative = value; return;
        case 'draftAppearance': if (state.draft.proposal) state.draft.proposal.appearance = value; return;
        case 'draftColor':
        case 'draftHair':
        case 'draftAccessory':
            if (state.draft.proposal) {
                const key = field === 'draftHair' ? 'hairStyle' : field === 'draftAccessory' ? 'accessory' : el.dataset.key;
                state.draft.proposal.look = { ...getLook({look:state.draft.proposal.look}, currentCharacter()), [key]: value };
                state.keepScroll = true; render();
            }
            return;
        case 'appearance': { const c = currentCharacter(); const h = getHome(c); if (h) { h.appearance = String(value).slice(0,1200); setHome(c,h); } return; }
        case 'emptyWall': state.draft.emptyWall = value; return;
        case 'deferred': state.composer.deferred = value; return;
        case 'extra': state.draft.extra = value; return;
        case 'noteText': state.composer.text = value; return;
        case 'diaryText': state.diaryDraft.text = value; return;
        case 'roomExtra': state.roomExtra = value; return;
        case 'modelFilter': state.modelFilter = value; return;
        case 'decoName': {
            const c = currentCharacter();
            if (c) decorator.rename(c, value);
            state.keepScroll = true;
            render();
            return;
        }
        case 'modelSelect':
            if (value) {
                updateSettings({ independentApiModel: value });
                state.keepScroll = true;
                render();
            }
            return;
        default: break;
    }
    const numeric = ['independentApiTemperature', 'independentApiMaxTokens', 'recentChatCount', 'visitGapMinutes', 'imageWidth', 'imageHeight', 'imagePortraitWidth', 'imagePortraitHeight', 'imageSteps', 'imageScale', 'imageSeed'];
    const patch = { [field]: numeric.includes(field) ? Number(value) : value };
    if (field === 'independentApiBaseUrl') state.models = [];
    updateSettings(patch);
    if (field === 'floatingLauncher') refreshFloating();
    const rerender = ['generationSource', 'independentConnectionProfileId', 'readRecentChat', 'visitMode', 'imageBaseUrl'];
    if (rerender.includes(field)) {
        state.keepScroll = true;
        render();
    }
}

function onInput(event) {
    const el = event.target;
    const field = el?.dataset?.field;
    if (field === 'artPrompt' && state.artDraft) state.artDraft.prompt = el.value;
    if (field === 'artNegative' && state.artDraft) state.artDraft.negative = el.value;
    if (field === 'draftAppearance' && state.draft.proposal) state.draft.proposal.appearance = el.value.slice(0,1200);
    if (field === 'noteText') state.composer.text = el.value;
    if (field === 'extra') state.draft.extra = el.value;
    if (field === 'diaryText') state.diaryDraft.text = el.value;
    if (field === 'roomExtra') state.roomExtra = el.value;
    if (field === 'modelFilter') {
        state.modelFilter = el.value;
        filterModelList();
    }
}

// 表单提交（回车或发送按钮）
function onSubmit(event) {
    const form = event.target;
    if (!root || !root.contains(form)) return;
    event.preventDefault();
    const input = form.querySelector('input');
    const text = input?.value || '';
    if (form.dataset.form === 'say') void doRespond(text);
    if (form.dataset.form === 'deco-describe') {
        const c = currentCharacter();
        if (c) void decorator.describe(c, text);
    }
    if (form.dataset.form === 'furniture-say') {
        const f = state.selectedFurniture;
        void doRespond(text, f);
    }
}
document.addEventListener('submit', onSubmit, true);

// 切换聊天时，开着的面板跟着换角色
export function onChatChanged() {
    if (!root?.open) return;
    if (state.view === 'decorate') decorator.commit();
    dismissConfirm();
    state.abort?.abort();
    state.artDraft = null;
    state.draft = { theme: 'pixel', size: 'flat', extra: '', emptyWall: true, proposal: null };
    state.newLayout = '';
    const char = currentCharacter();
    const home = char ? getHome(char) : null;
    state.view = !char ? 'nochar' : (home?.house ? 'home' : 'build');
    render();
}
