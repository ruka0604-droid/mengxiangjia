// 梦想家 · 界面 · 画出我们的家（准备提示词 → 画一张 → 满意再保存）
import { prepareArt, generateArt, acceptArt, prepareFurnitureBatch, toggleRawArt } from './art.js?mxj=0.8.0';
import { homeTheme, themeName } from './theme.js?mxj=0.8.0';
import { esc } from './util.js?mxj=0.8.0';
import { currentCharacter, characterKey } from './settings.js?mxj=0.8.0';

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
            'art-raw'() { if (state.artDraft && !state.busy) { state.artDraft = toggleRawArt(state.artDraft); state.keepScroll = true; render(); } },
            // 一间房没画的家具一起画：先一次整理全部描述，再一件一件画，画完逐件看、逐件保存
            'art-batch'(el, char) {
                if (!char || state.busy) return;
                void run('整理这间房的家具描述…', async signal => {
                    const batch = await prepareFurnitureBatch(char, el.dataset.id || '', {signal});
                    if (signal.aborted || characterKey(currentCharacter()) !== batch.owner) return;
                    state.artBatch = batch;
                    state.artDraft = null;
                    render();
                    app.root()?.querySelector('.mxj-main')?.scrollTo?.(0, 0);
                    await drawBatch(batch, signal);
                });
            },
            'art-batch-continue'() {
                const batch = state.artBatch;
                if (!batch || state.busy) return;
                void run('继续画剩下的家具…', signal => drawBatch(batch, signal));
            },
            'art-batch-redraw'(el) {
                const item = batchItem(el);
                if (!item || state.busy) return;
                void run(`重画「${item.name}」…`, signal => drawBatch(state.artBatch, signal, item.id));
            },
            'art-batch-raw'(el) {
                const item = batchItem(el);
                if (!item || state.busy) return;
                Object.assign(item, toggleRawArt(item));
                state.keepScroll = true; render();
            },
            'art-batch-skip'(el) {
                const item = batchItem(el);
                if (!item || state.busy) return;
                item.skipped = !item.skipped;
                state.keepScroll = true; render();
            },
            'art-batch-save'(el, char) {
                const item = batchItem(el);
                if (!item?.dataUrl || item.saved || state.busy) return;
                void run(`保存「${item.name}」…`, async signal => {
                    await acceptArt(char, item, {signal});
                    item.saved = true;
                    flash(`「${item.name}」已保存`);
                });
            },
            'art-batch-save-all'(el, char) {
                const batch = state.artBatch;
                if (!batch || state.busy) return;
                const todo = batch.items.filter(it => it.dataUrl && !it.saved && !it.skipped);
                if (!todo.length) return;
                void run('保存图片…', async signal => {
                    let n = 0;
                    for (const item of todo) {
                        if (signal.aborted) break;
                        state.busy = `保存第 ${++n}/${todo.length} 张：${item.name}`;
                        app.renderStatus();
                        await acceptArt(char, item, {signal});
                        item.saved = true;
                    }
                    flash(`保存了 ${n} 张`);
                });
            },
            'art-batch-close'() { if (!state.busy) { state.artBatch = null; state.keepScroll = true; render(); } },
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

function batchItem(el) {
    return state.artBatch?.items.find(it => it.id === el.dataset.id) || null;
}

