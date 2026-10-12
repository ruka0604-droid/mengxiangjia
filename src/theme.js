// 主题只在建家时确定；旧存档保持像素风。
export const THEMES = [
    { id: 'scrapbook', name: '温暖复古手帐', note: '暖纸色、手绘感小人、柔和边框' },
    { id: 'pixel', name: '精致像素', note: '像素小人、清晰边框、游戏感菜单' },
    { id: 'storybook', name: '乙女游戏绘本', note: '柔粉色、绘本感小人、浪漫卡片' },
];
export function themeId(value) { return THEMES.some(t => t.id === value) ? value : 'pixel'; }
export function homeTheme(home) { return themeId(home?.theme); }
export function themeName(value) { return THEMES.find(t => t.id === themeId(value)).name; }
export function moodFace(mood, theme = 'pixel') {
    const text = String(mood || '');
    const faces = /困|睡|疲|累/.test(text) ? ['😴', '(-ω-) zZ']
        : /生气|恼|怒|烦/.test(text) ? ['😤', '(｀へ´)']
        : /难过|伤心|低落|委屈/.test(text) ? ['🥺', '(｡•́︿•̀｡)']
        : /开心|高兴|愉|幸福|雀跃/.test(text) ? ['😊', '(＾▽＾)']
        : /害羞|羞|心动/.test(text) ? ['☺️', '(〃ω〃)'] : ['🙂', '(´▽｀)'];
    return theme === 'scrapbook' ? faces[1] : faces[0];
}
