// 梦想家 · 界面 · 配色与美化（设置里的一组）和「美化接口说明」页
import { esc } from './util.js?mxj=0.9.1';
import { getSettings, updateSettings, getHome, setHome, currentCharacter } from './settings.js?mxj=0.9.1';
import { characterView } from './character.js?mxj=0.9.1';
import { homeTheme } from './theme.js?mxj=0.9.1';
import {
    SKIN_KEYS, SKIN_PRESETS, SKIN_VIEWS, SKIN_PARTS, SKIN_TEMPLATE,
    normalizeSkin, effectiveSkin, skinColors, skinProblems, applySkin, exportSkin, parseSkinFile,
} from './skin.js?mxj=0.9.1';

let app = null;
let state = null;
const render = () => app.render();
const flash = text => app.flash(text);

export function setup(a) {
    app = a;
    state = a.state;
    return {
        views: { 'skin-guide': viewGuide, skinbody: skinBody, skinsum: skinSummary },
        parents: { 'skin-guide': 'settings' },
        titles: { 'skin-guide': () => ['美化接口说明', '给做美化的人看'] },
        actions: {
            'skin-scope'(el, char) {
                const home = char ? getHome(char) : null;
                if (!home) return;
                if (el.dataset.id === 'home') home.skin = { ...normalizeSkin(home.skin?.own ? home.skin : getSettings().skin), own: true };
                else if (home.skin) home.skin.own = false;
                setHome(char, home);
                refresh(char);
            },
            'skin-preset'(el, char) {
                const id = el.dataset.id;
                if (!id) writeSkin(char, { palette: '' });
                else if (id === 'custom') writeSkin(char, { palette: 'custom', colors: skinColors(currentSkin(char)) || SKIN_PRESETS.oat.colors });
                else writeSkin(char, { palette: id, colors: { ...SKIN_PRESETS[id].colors } });
                refresh(char);
            },
            'skin-export'(el, char) {
                const skin = currentSkin(char);
                const text = exportSkin(skin);
                // 文件名用英文：有的浏览器碰到中文文件名会存成「download」
                const name = `mengxiangjia-skin-${new Date().toISOString().slice(0, 10)}.json`;
                try { download(name, text, 'application/json'); } catch { /* 有的环境不能下载 */ }
                // 手机上（尤其 TT）常常下载不了也复制不了：复制失败就把内容摆出来，长按全选复制
                copy(text).then(ok => {
                    state.skinExport = ok ? '' : text;
                    if (!ok) { state.keepScroll = true; render(); }
                    flash(ok ? '导出好了：存成了文件，也复制到了剪贴板。手机上没看到文件的话，直接把剪贴板里的内容发给别人，对方粘贴到「美化 CSS」框里就行' : '这里复制不了，导出的内容摆在下面了，长按全选复制');
                });
            },
            'skin-clear-css'(el, char) {
                if (!currentSkin(char).css) { flash('现在没有导入美化'); return; }
                void app.askConfirm('清空导入的美化？配色不受影响。', { yes: '清空', danger: true }).then(ok => {
                    if (!ok) return;
                    writeSkin(char, { css: '', name: '' });
                    refresh(char);
                    flash('美化清空了');
                });
            },
            'skin-copy-template'() {
                void copy(SKIN_TEMPLATE).then(ok => flash(ok ? '模板复制好了' : '复制不了，可以点「下载模板」'));
            },
            'skin-download-template'() {
                try { download('mengxiangjia-skin-template.css', SKIN_TEMPLATE, 'text/css'); flash('模板下载好了'); }
                catch { flash('这个环境下载不了，可以点「复制模板」'); }
            },
        },
        fields: {
            skinColor(value, el, field, char = currentCharacter()) {
                setColor(char, el.dataset.key, value);
                refresh(char);
            },
            skinCss(value) {
                const char = currentCharacter();
                if (applyPasted(char, value)) return;
                writeSkin(char, { css: value });
            },
            skinName(value) { writeSkin(currentCharacter(), { name: value }); },
            skinFile(value, el) {
                const file = el?.files?.[0];
                const char = currentCharacter();
                if (!file) return;
                if (file.size > 400000) { flash('文件太大了，美化文件一般不会超过 400KB'); return; }
                const reader = new FileReader();
                reader.onload = () => {
                    const parsed = parseSkinFile(String(reader.result || ''), file.name);
                    const patch = { css: parsed.css ?? currentSkin(char).css, name: parsed.name };
                    if (parsed.colors) Object.assign(patch, { palette: 'custom', colors: parsed.colors });
                    else if (parsed.palette) Object.assign(patch, { palette: parsed.palette, colors: { ...SKIN_PRESETS[parsed.palette].colors } });
                    writeSkin(char, patch);
                    refresh(char);
                    flash(`导入了「${parsed.name}」`);
                };
                reader.onerror = () => flash('这个文件读不出来');
                reader.readAsText(file);
                el.value = '';
            },
        },
        inputs: {
            // 拖取色器时边拖边看效果，不重画页面
            skinColor(el) { setColor(currentCharacter(), el.dataset.key, el.value); const code = el.parentElement?.querySelector('code'); if (code) code.textContent = el.value.toUpperCase(); },
            skinCss(el) {
                const char = currentCharacter();
                if (applyPasted(char, el.value)) return;
                writeSkin(char, { css: el.value });
            },
            skinName(el) { writeSkin(currentCharacter(), { name: el.value }); },
        },
    };
}