// 一件一件画；碰到 Key、额度、地址这类每件都会一样失败的错误就停下，服务忙就等一会儿再试一次
async function drawBatch(batch, signal, only = '') {
    const todo = batch.items.filter(it => only ? it.id === only : !it.dataUrl && !it.saved && !it.skipped);
    let n = 0;
    for (const item of todo) {
        if (signal.aborted) break;
        state.busy = only ? `重画「${item.name}」…` : `正在画第 ${++n}/${todo.length} 件：${item.name}`;
        app.renderStatus();
        item.error = '';
        try {
            let result;
            try { result = await generateArt(item, {signal}); }
            catch (error) {
                if (signal.aborted || !/HTTP (?:409|429)/.test(error?.message || '')) throw error;
                await new Promise(resolve => setTimeout(resolve, 4000));
                result = await generateArt(item, {signal});
            }
            if (signal.aborted) break;
            Object.assign(item, result, { saved: false });
        } catch (error) {
            if (signal.aborted) throw error;
            item.error = error?.message || String(error);
            if (/HTTP (?:40[0-4])|连不上生图服务|请先填写/.test(item.error)) {
                state.keepScroll = true; render();
                throw new Error(`画「${item.name}」时出错，剩下的先不画了：${item.error}`);
            }
        }
        state.keepScroll = true;
        render();
    }
}

function batchCard() {
    const b = state.artBatch;
    if (!b) return '';
    const left = b.items.filter(it => !it.dataUrl && !it.saved && !it.skipped).length;
    const unsaved = b.items.filter(it => it.dataUrl && !it.saved && !it.skipped).length;
    const items = b.items.map(it => {
        const img = it.dataUrl ? `<img class="mxj-art-preview" src="${esc(it.dataUrl)}" alt="${esc(it.name)}">` : `<div class="mxj-art-wait">${it.error ? '没画成' : it.skipped ? '不画了' : '还没画'}</div>`;
        const buttons = it.saved ? '<span class="mxj-muted">已保存</span>'
            : it.skipped ? `<button type="button" class="mxj-btn" data-act="art-batch-skip" data-id="${esc(it.id)}" ${state.busy ? 'disabled' : ''}>还是要</button>`
            : `${it.dataUrl ? `<button type="button" class="mxj-btn is-primary" data-act="art-batch-save" data-id="${esc(it.id)}" ${state.busy ? 'disabled' : ''}>保存</button>` : ''}
               <button type="button" class="mxj-btn" data-act="art-batch-redraw" data-id="${esc(it.id)}" ${state.busy ? 'disabled' : ''}>${it.dataUrl || it.error ? '重画' : '画这件'}</button>
               ${it.cutDataUrl ? `<button type="button" class="mxj-btn" data-act="art-batch-raw" data-id="${esc(it.id)}" ${state.busy ? 'disabled' : ''}>${it.useRaw ? '去背景' : '用原图'}</button>` : ''}
               <button type="button" class="mxj-btn" data-act="art-batch-skip" data-id="${esc(it.id)}" ${state.busy ? 'disabled' : ''}>不要</button>`;
        return `<div class="mxj-batch-item${it.skipped ? ' is-skipped' : ''}">${img}<b>${esc(it.name)}</b>${it.error ? `<p class="mxj-muted">${esc(it.error)}</p>` : ''}<div class="mxj-row">${buttons}</div></div>`;
    }).join('');
    return `<section class="mxj-card mxj-art-batch"><h3>${esc(b.roomName)} · 家具一起画</h3>
      <p class="mxj-muted">一件一件画，画好的在这里看，满意的再保存；没保存的不会替换房间里的样子。</p>
      <div class="mxj-batch-grid">${items}</div>
      <div class="mxj-row">${unsaved ? `<button type="button" class="mxj-btn is-primary" data-act="art-batch-save-all" ${state.busy ? 'disabled' : ''}>保存全部画好的（${unsaved}）</button>` : ''}${left && !state.busy ? `<button type="button" class="mxj-btn" data-act="art-batch-continue">接着画剩下的（${left}）</button>` : ''}<button type="button" class="mxj-btn" data-act="art-batch-close" ${state.busy ? 'disabled' : ''}>收起</button></div></section>`;
}

