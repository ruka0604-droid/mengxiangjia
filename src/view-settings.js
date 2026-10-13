// 梦想家 · 界面 · 设置（浮窗、文字生成 API、副 API 模型列表、读取范围、回家时机、生图连接、更新日志、拆家）
import { refreshFloating } from './floating.js?mxj=0.6.6';
import { imageEndpoint, imageRequest, fetchImageModels } from './imageApi.js?mxj=0.6.6';
import { esc } from './util.js?mxj=0.6.6';
import { getSettings, updateSettings, currentCharacter, characterKey, removeHome } from './settings.js?mxj=0.6.6';
import { characterView } from './character.js?mxj=0.6.6';
import { listConnectionProfiles, fetchManualModels, fetchProfileModels, testConnection } from './api.js?mxj=0.6.6';
import { ICON } from './ui-common.js?mxj=0.6.6';

let app = null;
let state = null;
const render = () => app.render();
const run = (label, task) => app.run(label, task);
const flash = text => app.flash(text);
const go = view => app.go(view);

export function setup(a) {
    app = a;
    state = a.state;
    return {
        views: { settings: viewSettings },
        titles: {
            settings: () => ['梦想家设置', '生成 · 读取 · 回家'],
        },
        // 每次进设置页，模型列表先收着
        enter: {
            settings() { state.modelListOpen = false; },
        },
        after: {
            settings() {
                const target = state.settingsScrollTo;
                if (target) {
                    state.settingsScrollTo = '';
                    requestAnimationFrame(() => app.root()?.querySelector(`.mxj-group[data-group="${target}"]`)?.scrollIntoView({ block: 'start' }));
                }
                // 列表很长时，把选中的模型滚到列表里看得见的位置（只滚列表本身，不动整页）
                const main = app.root().querySelector('.mxj-main');
                const list = main.querySelector('.mxj-model-list');
                const on = list?.querySelector('.mxj-model-item.is-on');
                if (list && on) list.scrollTop = Math.max(0, on.offsetTop - list.offsetTop - list.clientHeight / 2 + on.offsetHeight / 2);
            },
        },
        actions: {
            source(el) {
                updateSettings({ generationSource: el.dataset.id === 'independent' ? 'independent' : 'follow' });
                state.keepScroll = true;
                render();
            },
            'refresh-profiles'() { state.keepScroll = true; render(); flash('已刷新连接配置'); },
            'fetch-models'() {
                const s = getSettings();
                const key = modelSourceKey(s);
                const profileId = s.independentConnectionProfileId;
                void run('正在拉取模型…', async () => {
                    const list = profileId
                        ? await fetchProfileModels(profileId)
                        : await fetchManualModels(s.independentApiBaseUrl, s.independentApiKey);
                    updateSettings({ independentModelCache: { key, models: list, at: Date.now() } });
                    state.modelFilter = '';
                    state.modelListOpen = true;
                    flash(`拿到 ${list.length} 个模型，点一下就能选`);
                });
            },
            'pick-model'(el) {
                if (el.dataset.id) {
                    updateSettings({ independentApiModel: el.dataset.id });
                    // 选好就收起，不占地方
                    state.modelListOpen = false;
                    state.keepScroll = true;
                    render();
                    flash(`已选择 ${el.dataset.id}`);
                }
            },
            'settings-group'(el) {
                const id = el.dataset.id;
                state.settingsOpen = { ...(state.settingsOpen || {}), [id]: !state.settingsOpen?.[id] };
                state.keepScroll = true;
                render();
            },
            'visit-mode'(el) {
                updateSettings({ visitMode: el.dataset.id === 'manual' ? 'manual' : 'open' });
                state.keepScroll = true;
                render();
            },
            step(el) {
                const key = el.dataset.key;
                if (!['recentChatCount', 'visitGapMinutes'].includes(key)) return;
                const min = key === 'recentChatCount' ? 1 : 0;
                const next = Math.max(min, (Number(getSettings()[key]) || 0) + Number(el.dataset.delta || 0));
                updateSettings({ [key]: next });
                state.keepScroll = true;
                render();
            },
            'toggle-models'() {
                state.modelListOpen = !state.modelListOpen;
                state.keepScroll = true;
                render();
            },
            test() {
                void run('正在测试连接…', async () => {
                    const reply = await testConnection();
                    flash(`连接正常：${reply}`);
                });
            },
            'image-fetch-models'() {
                const cfg = getSettings();
                void run('正在拉取生图模型…', async () => {
                    state.imageModels = await fetchImageModels(cfg.imageBaseUrl, cfg.imageKey);
                    flash(`拿到 ${state.imageModels.length} 个生图模型，在下拉框里选一个`);
                });
            },
            'image-check'() {
                void run('检查生图配置…', async () => {
                    const cfg = getSettings();
                    imageEndpoint(cfg.imageBaseUrl);
                    if (!cfg.imageKey || !cfg.imageModel) throw new Error('请填写密钥和模型 ID');
                    imageRequest(cfg, 'configuration check', '', false);
                    flash('填写格式有效；尚未验证鉴权或实际出图');
                });
            },
            demolish(el, char) {
                if (state.busy) return;
                void app.askConfirm('确定要拆掉这个家吗？纸条、日记和回家记录也会一起删除，不能恢复。', { yes: '拆掉', danger: true }).then(ok => {
                    if (!ok || state.busy) return;
                    const c = currentCharacter();
                    if (!c || characterKey(c) !== characterKey(char)) return;
                    removeHome(char);
                    state.draft = { theme: 'pixel', size: 'flat', extra: '', emptyWall: true, proposal: null };
                    go('build');
                });
            },
        },
        fields: {
            modelFilter(value) { state.modelFilter = value; },
            // 下拉框选了生图模型：存下来，把「模型 ID」框和摘要一起改掉
            imageModelSelect(value) {
                if (!value) return;
                updateSettings({ imageModel: value });
                state.keepScroll = true;
                render();
            },
        },
        inputs: {
            modelFilter(el) {
                state.modelFilter = el.value;
                filterModelList();
            },
            ...Object.fromEntries(['independentApiKey', 'independentApiModel', 'imageKey', 'imageModel', 'imageSampler', 'imageNoise', 'imageExtra']
                .map(field => [field, el => updateSettings({ [field]: el.value })])),
        },
        saveField,
    };
}

