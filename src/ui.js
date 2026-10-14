// 梦想家 · 界面核心：面板的打开关闭、确认框、渲染、忙碌条、事件分发
// 每一页的内容和按钮在 view-*.js 里；这里只负责把它们接起来。
import { refreshFloating } from './floating.js?mxj=0.8.1';
import { homeTheme } from './theme.js?mxj=0.8.1';
import { esc, LOG_PREFIX } from './util.js?mxj=0.8.1';
import { currentCharacter, characterKey, getHome } from './settings.js?mxj=0.8.1';
import { characterView } from './character.js?mxj=0.8.1';
import { shouldAutoVisit } from './home-visit.js?mxj=0.8.1';
import { createDecorator } from './decorate.js?mxj=0.8.1';
import { ICON, viewNoChar } from './ui-common.js?mxj=0.8.1';
import { setup as setupHome } from './view-home.js?mxj=0.8.1';
import { setup as setupBuild } from './view-build.js?mxj=0.8.1';
import { setup as setupNotes } from './view-notes.js?mxj=0.8.1';
import { setup as setupDiary } from './view-diary.js?mxj=0.8.1';
import { setup as setupLook } from './view-look.js?mxj=0.8.1';
import { setup as setupArt } from './view-art.js?mxj=0.8.1';
import { setup as setupSettings } from './view-settings.js?mxj=0.8.1';
import { setup as setupPets } from './view-pets.js?mxj=0.8.1';

const ROOT_ID = 'mxj-root';

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
    modelListOpen: false,
    imageModels: [],
    settingsOpen: {},
    settingsScrollTo: '',
    diaryDraft: { weather: '晴', text: '', quote: null, picking: false },
    diaryAll: false,
    artDraft: null,
    artBatch: null,
    selectedPet: '',
    pets: null,
    noteFilter: 'all',
};

let root = null;
let viewportCleanup = null;
let originFocus = null;
const decorator = createDecorator({ state, render, run, flash, getRoot: () => root });

// ---------------- 各页登记 ----------------
// 每页返回 views（画页面）、titles（标题）、actions（data-act 按钮）、fields（data-field 改完）、
// inputs（data-field 边打边存）、forms（回车提交）、enter（进页面前）、after（画完之后）。

const app = {
    state,
    render,
    renderStatus,
    run,
    flash,
    go,
    askConfirm,
    root: () => root,
    renderView: (name, char, home) => views[name](char, home),
    doVisit: () => homePage.doVisit(),
};

const homePage = setupHome(app);
const settingsPage = setupSettings(app);
const pages = [homePage, setupBuild(app), setupNotes(app), setupDiary(app), setupLook(app), setupArt(app), setupPets(app), settingsPage];

function merge(key, base = {}) {
    const out = { ...base };
    for (const page of pages) {
        for (const [name, value] of Object.entries(page[key] || {})) {
            if (name in out) console.warn(LOG_PREFIX, `重复登记：${key}.${name}`);
            out[name] = value;
        }
    }
    return out;
}

const views = merge('views', { nochar: viewNoChar, decorate: decorator.view });
const titleOf = merge('titles', {
    nochar: () => ['梦想家', ''],
    decorate: (char, home) => ['布置', home?.house?.name || ''],
});
const enterHooks = merge('enter');
// 子页面的返回键回到上一层（比如领养页回小家伙们）
const parentOf = merge('parents');
const afterHooks = merge('after');
const fieldHandlers = merge('fields', {
    decoName(value) {
        const c = currentCharacter();
        if (c) decorator.rename(c, value);
        state.keepScroll = true;
        render();
    },
});
const inputHandlers = merge('inputs');
const formHandlers = merge('forms', {
    'deco-describe'(text) {
        const c = currentCharacter();
        if (c) void decorator.describe(c, text);
    },
});
const actions = merge('actions', {
    close() { close(); },
    back(el, char) {
        if (state.view === 'decorate') decorator.leave();
        else if (parentOf[state.view] && char && getHome(char)?.house) go(parentOf[state.view]);
        else go(char && getHome(char)?.house ? 'home' : 'build');
    },
    decorate(el, char) {
        if (!char || !getHome(char)?.house) return;
        decorator.enter(char);
        go('decorate');
    },
    // 从右上角齿轮进来各组都收着；别处的入口可以用 data-group 直接展开某一组
    settings(el) {
        const g = el?.dataset?.group || '';
        state.settingsOpen = g ? { [g]: true } : {};
        state.settingsScrollTo = g;
        go('settings');
    },
    go(el) { go(el.dataset.view); },
    cancel() { state.abort?.abort(); },
    dismiss() { state.error = ''; renderStatus(); },
});

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
    // 画好还没保存的预览图留着（已经花了生图额度），换了角色才清掉
    if (state.artDraft && state.artDraft.owner !== characterKey(char)) state.artDraft = null;
    if (state.artBatch && state.artBatch.owner !== characterKey(char)) state.artBatch = null;
    state.selectedFurniture = '';
    state.selectedPet = '';
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
    if (char && home?.house && shouldAutoVisit(home) && !state.busy) void homePage.doVisit();
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
    main.innerHTML = (views[state.view] || views.home)(char, home);
    if (state.view === 'decorate' && char) decorator.attach(char);
    main.scrollTop = state.keepScroll ? scrollTop : 0;
    afterHooks[state.view]?.(char, home);
    state.keepScroll = false;
}

function titles(char, home) {
    const name = char ? characterView(char).name : '';
    return (titleOf[state.view] || titleOf.home)(char, home, name);
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

// ---------------- 交互 ----------------

function go(view) {
    if (state.view === 'decorate' && view !== 'decorate') decorator.commit();
    state.view = view;
    state.error = '';
    state.selectedFurniture = '';
    state.selectedPet = '';
    const c = currentCharacter();
    enterHooks[view]?.(c, c ? getHome(c) : null);
    render();
    root.querySelector('.mxj-main').scrollTop = 0;
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

function onKeydown(event) {
    const g = event.target?.closest?.('g[role="button"][data-act]');
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
    const handler = actions[act];
    if (handler) handler(el, char, event);
    else if (act.startsWith('deco-') && char) decorator.onAct(act, el, char);
}

function onChange(event) {
    const el = event.target;
    const field = el?.dataset?.field;
    if (!field) return;
    const value = el.type === 'checkbox' ? el.checked : el.value;
    const handler = fieldHandlers[field];
    if (handler) handler(value, el, field);
    else settingsPage.saveField(field, value);
}

function onInput(event) {
    const el = event.target;
    const field = el?.dataset?.field;
    inputHandlers[field]?.(el);
}

// 表单提交（回车或发送按钮）
function onSubmit(event) {
    const form = event.target;
    if (!root || !root.contains(form)) return;
    event.preventDefault();
    const input = form.querySelector('input');
    const text = input?.value || '';
    formHandlers[form.dataset.form]?.(text, form);
}
document.addEventListener('submit', onSubmit, true);

// 切换聊天时，开着的面板跟着换角色
export function onChatChanged() {
    if (!root?.open) return;
    if (state.view === 'decorate') decorator.commit();
    dismissConfirm();
    state.abort?.abort();
    state.artDraft = null;
    state.artBatch = null;
    state.selectedPet = '';
    state.pets = null;
    state.draft = { theme: 'pixel', size: 'flat', extra: '', emptyWall: true, proposal: null };
    state.newLayout = '';
    const char = currentCharacter();
    const home = char ? getHome(char) : null;
    state.view = !char ? 'nochar' : (home?.house ? 'home' : 'build');
    render();
}