function viewArt(char,home) {
    if (!home?.house) return app.renderView('build', char, home);
    const d = state.artDraft;
    const portrait = `<section class="mxj-card"><h3>人物 · ${esc(themeName(homeTheme(home)))}</h3><p>${esc(home.appearance || '尚未确认外貌；请先在人物形象页核对描述。')}</p>${home.art?.path?`<img class="mxj-art-preview" src="${esc(home.art.path)}" alt="已保存的人物">`:''}<div class="mxj-row"><button type="button" class="mxj-btn" data-act="go" data-view="look">确认外貌</button><button type="button" class="mxj-btn" data-act="art-prepare" data-kind="portrait" ${state.busy?'disabled':''}>${home.art?.path?'重新生成提示词':'准备人物提示词'}</button></div></section>`;
    const rooms = home.house.rooms.map(r => `<section class="mxj-card"><h3>${esc(r.name)} · 背景与家具</h3>${r.art?.path?`<img class="mxj-art-preview is-room" src="${esc(r.art.path)}" alt="${esc(r.name)}背景">`:''}<div class="mxj-row"><button type="button" class="mxj-btn" data-act="art-prepare" data-kind="room" data-id="${esc(r.id)}" ${state.busy?'disabled':''}>准备空房间背景提示词</button>${(n=>n?`<button type="button" class="mxj-btn" data-act="art-batch" data-id="${esc(r.id)}" ${state.busy?'disabled':''}>没画的家具一起画（${n} 件）</button>`:'')(home.house.furniture.filter(f=>f.room===r.id && !f.art?.path).length)}</div><div class="mxj-art-list">${home.house.furniture.filter(f=>f.room===r.id).map(f=>`<div class="mxj-art-item">${f.art?.path?`<img src="${esc(f.art.path)}" alt="${esc(f.name)}">`:''}<span>${esc(f.name)}</span><button type="button" class="mxj-btn" data-act="art-prepare" data-kind="furniture" data-id="${esc(f.id)}" ${state.busy?'disabled':''}>${f.art?.path?'重画':'绘制'}</button></div>`).join('')}</div></section>`).join('');
    return `<section class="mxj-card"><h3>把这个家画出来</h3><p>当前画风：${esc(themeName(homeTheme(home)))}（可在房子档案里换，图片按风格分开保存）。背景、人物与家具独立生成，不会在打开小屋时自动生图。</p><p class="mxj-muted">每次准备提示词调用一次文字接口；每次绘制请求一张图片，可能消耗服务额度。确认保存后才替换原图。人物图片没有动作动画，在房间里会轻轻晃动。</p><button type="button" class="mxj-btn" data-act="settings" data-group="image">配置生图连接</button></section>
    ${batchCard()}
    ${d?`<section class="mxj-card mxj-art-draft"><h3>画面预览 · ${esc(({portrait:'人物',room:'背景',furniture:'家具'})[d.kind])}</h3><label class="mxj-field"><span>生图提示词（可修改）</span><textarea class="mxj-input" data-field="artPrompt" rows="6">${esc(d.prompt)}</textarea></label><label class="mxj-field"><span>排除内容</span><textarea class="mxj-input" data-field="artNegative" rows="2">${esc(d.negative)}</textarea></label>${d.dataUrl?`<img class="mxj-art-preview" src="${esc(d.dataUrl)}" alt="待确认的生成图片"><p class="mxj-muted">${esc(d.cutoutNote || '')}尺寸 ${d.width} × ${d.height} · 种子 ${d.seed}</p>`:''}<div class="mxj-row"><button type="button" class="mxj-btn is-primary" data-act="art-draw" ${state.busy?'disabled':''}>${d.dataUrl?'重画一张':'绘制一张'}</button>${d.dataUrl?`<button type="button" class="mxj-btn" data-act="art-save" ${state.busy?'disabled':''}>满意，保存</button>`:''}${d.cutDataUrl?`<button type="button" class="mxj-btn" data-act="art-raw" ${state.busy?'disabled':''}>${d.useRaw?'去掉背景':'用原图'}</button>`:''}<button type="button" class="mxj-btn" data-act="art-discard" ${state.busy?'disabled':''}>放弃预览</button></div></section>`:''}
    ${portrait}${rooms}`;
}
