// 梦想家 · 界面共用：图标、没有角色时的提示

export const ICON = {
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

export function viewNoChar() {
    return `<section class="mxj-card mxj-empty">
      <p>先打开一个角色的单人聊天，再从魔法棒进入梦想家。</p>
      <p class="mxj-muted">每个角色都有自己的家，群聊暂时不支持。</p>
    </section>`;
}
