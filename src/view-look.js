// 梦想家 · 界面 · 他的样子（外貌描述、像素小人的发型配饰颜色）
import { homeTheme, themeName, moodFace } from './theme.js?mxj=0.8.0';
import { esc } from './util.js?mxj=0.8.0';
import { currentCharacter, getHome, setHome } from './settings.js?mxj=0.8.0';
import { spriteSvg, HAIR_STYLES, ACCESSORIES, LOOK_COLORS } from './sprite.js?mxj=0.8.0';
import { getLook, setLook, generateLook } from './home-house.js?mxj=0.8.0';
import { viewNoChar } from './ui-common.js?mxj=0.8.0';

let app = null;
let state = null;
const render = () => app.render();
const run = (label, task) => app.run(label, task);
const go = view => app.go(view);

export function setup(a) {
    app = a;
    state = a.state;
    return {
        views: { look: viewLook },
        titles: {
            look: (char, home, name) => [`${name}的样子`, home ? themeName(homeTheme(home)) : '人物外貌'],
        },
        actions: {
            avatar() { go('look'); },
            'look-style'(el, char) { setLook(char, { hairStyle: el.dataset.id }); state.keepScroll = true; render(); },
            'look-acc'(el, char) { setLook(char, { accessory: el.dataset.id }); state.keepScroll = true; render(); },
            'look-color'(el, char) { setLook(char, { [el.dataset.key]: el.dataset.color }); state.keepScroll = true; render(); },
            'look-gen'(el, char) { void run('正在按人设画他…', signal => generateLook(char, { signal })); },
        },
        fields: {
            appearance(value) { const c = currentCharacter(); const h = getHome(c); if (h) { h.appearance = String(value).slice(0,1200); setHome(c,h); } },
        },
    };
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
        <h3>${esc(themeName(homeTheme(home)))}</h3><label class="mxj-field"><span>确认的外貌（可手动修改，修改后可重新绘制人物）</span><textarea class="mxj-input" data-field="appearance" rows="4">${esc(home.appearance || "")}</textarea></label><p class="mxj-muted">当前表情：${esc(moodFace(home.presence?.mood, homeTheme(home)))}，根据回家时的心情显示。</p><div class="mxj-look-preview${home.art?.path ? ' is-art' : ''}">${home.art?.path ? `<img class="mxj-art-preview" src="${esc(home.art.path)}" alt="已保存的角色形象">` : preview}</div><button type="button" class="mxj-btn is-primary" data-act="go" data-view="art">${home.art?.path?'重新生成形象（额外消耗生图请求）':'按确认外貌绘制人物（首次一次）'}</button>
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