// 其余输入框都是设置项，改了直接存
function saveField(field, value) {
    const numeric = ['independentApiTemperature', 'independentApiMaxTokens', 'recentChatCount', 'visitGapMinutes', 'imageWidth', 'imageHeight', 'imagePortraitWidth', 'imagePortraitHeight', 'imageSteps', 'imageScale', 'imageSeed'];
    const patch = { [field]: numeric.includes(field) ? Number(value) : value };
    if (field === 'independentApiBaseUrl') state.models = [];
    updateSettings(patch);
    if (field === 'floatingLauncher') refreshFloating();
    if (field === 'imageBaseUrl') {
        if (state.imageModels.length) { state.imageModels = []; app.root()?.querySelector('[data-field="imageModelSelect"]')?.closest('.mxj-field')?.remove(); }
        const s = getSettings();
        for (const key of ['imageKey', 'imageModel']) {
            const input = app.root()?.querySelector(`[data-field="${key}"]`);
            if (input && input.value !== String(s[key] ?? '')) input.value = String(s[key] ?? '');
        }
        return;
    }
    const rerender = ['generationSource', 'independentConnectionProfileId', 'readRecentChat', 'visitMode'];
    if (rerender.includes(field)) {
        state.keepScroll = true;
        render();
    }
}

// 设置按原来从上到下的顺序分组：小屋浮窗（直接是开关）→ 文字生成 → 生成时读取 → 他什么时候回家 → 生图连接 → 更新日志 → 拆掉这个家。
// 每组默认收起，收起时下面一行小字写着现在的设置；点标题展开。
function viewSettings(char, home) {
    const s = getSettings();
    return `
      <section class="mxj-card mxj-group-flat">
        ${switchRow('floatingLauncher', '小屋浮窗', '在酒馆页面上放一个可拖动的入口，轻点打开。魔法棒入口一直都在。', s.floatingLauncher)}
      </section>
      ${group('text', '文字生成', textSummary(s), textBody)}
      ${group('read', '生成时读取', readSummary(s), readBody)}
      ${group('visit', '他什么时候回家', visitSummary(s), visitBody)}
      ${group('image', '生图连接', imageSummary(s), imageSettingsFields)}
      ${group('log', '更新日志', logSummary(), changelogBody)}
      ${home?.house ? `<section class="mxj-danger">
        <span class="mxj-grow">删除${esc(characterView(char).name)}的家，连同纸条、日记和回家记录，不能恢复。</span>
        <button type="button" class="mxj-danger-btn" data-act="demolish">拆掉这个家</button>
      </section>` : ''}`;
}

