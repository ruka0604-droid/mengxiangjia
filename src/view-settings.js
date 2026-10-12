// 梦想家 · 界面 · 设置（浮窗、文字生成 API、副 API 模型列表、读取范围、回家时机、生图连接、更新日志、拆家）
import { refreshFloating } from './floating.js?mxj=0.5.8';
import { imageEndpoint, imageRequest } from './imageApi.js?mxj=0.5.8';
import { esc } from './util.js?mxj=0.5.8';
import { getSettings, updateSettings, currentCharacter, characterKey, removeHome } from './settings.js?mxj=0.5.8';
import { characterView } from './character.js?mxj=0.5.8';
import { listConnectionProfiles, fetchManualModels, fetchProfileModels, testConnection } from './api.js?mxj=0.5.8';
import { ICON } from './ui-common.js?mxj=0.5.8';

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
        after: {
            settings() {
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
                    flash(`拿到 ${list.length} 个模型，点一下就能选`);
                });
            },
            'pick-model'(el) {
                if (el.dataset.id) {
                    updateSettings({ independentApiModel: el.dataset.id });
                    state.keepScroll = true;
                    render();
                    flash(`已选择 ${el.dataset.id}`);
                }
            },
            test() {
                void run('正在测试连接…', async () => {
                    const reply = await testConnection();
                    flash(`连接正常：${reply}`);
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
        },
        inputs: {
            modelFilter(el) {
                state.modelFilter = el.value;
                filterModelList();
            },
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
    const rerender = ['generationSource', 'independentConnectionProfileId', 'readRecentChat', 'visitMode', 'imageBaseUrl'];
    if (rerender.includes(field)) {
        state.keepScroll = true;
        render();
    }
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
