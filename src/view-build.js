// 梦想家 · 界面 · 盖房子（选风格、大小、看设计提案、确认外貌入住）和房子档案
import { THEMES, homeTheme, themeName } from './theme.js?mxj=0.5.9';
import { esc } from './util.js?mxj=0.5.9';
import { getSettings, currentCharacter, characterKey, getHome } from './settings.js?mxj=0.5.9';
import { renderFloorPlan } from './furniture.js?mxj=0.5.9';
import { characterView } from './character.js?mxj=0.5.9';
import { HAIR_STYLES, ACCESSORIES } from './sprite.js?mxj=0.5.9';
import { HOUSE_SIZES } from './home-rooms.js?mxj=0.5.9';
import { designHouse, createHome, getLook } from './home-house.js?mxj=0.5.9';
import { ICON, viewNoChar } from './ui-common.js?mxj=0.5.9';

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
        views: { build: viewBuild },
        titles: {
            build: (char, home, name) => [home?.house ? '房子档案' : `给${name}盖一间房`, home?.house ? home.house.name : '按人设设计'],
        },
        actions: {
            theme(el, char) {
                if (!getHome(char)?.house && !state.busy) {
                    state.draft.theme = THEMES.some(t => t.id === el.dataset.id) ? el.dataset.id : 'pixel';
                    state.draft.proposal = null; render();
                }
            },
            size(el) { state.draft.size = el.dataset.id; state.keepScroll = true; render(); },
            design(el, char) {
                if (getHome(char)?.house) return;
                void run('正在按人设设计房子…', async signal => {
                    const proposal = await designHouse(char, { ...state.draft, signal });
                    if (!signal.aborted && characterKey(currentCharacter()) === characterKey(char)) state.draft.proposal = proposal;
                }).then(() => {
                    if (state.draft.proposal && app.root()?.open) app.root().querySelector('.mxj-main').scrollTop = 0;
                });
            },
            accept(el, char) {
                if (!state.draft.proposal || state.busy) return;
                const fresh = !getHome(char)?.house;
                const existing = getHome(char);
                if(existing?.house){flash('已入住的住宅请使用扩建与搬家，不能覆盖旧存档');return;}
                createHome(char, state.draft.proposal);
                state.draft.proposal = null;
                go('art');
                if (fresh && getSettings().visitMode === 'open') void app.doVisit();
            },
        },
        fields: {
            draftAppearance(value) { if (state.draft.proposal) state.draft.proposal.appearance = value; },
            draftColor: draftLook,
            draftHair: draftLook,
            draftAccessory: draftLook,
            emptyWall(value) { state.draft.emptyWall = value; },
            extra(value) { state.draft.extra = value; },
        },
        inputs: {
            draftAppearance(el) { if (state.draft.proposal) state.draft.proposal.appearance = el.value.slice(0,1200); },
            extra(el) { state.draft.extra = el.value; },
        },
    };
}

// 入住前改发色、发型、配饰
function draftLook(value, el, field) {
    if (state.draft.proposal) {
        const key = field === 'draftHair' ? 'hairStyle' : field === 'draftAccessory' ? 'accessory' : el.dataset.key;
        state.draft.proposal.look = { ...getLook({look:state.draft.proposal.look}, currentCharacter()), [key]: value };
        state.keepScroll = true; render();
    }
}