const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

function group(id, title, summary, body) {
    const open = !!state.settingsOpen?.[id];
    return `<section class="mxj-card mxj-group${open ? ' is-open' : ''}" data-group="${id}">
        <button type="button" class="mxj-group-head" data-act="settings-group" data-id="${id}" aria-expanded="${open}"${open ? ` aria-controls="mxj-group-${id}"` : ''}>
          <span class="mxj-grow"><span class="mxj-group-title">${esc(title)}</span><span class="mxj-group-sum">${esc(summary)}</span></span>
          ${CHEVRON}
        </button>
        ${open ? `<div class="mxj-group-body" id="mxj-group-${id}">${body()}</div>` : ''}
      </section>`;
}

function hostOf(url) {
    try { return new URL(String(url).trim()).host; } catch { return String(url || '').trim(); }
}

function textSummary(s) {
    if (s.generationSource !== 'independent') return '跟随当前 API';
    const profile = s.independentConnectionProfileId ? listConnectionProfiles().find(p => p.id === s.independentConnectionProfileId)?.name : '';
    const where = profile || hostOf(s.independentApiBaseUrl) || '还没填接口';
    return `副 API · ${where} · ${String(s.independentApiModel || '').trim() || (profile ? '用连接配置里的模型' : '还没选模型')}`;
}

function readSummary(s) {
    return `${s.readCharacterWorldBook ? '读世界书' : '不读世界书'} · ${s.readRecentChat ? `读最近 ${s.recentChatCount} 条聊天` : '不读聊天'}`;
}

function visitSummary(s) {
    return s.visitMode === 'open' ? `打开小屋时回家，至少隔 ${s.visitGapMinutes} 分钟` : '只在我点「等他回家」时';
}

function imageSummary(s) {
    if (!String(s.imageBaseUrl || '').trim()) return '还没填 · 画人物和房间时才需要';
    const missing = [!s.imageKey && 'Key', !s.imageModel && '模型'].filter(Boolean);
    return `${hostOf(s.imageBaseUrl)} · ${missing.length ? `还没填${missing.join('和')}` : s.imageModel}`;
}

function logSummary() {
    if (state.changelog === null) void loadChangelog();
    return state.changelog ? state.changelog.title : (state.changelog === null ? '读取中…' : '读不到更新日志');
}

function switchRow(field, name, note, on) {
    return `<label class="mxj-switch-row">
          <span class="mxj-grow"><span class="mxj-switch-name">${esc(name)}</span>${note ? `<span class="mxj-muted">${esc(note)}</span>` : ''}</span>
          <input type="checkbox" role="switch" class="mxj-switch" data-field="${field}" ${on ? 'checked' : ''}>
        </label>`;
}

function stepper(field, label, value, step, unit) {
    return `<div class="mxj-stepper">
          <span>${esc(label)}</span>
          <span class="mxj-stepper-box">
            <button type="button" data-act="step" data-key="${field}" data-delta="${-step}" aria-label="${esc(label)}减少 ${step}">−</button>
            <input type="number" class="mxj-input" data-field="${field}" value="${esc(value)}" min="${field === 'recentChatCount' ? 1 : 0}" step="${step}" inputmode="numeric" aria-label="${esc(label)}（${esc(unit)}）">
            <span class="mxj-stepper-unit">${esc(unit)}</span>
            <button type="button" data-act="step" data-key="${field}" data-delta="${step}" aria-label="${esc(label)}增加 ${step}">＋</button>
          </span>
        </div>`;
}

