import { mountFloating, refreshFloating, destroyFloating } from './src/floating.js?mxj=0.6.6';
// 梦想家 · 入口：魔法棒菜单 + 可选浮窗
import { getSettings } from './src/settings.js?mxj=0.6.6';
import { ctx, LOG_PREFIX } from './src/util.js?mxj=0.6.6';

const WAND_ID = 'mxj_wand_entry';
const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>';

let uiModule = null;
let clickHandler = null;
let chatHandler = null;
let initialized = false;

async function loadUi() {
    if (!uiModule) uiModule = await import('./src/ui.js?mxj=0.6.6');
    uiModule.revive?.();
    return uiModule;
}

async function openPanel(label) {
    const original = label?.textContent;
    try {
        if (label) label.textContent = '正在打开梦想家…';
        const ui = await loadUi();
        ui.open();
    } catch (error) {
        console.error(LOG_PREFIX, '打开失败', error);
        if (label) label.textContent = '打开失败，点击重试';
        return;
    }
    if (label) label.textContent = original || '梦想家';
}

function installWandEntry() {
    if (document.getElementById(WAND_ID)) return;
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return;
    const entry = document.createElement('div');
    entry.id = WAND_ID;
    entry.setAttribute('role', 'button');
    entry.tabIndex = 0;
    entry.className = 'list-group-item flex-container flexGap5';
    entry.style.cssText = 'background:transparent;color:inherit;border:0;box-shadow:none;appearance:none;-webkit-appearance:none;';
    entry.setAttribute('aria-haspopup', 'dialog');
    entry.innerHTML = `<span class="extensionsMenuExtensionButton mxj-wand-icon">${ICON}</span><span>梦想家</span>`;
    entry.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (!event.repeat) entry.click();
    });
    entry.addEventListener('click', () => {
        // 收起魔法棒菜单，再打开面板
        const menuEl = document.getElementById('extensionsMenu');
        if (menuEl && getComputedStyle(menuEl).display !== 'none') {
            try {
                globalThis.jQuery?.(menuEl).fadeOut?.(100);
            } catch { /* 忽略 */ }
        }
        void openPanel(entry.querySelector('span:last-child'));
    });
    menu.append(entry);
}

function init() {
    if (initialized) return;
    initialized = true;
    getSettings();
    installWandEntry();
    // 清理旧版可能留下的扩展设置面板，不影响其他扩展。
    document.getElementById('mxj_settings_drawer')?.remove();
    mountFloating(() => openPanel());
    // 魔法棒菜单可能稍后才出现：点魔法棒时补装
    clickHandler = event => {
        if (event.target?.closest?.('#extensionsMenuButton')) installWandEntry();
    };
    document.addEventListener('click', clickHandler, true);
    const c = ctx();
    const types = c.eventTypes || c.event_types;
    if (c.eventSource && types?.CHAT_CHANGED) {
        chatHandler = () => {
            installWandEntry();
            uiModule?.onChatChanged?.();
            refreshFloating();
        };
        c.eventSource.on(types.CHAT_CHANGED, chatHandler);
    }
}

// 在扩展管理里重新启用时（不刷新页面）再装回入口
export function onEnable() {
    try {
        init();
    } catch (error) {
        console.error(LOG_PREFIX, '启用失败', error);
    }
}

export function onDisable() {
    initialized = false;
    document.getElementById(WAND_ID)?.remove();
    document.getElementById('mxj_settings_drawer')?.remove();
    destroyFloating();
    if (clickHandler) document.removeEventListener('click', clickHandler, true);
    clickHandler = null;
    const c = ctx();
    const types = c.eventTypes || c.event_types;
    if (chatHandler && c.eventSource && types?.CHAT_CHANGED) {
        (c.eventSource.removeListener || c.eventSource.off)?.call(c.eventSource, types.CHAT_CHANGED, chatHandler);
    }
    chatHandler = null;
    uiModule?.destroy?.();
}

jQuery(() => {
    try {
        init();
    } catch (error) {
        console.error(LOG_PREFIX, '初始化失败', error);
    }
});
