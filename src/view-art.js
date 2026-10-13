// 梦想家 · 界面 · 画出我们的家（准备提示词 → 画一张 → 满意再保存）
import { prepareArt, generateArt, acceptArt } from './art.js?mxj=0.6.2';
import { homeTheme, themeName } from './theme.js?mxj=0.6.2';
import { esc } from './util.js?mxj=0.6.2';
import { currentCharacter, characterKey } from './settings.js?mxj=0.6.2';

let app = null;
let state = null;
const render = () => app.render();
const run = (label, task) => app.run(label, task);
const flash = text => app.flash(text);

export function setup(a) {
    app = a;
    state = a.state;
    return {
        views: { art: viewArt },
        titles: {
            art: () => ['画出我们的家', '预览满意后保存'],
        },
        actions: {
            'art-prepare'(el, char) {
                if (!char || state.busy) return;
                void run('整理画面描述…', async signal => {
                    const draft = await prepareArt(char, el.dataset.kind, el.dataset.id || '', {signal});
                    if (!signal.aborted && characterKey(currentCharacter()) === characterKey(char)) state.artDraft = draft;
                }).then(() => { if (app.root()?.open && state.view === 'art' && state.artDraft) app.root().querySelector('.mxj-main').scrollTop = 0; });
            },
            'art-draw'() {
                if (!state.artDraft || state.busy) return;
                void run('正在绘制一张图片…', async signal => {
                    const draft = state.artDraft;
                    const result = await generateArt(draft, {signal});
                    if (!signal.aborted && characterKey(currentCharacter()) === draft.owner) state.artDraft = result;
                });
            },
            'art-save'(el, char) {
                if (!state.artDraft?.dataUrl || state.busy) return;
                void run('保存图片…', async signal => {
                    const draft = state.artDraft;
                    await acceptArt(char, draft, {signal});
                    if (state.artDraft === draft) state.artDraft = null;
                    flash('图片已保存到这个家');
                });
            },
            'art-discard'() { if (!state.busy) { state.artDraft = null; render(); } },
        },
        fields: {
            artPrompt(value) { if (state.artDraft) state.artDraft.prompt = value; },
            artNegative(value) { if (state.artDraft) state.artDraft.negative = value; },
        },
        inputs: {
            artPrompt(el) { if (state.artDraft) state.artDraft.prompt = el.value; },
            artNegative(el) { if (state.artDraft) state.artDraft.negative = el.value; },
        },
    };
}

function viewArt(char,home) {
    if (!home?.house) return app.renderView('build', char, home);
    const d = state.artDraft;
    const portrait = `<section class="mxj-card"><h3>人物 · ${esc(themeName(homeTheme(home)))}</h3><p>${esc(home.appearance || '尚未确认外貌；请先在人物形象页核对描述。')}</p>${home.art?.path?`<img class="mxj-art-preview" src="${esc(home.art.path)}" alt="已保存的人物">`:''}<div class="mxj-row"><button type="button" class="mxj-btn" data-act="go" data-view="look">确认外貌</button><button type="button" class="mxj-btn" data-act="art-prepare" data-kind="portrait" ${state.busy?'disabled':''}>${home.art?.path?'重新生成提示词':'准备人物提示词'}</button></div></section>`;
    const rooms = home.house.rooms.map(r => `<section class="mxj-card"><h3>${esc(r.name)} · 背景与家具</h3>${r.art?.path?`<img class="mxj-art-preview is-room" src="${esc(r.art.path)}" alt="${esc(r.name)}背景">`:''}<button type="button" class="mxj-btn" data-act="art-prepare" data-kind="room" data-id="${esc(r.id)}" ${state.busy?'disabled':''}>准备空房间背景提示词</button><div class="mxj-art-list">${home.house.furniture.filter(f=>f.room===r.id).map(f=>`<div class="mxj-art-item">${f.art?.path?`<img src="${esc(f.art.path)}" alt="${esc(f.name)}">`:''}<span>${esc(f.name)}</span><button type="button" class="mxj-btn" data-act="art-prepare" data-kind="furniture" data-id="${esc(f.id)}" ${state.busy?'disabled':''}>${f.art?.path?'重画':'绘制'}</button></div>`).join('')}</div></section>`).join('');
    return `<section class="mxj-card"><h3>把这个家画出来</h3><p>固定画风：${esc(themeName(homeTheme(home)))}。背景、人物与家具独立生成，不会在打开小屋时自动生图。</p><p class="mxj-muted">每次准备提示词调用一次文字接口；每次绘制请求一张图片，可能消耗服务额度。确认保存后才替换原图。人物图片暂时保持静态。</p><button type="button" class="mxj-btn" data-act="settings" data-group="image">配置生图连接</button></section>
    ${d?`<section class="mxj-card mxj-art-draft"><h3>画面预览 · ${esc(({portrait:'人物',room:'背景',furniture:'家具'})[d.kind])}</h3><label class="mxj-field"><span>生图提示词（可修改）</span><textarea class="mxj-input" data-field="artPrompt" rows="6">${esc(d.prompt)}</textarea></label><label class="mxj-field"><span>排除内容</span><textarea class="mxj-input" data-field="artNegative" rows="2">${esc(d.negative)}</textarea></label>${d.dataUrl?`<img class="mxj-art-preview" src="${esc(d.dataUrl)}" alt="待确认的生成图片"><p class="mxj-muted">${esc(d.cutoutNote || '')}尺寸 ${d.width} × ${d.height} · 种子 ${d.seed}</p>`:''}<div class="mxj-row"><button type="button" class="mxj-btn is-primary" data-act="art-draw" ${state.busy?'disabled':''}>${d.dataUrl?'重画一张':'绘制一张'}</button>${d.dataUrl?`<button type="button" class="mxj-btn" data-act="art-save" ${state.busy?'disabled':''}>满意，保存</button>`:''}<button type="button" class="mxj-btn" data-act="art-discard" ${state.busy?'disabled':''}>放弃预览</button></div></section>`:''}
    ${portrait}${rooms}`;
}