function textBody() {
    const s = getSettings();
    const profiles = listConnectionProfiles();
    const independent = s.generationSource === 'independent';
    const profileOptions = [`<option value="">不用连接配置（手动填写接口）</option>`]
        .concat(profiles.map(p => `<option value="${esc(p.id)}" ${p.id === s.independentConnectionProfileId ? 'selected' : ''}>${esc(p.name)}</option>`))
        .join('');
    const usingProfile = !!s.independentConnectionProfileId;
    return `
        <div class="mxj-seg" role="radiogroup" aria-label="文字生成用哪个 API">
          <button type="button" role="radio" class="${!independent ? 'is-on' : ''}" data-act="source" data-id="follow" aria-checked="${!independent}">跟随当前 API</button>
          <button type="button" role="radio" class="${independent ? 'is-on' : ''}" data-act="source" data-id="independent" aria-checked="${independent}">使用副 API</button>
        </div>
        <p class="mxj-muted">${independent ? '现在用的是下面配置的副 API。' : '跟着酒馆当前选的 API 和模型生成，不用在这里拉模型。想单独选模型，用「使用副 API」。'}</p>
        ${independent ? `
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
        ${modelListBox(s)}
        <label class="mxj-field"><span>模型 ID（可以从上面的列表点选，也可以直接填）${usingProfile ? '，空着就用连接配置里的模型' : ''}</span>
          <input type="text" class="mxj-input" data-field="independentApiModel" value="${esc(s.independentApiModel)}" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="模型 ID">
        </label>
        <div class="mxj-two">
          <label class="mxj-field"><span>温度</span><input type="number" class="mxj-input" data-field="independentApiTemperature" value="${esc(s.independentApiTemperature)}" min="0" max="2" step="0.05" inputmode="decimal"></label>
          <label class="mxj-field"><span>最大输出</span><input type="number" class="mxj-input" data-field="independentApiMaxTokens" value="${esc(s.independentApiMaxTokens)}" min="256" max="64000" step="256" inputmode="numeric"></label>
        </div>` : ''}
        <button type="button" class="mxj-btn" data-act="test" ${state.busy ? 'disabled' : ''}>测试连接</button>`;
}

function readBody() {
    const s = getSettings();
    return `
        ${switchRow('readCharacterWorldBook', '角色世界书', '', s.readCharacterWorldBook)}
        ${switchRow('readRecentChat', '最近的聊天', '', s.readRecentChat)}
        ${s.readRecentChat ? stepper('recentChatCount', '读最近', s.recentChatCount, 1, '条') : ''}`;
}

function visitBody() {
    const s = getSettings();
    const open = s.visitMode === 'open';
    return `
        <div class="mxj-seg" role="radiogroup" aria-label="他什么时候回家">
          <button type="button" role="radio" class="${open ? 'is-on' : ''}" data-act="visit-mode" data-id="open" aria-checked="${open}">打开小屋时</button>
          <button type="button" role="radio" class="${open ? '' : 'is-on'}" data-act="visit-mode" data-id="manual" aria-checked="${!open}">只在我点时</button>
        </div>
        <p class="mxj-muted">${open ? '打开小屋时，离上次回家够久就回来。' : '只在你点「等他回家」时回来。'}</p>
        ${open ? stepper('visitGapMinutes', '至少隔', s.visitGapMinutes, 10, '分钟') : ''}`;
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
    const open = !!state.modelListOpen;
    const items = models.map(m => {
        const on = m === current;
        const hidden = q && !m.toLowerCase().includes(q) ? ' hidden' : '';
        return `<button type="button" role="option" aria-selected="${on}" class="mxj-model-item${on ? ' is-on' : ''}" data-act="pick-model" data-id="${esc(m)}"${hidden}><span>${esc(m)}</span>${on ? '<i aria-hidden="true">✓</i>' : ''}</button>`;
    }).join('');
    return `<div class="mxj-field mxj-model-box">
      <span>模型列表</span>
      <div class="mxj-row mxj-wrap">
        <button type="button" class="mxj-btn mxj-grow" data-act="fetch-models" ${state.busy ? 'disabled' : ''}>${models.length ? '重新拉取' : '拉取模型列表'}</button>
        ${models.length ? `<button type="button" class="mxj-btn mxj-grow" data-act="toggle-models" aria-expanded="${open}" aria-controls="mxj-model-list">${open ? '收起列表 ▴' : `展开列表 · ${models.length} 个 ▾`}</button>` : ''}
      </div>
      ${models.length && open ? `
      <label class="mxj-sr" for="mxj-model-filter">搜索模型</label>
      <input id="mxj-model-filter" type="text" class="mxj-input" data-field="modelFilter" value="${esc(state.modelFilter || '')}" placeholder="搜索模型（共 ${models.length} 个）" autocapitalize="off" autocomplete="off" spellcheck="false" enterkeyhint="search">
      <div id="mxj-model-list" class="mxj-model-list" role="listbox" aria-label="模型列表">${items}</div>
      <p class="mxj-muted mxj-model-empty"${q && !models.some(m => m.toLowerCase().includes(q)) ? '' : ' hidden'}>没有找到包含这几个字的模型。</p>`
        : models.length ? '' : `<p class="mxj-muted">${s.independentConnectionProfileId ? '会用选中的酒馆连接配置去拉取。' : '先填好 API 地址和 Key，'}点「拉取模型列表」，可选的模型会列在这里，点一下就选上。</p>`}
    </div>`;
}