function viewBuild(char, home) {
    if (!char) return viewNoChar();
    const d = state.draft;
    const s = getSettings();
    const name = characterView(char).name;
    const themes = home?.house ? `<p class="mxj-muted">固定风格：${esc(themeName(homeTheme(home)))}。重新设计房屋也会保留此风格。</p>` : `<h3>小屋风格</h3><p class="mxj-muted">入住后固定风格，人物与家具沿用同一套表现。三个主题目前为独立界面主题；图片需要配置生图连接后生成。</p><div class="mxj-chips is-wrap">${THEMES.map(t => `<button type="button" class="mxj-chip${d.theme === t.id ? ' is-on' : ''}" data-act="theme" data-id="${t.id}" aria-pressed="${d.theme === t.id}">${esc(t.name)}</button>`).join('')}</div><p class="mxj-muted">${esc(THEMES.find(t => t.id === d.theme)?.note || '')}</p>`;
    const sizes = HOUSE_SIZES.map(z => `
      <button type="button" class="mxj-size${d.size === z.id ? ' is-on' : ''}" data-act="size" data-id="${z.id}" aria-pressed="${d.size === z.id}">
        <b>${esc(z.name)}</b><span>${esc(z.sub)}</span>
      </button>`).join('');
    if (home?.house) {
        return `
      <section class="mxj-card">${themes}</section>
      ${proposalCard(home.house, true)}
      <section class="mxj-card">
        <h3>想换个样子？</h3>
        <p class="mxj-muted">已经住进来的家不会被整个重新设计掉。想加房间、搬到更大的房子，在小屋首页点「扩建与搬家」；想换家具和墙地颜色，用「布置」。</p>
        <div class="mxj-row">
          <button type="button" class="mxj-btn mxj-grow" data-act="open-expand">扩建与搬家</button>
          <button type="button" class="mxj-btn mxj-grow" data-act="decorate">去布置</button>
        </div>
      </section>`;
    }
    const showing = d.proposal || null;
    const isCurrent = false;
    return `
      <section class="mxj-card">${themes}</section>
      ${showing ? proposalCard(showing, isCurrent) : ''}
      <section class="mxj-card">
        <h3>${showing ? '再设计一版' : '① 从人设里读'}</h3>
        <p class="mxj-muted">会读取 ${esc(name)} 的角色卡和你的用户人设${s.readCharacterWorldBook ? '，以及角色世界书' : ''}。</p>
        <label class="mxj-field">
          <span>补充给 AI 的要求（可空）</span>
          <input type="text" class="mxj-input" data-field="extra" value="${esc(d.extra)}" placeholder="比如：想要一个能看到海的阳台">
        </label>
      </section>
      <section class="mxj-card">
        <h3>${showing ? '房子大小' : '② 房子大小'}</h3>
        <div class="mxj-sizes">${sizes}</div>
        <label class="mxj-check">
          <span>留些空位，等我们一起布置</span>
          <input type="checkbox" data-field="emptyWall" ${d.emptyWall ? 'checked' : ''}>
        </label>
      </section>
      <div class="mxj-row">
        <button type="button" class="mxj-btn is-primary mxj-grow" data-act="design" ${state.busy ? 'disabled' : ''}>${showing ? '按人设重新设计' : '开始设计'}</button>
      </div>`;
}

function proposalCard(house, isCurrent) {
    const swatches = ['wall', 'floor', 'accent', 'trim'].map(k => `<span class="mxj-swatch"><i style="background:${esc(house.palette[k])}"></i>${{ wall: '墙', floor: '地板', accent: '主色', trim: '木作' }[k]}</span>`).join('');
    const rooms = house.rooms.map(r => {
        const items = house.furniture.filter(f => f.room === r.id).map(f => esc(f.name)).join('、');
        return `<li><b>${esc(r.name)}</b>：${items || '空着'}</li>`;
    }).join('');
    return `<section class="mxj-card mxj-proposal">
      <div class="mxj-row mxj-between">
        <h3>${isCurrent ? '现在的家' : 'AI 的设计提案'}</h3>
      </div>
      <div class="mxj-house-name">${esc(house.name)}</div>
      ${house.story ? `<p>${esc(house.story)}</p>` : ''}
      ${renderFloorPlan(house.rooms, house.palette)}
      <div class="mxj-swatches">${swatches}</div>
      <ul class="mxj-room-list">${rooms}</ul>
      ${isCurrent ? '<button type="button" class="mxj-btn" data-act="go" data-view="look">他的样子与外貌</button>' : ''}
      ${isCurrent ? '' : `<h3>入住前确认外貌 · ${esc(themeName(house.theme))}</h3><p class="mxj-muted">核对 AI 提取的描述并手动修改。入住后按这份描述生成所选画风的人物图片。</p><label class="mxj-field"><span>角色外貌描述</span><textarea class="mxj-input" data-field="draftAppearance" rows="4">${esc(house.appearance || '')}</textarea></label>${['hair','eyes','skin','outfit'].map(k => `<label class="mxj-field"><span>${({hair:'发色',eyes:'瞳色',skin:'肤色',outfit:'衣服颜色'})[k]}</span><input type="color" data-field="draftColor" data-key="${k}" value="${getLook({look:house.look}, currentCharacter())[k]}"></label>`).join('')}<label class="mxj-field"><span>发型</span><select class="mxj-input" data-field="draftHair">${HAIR_STYLES.map(x=>`<option value="${x.id}" ${getLook({look:house.look},currentCharacter()).hairStyle === x.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label><label class="mxj-field"><span>配饰</span><select class="mxj-input" data-field="draftAccessory">${ACCESSORIES.map(x=>`<option value="${x.id}" ${getLook({look:house.look},currentCharacter()).accessory === x.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label><div class="mxj-row">
        <button type="button" class="mxj-btn mxj-grow" data-act="design">${ICON.refresh}换一版</button>
        <button type="button" class="mxj-btn is-primary mxj-grow" data-act="accept">确认外貌，就住这里</button>
      </div>`}
    </section>`;
}