function currentSkin(char) {
    const home = char ? getHome(char) : null;
    return effectiveSkin(getSettings(), home);
}

// 改的是这个家单独的那套，还是所有家共用的那套
function writeSkin(char, patch) {
    const home = char ? getHome(char) : null;
    if (home?.skin?.own) {
        home.skin = { ...normalizeSkin(home.skin), ...patch, own: true };
        setHome(char, home);
    } else {
        updateSettings({ skin: { ...normalizeSkin(getSettings().skin), ...patch } });
    }
    applySkin(app.root(), currentSkin(char));
}

// 粘贴进来的是导出的那种 .json（配色 + 美化）：拆开套用，而不是当成 CSS
function applyPasted(char, text) {
    if (!/^\s*\{\s*"mengxiangjiaSkin"/.test(String(text || ''))) return false;
    let ok = true;
    try { JSON.parse(text); } catch { ok = false; }
    if (!ok) return false;
    const parsed = parseSkinFile(text, '');
    const patch = { css: parsed.css, name: parsed.name };
    if (parsed.colors) Object.assign(patch, { palette: 'custom', colors: parsed.colors });
    else if (parsed.palette) Object.assign(patch, { palette: parsed.palette, colors: { ...SKIN_PRESETS[parsed.palette].colors } });
    writeSkin(char, patch);
    refresh(char);
    flash(`套用了「${parsed.name}」`);
    return true;
}

function setColor(char, key, value) {
    if (!SKIN_KEYS.some(([k]) => k === key) || !/^#[0-9a-f]{6}$/i.test(value)) return;
    const colors = { ...(skinColors(currentSkin(char)) || SKIN_PRESETS.oat.colors), [key]: value.toUpperCase() };
    writeSkin(char, { palette: 'custom', colors });
}

function refresh(char) {
    applySkin(app.root(), currentSkin(char));
    state.keepScroll = true;
    render();
}

function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// 复制：先用剪贴板接口；http 地址或 TT 里不能用时，退回老办法
async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* 换老办法 */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        (app.root() || document.body).append(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch {
        return false;
    }
}

// 「跟随风格」那一格画风格自己的颜色（页面底、顶栏、卡片、主色、文字）
const THEME_DOTS = {
    pixel: ['#264D60', '#39748B', '#F8E0AF', '#46672F', '#392A20'],
    scrapbook: ['#D9C4A3', '#F4E8CD', '#FCF1D9', '#647149', '#493522'],
    storybook: ['#E7C8C5', '#FFF2E8', '#FFF4E8', '#94505E', '#603A3E'],
};

function dots(colors) {
    return `<span class="mxj-skin-dots" aria-hidden="true">${['bg', 'top', 'card', 'accent', 'ink'].map(k => `<i style="background:${colors[k]}"></i>`).join('')}</span>`;
}

// 设置里那一组收起时的一行字
function skinSummary(char) {
    const skin = currentSkin(char);
    const palette = !skin.palette ? '跟随风格' : skin.palette === 'custom' ? '自己调的配色' : SKIN_PRESETS[skin.palette].name;
    return `${skin.scope === 'home' ? `${characterView(char).name}的家单独一套` : '所有的家'} · ${palette}${skin.css ? ` · 美化「${skin.name || '导入的美化'}」` : ''}`;
}

function skinBody(char, home) {
    const skin = currentSkin(char);
    const name = char ? characterView(char).name : '';
    const scope = home?.house ? `<div class="mxj-seg" role="radiogroup" aria-label="改哪一套">
        <button type="button" role="radio" class="${skin.scope === 'global' ? 'is-on' : ''}" aria-checked="${skin.scope === 'global'}" data-act="skin-scope" data-id="global">所有的家</button>
        <button type="button" role="radio" class="${skin.scope === 'home' ? 'is-on' : ''}" aria-checked="${skin.scope === 'home'}" data-act="skin-scope" data-id="home">只有${esc(name)}的家</button>
      </div>
      <p class="mxj-muted">${skin.scope === 'home' ? `现在改的是${esc(name)}的家单独的配色和美化，别的家不受影响。` : '现在改的是所有家共用的配色和美化；某个家想不一样，打开那个角色的聊天，在这里选「只有某某的家」。'}</p>` : '';
    const presets = Object.entries(SKIN_PRESETS).map(([id, p]) => `<button type="button" class="mxj-skin-pick${skin.palette === id ? ' is-on' : ''}" data-act="skin-preset" data-id="${id}" aria-pressed="${skin.palette === id}">${dots(p.colors)}<span>${esc(p.name)}</span></button>`).join('');
    const colors = skinColors(skin) || SKIN_PRESETS.oat.colors;
    const problems = skin.palette === 'custom' ? skinProblems(colors) : [];
    const rows = SKIN_KEYS.map(([k, label]) => `<label class="mxj-skin-color"><span>${esc(label)}</span><code>${esc(colors[k])}</code><input type="color" data-field="skinColor" data-key="${k}" value="${esc(colors[k].toLowerCase())}" aria-label="${esc(label)}"></label>`).join('');
    return `${scope}
      <h4>配色</h4>
      <div class="mxj-skin-grid">
        <button type="button" class="mxj-skin-pick${!skin.palette ? ' is-on' : ''}" data-act="skin-preset" data-id="" aria-pressed="${!skin.palette}"><span class="mxj-skin-dots" aria-hidden="true">${(THEME_DOTS[homeTheme(home)] || THEME_DOTS.pixel).map(c => `<i style="background:${c}"></i>`).join('')}</span><span>跟随风格</span></button>
        ${presets}
        <button type="button" class="mxj-skin-pick${skin.palette === 'custom' ? ' is-on' : ''}" data-act="skin-preset" data-id="custom" aria-pressed="${skin.palette === 'custom'}">${dots(colors)}<span>自己调</span></button>
      </div>
      <p class="mxj-muted">配色只换颜色，像素风的方块边、手帐的胶带、绘本的圆角这些样子不变。</p>
      ${skin.palette === 'custom' ? `<div class="mxj-skin-colors">${rows}</div>
        ${problems.length ? `<div class="mxj-warn">${problems.map(esc).join('；')}。</div>` : '<p class="mxj-muted">颜色都看得清。</p>'}` : ''}
      <h4>导入美化</h4>
      <p class="mxj-muted">别人做好的美化（.css 或导出的 .json）可以从文件导入，也可以直接粘贴 CSS。只会改梦想家，不会弄乱酒馆。</p>
      <label class="mxj-field"><span>名字</span><input class="mxj-input" type="text" data-field="skinName" value="${esc(skin.name)}" placeholder="给这套美化起个名字" maxlength="40" autocomplete="off"></label>
      <label class="mxj-field"><span>美化 CSS</span><textarea class="mxj-input mxj-skin-css" rows="6" data-field="skinCss" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="粘贴 CSS，边改边生效">${esc(skin.css)}</textarea></label>
      <div class="mxj-row is-wrap">
        <label class="mxj-btn mxj-grow" for="mxj-skin-file">从文件导入</label>
        <input id="mxj-skin-file" class="mxj-skin-file" type="file" accept=".css,.json,.txt,text/css,application/json,text/plain" data-field="skinFile">
        <button type="button" class="mxj-btn mxj-grow" data-act="skin-export">导出这一套</button>
        <button type="button" class="mxj-btn mxj-grow" data-act="skin-clear-css">清空美化</button>
      </div>
      ${state.skinExport ? `<label class="mxj-field"><span>导出的内容（长按全选复制，发给别人）</span><textarea class="mxj-input mxj-skin-css" rows="6" readonly>${esc(state.skinExport)}</textarea></label>` : ''}
      <button type="button" class="mxj-link-btn" data-act="go" data-view="skin-guide">想自己做美化？看美化接口说明</button>`;
}

function viewGuide() {
    const vars = [
        ['--mxj-ground', '页面底色'], ['--mxj-top', '顶栏'], ['--mxj-top-ink', '顶栏文字'], ['--mxj-paper', '卡片'], ['--mxj-white', '输入框、普通按钮'],
        ['--mxj-ink', '文字'], ['--mxj-muted', '次要文字'], ['--mxj-line', '线条'], ['--mxj-line-soft', '浅线条'], ['--mxj-green', '主色：主按钮、选中'],
        ['--mxj-accent-ink', '主色上的字'], ['--mxj-green-soft', '浅主色：你说的话、小标签'], ['--mxj-surface', '卡片里的浅色底：他说的话'], ['--mxj-red', '提醒色'],
        ['--mxj-display', '标题字体'], ['--mxj-body', '正文字体'],
    ];
    const table = rows => `<table class="mxj-guide-table"><tbody>${rows.map(([a, b]) => `<tr><td><code>${esc(a)}</code></td><td>${esc(b)}</td></tr>`).join('')}</tbody></table>`;
    return `<section class="mxj-card">
        <h3>美化能改什么</h3>
        <p>美化就是一段 CSS。导入后每条规则会自动加上 <code>#mxj-root</code> 前缀，只影响梦想家；优先级高于插件自带的样式，所以直接写 <code>.mxj-card { … }</code> 就能盖过去。</p>
        <p class="mxj-muted">@import 会被去掉。图片可以写网址 url(...)，但别人那边要能打开这个网址（有的网址国内打不开）。不要把按钮藏起来或缩得太小，手机上要点得到。</p>
      </section>
      <section class="mxj-card"><h3>颜色和字体变量</h3><p class="mxj-muted">改这些就能换整体颜色，写在 <code>#mxj-root { }</code> 里。</p>${table(vars)}</section>
      <section class="mxj-card"><h3>页面标记</h3>
        <p class="mxj-muted">面板最外层有这几个标记，可以只给某一页、某个风格写样式：<code>[data-view="页名"]</code>、<code>[data-theme="pixel / scrapbook / storybook"]</code>、<code>[data-palette]</code>（用了配色时才有）。</p>
        ${table(SKIN_VIEWS)}
      </section>
      <section class="mxj-card"><h3>主要部件</h3>${table(SKIN_PARTS)}</section>
      <section class="mxj-card"><h3>模板</h3>
        <pre class="mxj-guide-code">${esc(SKIN_TEMPLATE)}</pre>
        <div class="mxj-row is-wrap"><button type="button" class="mxj-btn mxj-grow" data-act="skin-copy-template">复制模板</button><button type="button" class="mxj-btn mxj-grow" data-act="skin-download-template">下载模板</button></div>
        <p class="mxj-muted">做好以后在设置的「配色与美化」里粘贴或导入，再点「导出这一套」就能发给别人。</p>
      </section>`;
}