function filterModelList() {
    const box = app.root()?.querySelector('.mxj-model-box');
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

function imageSettingsFields() {
    const cfg = getSettings();
    const text = (key,label,type='text') => `<label class="mxj-field"><span>${label}</span><input class="mxj-input" type="${type}" data-field="${key}" value="${esc(cfg[key])}" autocomplete="off" placeholder="${label}"></label>`;
    const number = (key,label,step=1) => `<label class="mxj-field"><span>${label}</span><input class="mxj-input" type="number" step="${step}" data-field="${key}" value="${esc(cfg[key])}" inputmode="decimal"></label>`;
    return `<p class="mxj-muted">图片接口与文字接口分别配置。每位使用者填写自己的兼容服务；此模块不连接任何其他扩展。</p>
      ${text('imageBaseUrl','API 地址')}${text('imageKey','API Key','password')}
      <button type="button" class="mxj-btn" data-act="image-fetch-models" ${state.busy?'disabled':''}>${state.imageModels.length ? '重新拉取生图模型' : '拉取生图模型'}</button>
      ${state.imageModels.length ? `<label class="mxj-field"><span>选择生图模型（共 ${state.imageModels.length} 个）</span><select class="mxj-input" data-field="imageModelSelect"><option value="">请选择</option>${state.imageModels.map(m=>`<option value="${esc(m)}" ${m===cfg.imageModel?'selected':''}>${esc(m)}</option>`).join('')}</select></label>` : ''}
      ${text('imageModel','模型 ID')}
      <label class="mxj-field"><span>描述格式（按服务要求选择）</span><select class="mxj-input" data-field="imagePromptFormat"><option value="structured" ${cfg.imagePromptFormat==='structured'?'selected':''}>结构化描述</option><option value="legacy" ${cfg.imagePromptFormat==='legacy'?'selected':''}>基础描述</option></select></label>
      <button type="button" class="mxj-btn" data-act="image-check" ${state.busy?'disabled':''}>检查填写（不生图）</button>
      <p class="mxj-muted">需要服务允许浏览器跨域访问。地址可填写站点根地址、/v1 地址或完整生图端点。更换地址会分别记住密钥。不是所有服务都提供模型列表，拉不到就手动填模型 ID。</p>
      <details><summary>画幅与高级参数</summary><div class="mxj-two">${number('imageWidth','房间／家具宽',64)}${number('imageHeight','房间／家具高',64)}${number('imagePortraitWidth','人物宽',64)}${number('imagePortraitHeight','人物高',64)}${number('imageSteps','步数')}${number('imageScale','提示词相关性',0.1)}${number('imageSeed','种子（0 随机）')}</div>
      ${text('imageSampler','采样器 ID')}${text('imageNoise','噪声计划 ID')}
      <label class="mxj-check"><span>人物／家具使用纯色底辅助抠图</span><input type="checkbox" data-field="imageCutout" ${cfg.imageCutout?'checked':''}></label>
      <label class="mxj-field"><span>额外参数 JSON（可选）</span><textarea class="mxj-input" rows="4" data-field="imageExtra">${esc(cfg.imageExtra)}</textarea></label><p class="mxj-muted">附加参数放入绘图 parameters 中；画幅、提示词和单张数量由本页设置控制。</p></details>`;
}

function changelogBody() {
    if (state.changelog === null) {
        void loadChangelog();
        return '<p class="mxj-muted">读取中…</p>';
    }
    if (!state.changelog) return '<p class="mxj-muted">读不到更新日志。</p>';
    return `<ul class="mxj-changelog">${state.changelog.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
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
