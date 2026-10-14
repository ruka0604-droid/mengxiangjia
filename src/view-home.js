// 梦想家 · 界面 · 小屋首页（房间、他在做什么、扩建与搬家）和回家记录
import { moodFace, homeTheme } from './theme.js?mxj=0.8.0';
import { esc, formatTime, daysSince } from './util.js?mxj=0.8.0';
import { getSettings, currentCharacter, characterKey, getHome, setHome } from './settings.js?mxj=0.8.0';
import { renderRoom, SCENE_H, CATALOG } from './furniture.js?mxj=0.8.0';
import { characterView, avatarUrl } from './character.js?mxj=0.8.0';
import { spriteInRoom, poseFor } from './sprite.js?mxj=0.8.0';
import { HOUSE_SIZES, ROOM_MODULES, roomModulesFromText, addRoomModules, removeRoomModule, upgradeHouse } from './home-rooms.js?mxj=0.8.0';
import { getLook } from './home-house.js?mxj=0.8.0';
import { comeHome, respond, isAway } from './home-visit.js?mxj=0.8.0';
import { unreadFromChar } from './home-notes.js?mxj=0.8.0';
import { unreadDiary } from './home-diary.js?mxj=0.8.0';
import { ICON, viewNoChar } from './ui-common.js?mxj=0.8.0';
import { petsLayer } from './pet-art.js?mxj=0.8.0';
import { animalStatus, plantStatus, animalRoom, animalPose, pettingNow } from './pets-data.js?mxj=0.8.0';

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
        views: { home: viewHome, log: viewLog },
        titles: {
            home: (char, home, name) => [home?.house ? `${name}的家` : '梦想家', home?.house ? `${home.house.name} · 住了 ${daysSince(home.createdAt)} 天` : ''],
            log: (char, home) => ['回家记录', `${(home?.visits || []).length} 次`],
        },
        actions: {
            room(el, char) {
                const home = getHome(char);
                home.currentRoom = el.dataset.id;
                state.selectedFurniture = '';
                state.selectedPet = '';
                setHome(char, home);
                state.keepScroll = true;
                render();
            },
            furniture(el) {
                if (state.view === 'decorate') {
                    state.deco.selected = el.dataset.id;
                    state.keepScroll = true;
                    render();
                    return;
                }
                state.selectedFurniture = state.selectedFurniture === el.dataset.id ? '' : el.dataset.id;
                state.selectedPet = '';
                state.keepScroll = true;
                render();
            },
            unselect() { state.selectedFurniture = ''; state.keepScroll = true; render(); },
            visit() { void doVisit(); },
            option(el) { void doRespond(el.dataset.text); },
            'furniture-act'(el) { void doRespond(el.dataset.text, state.selectedFurniture); },
            'show-layout'() {
                const summary = state.newLayout;
                state.newLayout = '';
                void doRespond(`你把家里重新布置了一下（${summary}），叫他过来看看`);
            },
            'open-expand'() {
                state.expandOpen = true;
                go('home');
                requestAnimationFrame(() => app.root()?.querySelector('.mxj-expand')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
            },
            upgrade(el, char) {
                if(!char || !getHome(char)?.house || state.busy) return;
                const name=HOUSE_SIZES.find(x=>x.id===el.dataset.id)?.name;
                if(!name) return;
                void app.askConfirm(`搬到${name}？原房间和家具全部保留，只补上新房子该有的房间。`, { yes: '搬过去' }).then(ok => {
                    if (ok) roomAction(char, () => upgradeHouse(char, el.dataset.id), `搬到${name}了`);
                });
            },
            'add-room'(el, char) {
                if(char && getHome(char)?.house && ROOM_MODULES[el.dataset.id]) roomAction(char, () => addRoomModules(char,[el.dataset.id]), `加了一间${ROOM_MODULES[el.dataset.id]}`);
            },
            'add-room-text'(el, char) {
                if(!char)return;
                const value=app.root().querySelector('[data-field="roomExtra"]')?.value||state.roomExtra||'';
                const types=roomModulesFromText(value);
                if(!types.length){state.error='没有认出要加的房间，可以写「两个卧室、一个书房」这样，或者直接点上面的按钮。';state.keepScroll=true;render();return;}
                void app.askConfirm(`增加 ${types.map(t=>ROOM_MODULES[t]).join('、')}？`, { yes: '增加' }).then(ok => {
                    if (ok) roomAction(char, () => { addRoomModules(char,types); state.roomExtra=''; }, '房间加好了');
                });
            },
            'remove-room'(el, char) {
                if(!char||state.busy)return;const h=getHome(char);const r=h?.house?.rooms?.find(x=>x.id===el.dataset.id);
                if(!r) return;
                void app.askConfirm(`移除「${r.name}」？房间里的家具会收进仓库（布置页的「仓库」里能拿出来），纸条和日记不受影响。`, { yes: '移除', danger: true }).then(ok => {
                    if (ok) roomAction(char, () => removeRoomModule(char,r.id), '房间已移除，家具收进仓库了');
                });
            },
        },
        fields: {
            roomExtra(value) { state.roomExtra = value; },
        },
        inputs: {
            roomExtra(el) { state.roomExtra = el.value; },
        },
        forms: {
            say(text) { void doRespond(text); },
            'furniture-say'(text) {
                const f = state.selectedFurniture;
                void doRespond(text, f);
            },
        },
        doVisit,
    };
}

// 扩建、搬家、加减房间：出错时在面板上说清楚原因，保持滚动位置和展开状态
function roomAction(char, fn, okText) {
    // 确认框弹着的时候可能切了聊天或开始了生成，这时不再动这个家
    if (!char || characterKey(currentCharacter()) !== characterKey(char)) return;
    if (state.busy) {
        flash('正在生成，等这次结束再改房间');
        return;
    }
    try {
        fn();
        state.error = '';
        state.keepScroll = true;
        render();
        if (okText) flash(okText);
    } catch (error) {
        state.error = error?.message || String(error);
        state.keepScroll = true;
        render();
    }
}

function isNight() {
    const h = new Date().getHours();
    return h >= 19 || h < 6;
}

function viewHome(char, home) {
    if (!home?.house) return app.renderView('build', char, home);
    const house = home.house;
    const roomId = house.rooms.some(r => r.id === home.currentRoom) ? home.currentRoom : house.rooms[0].id;
    const room = house.rooms.find(r => r.id === roomId);
    const furniture = house.furniture.filter(f => f.room === roomId);
    const night = isNight();
    const presence0 = home.presence || {};
    const awayNow = isAway(home) && !state.busy;
    const spotItem = house.furniture.find(f => f.id === presence0.spot);
    const showFigure = !awayNow && presence0.atHome !== false && (!spotItem || spotItem.room === roomId);
    const look = getLook(home, char);
    const pose = poseFor({ spotType: spotItem?.type || '', activity: presence0.activity, night });
    // 他在摸哪一只：那一只在这间房里时，小人走到它旁边蹲下伸手
    const pat = showFigure ? pettingNow(home, Date.now(), { away: awayNow }) : null;
    const patAnimal = pat ? (home.pets?.animals || []).find(a => a.id === pat.id && animalRoom(a, house.rooms) === roomId) : null;
    const xOverride = {};
    let patX = 0;
    if (patAnimal) {
        // 画好立绘的，宠物跑到立绘脚边；像素小人就走到宠物旁边
        patX = home.art?.path ? 54 : Math.min(80, Math.max(20, animalPose(patAnimal).x));
        xOverride[patAnimal.id] = patX;
    }
    const figure = showFigure && !home.art?.path
        ? (anchors) => patAnimal
            ? spriteInRoom(look, { sit: true, reach: true, closed: false, sleepy: false, seatOffset: 0 }, { x: patX / 100 * 360 + (patX > 50 ? 44 : -44) }, SCENE_H, { theme: homeTheme(home), mood: home.presence?.mood, flip: patX > 50, label: `${characterView(char).name}（点一下看他的样子）` })
            : spriteInRoom(look, pose, spotItem ? anchors[spotItem.id] : null, SCENE_H, { theme: homeTheme(home), mood: home.presence?.mood, label: `${characterView(char).name}（点一下看他的样子）` })
        : null;
    // 小家伙们画在最前面一层
    const petSvg = petsLayer(home, roomId, { selectedId: state.selectedPet, patting: patAnimal?.id || '', xOverride });
    const { svg } = renderRoom(room, furniture, house.palette, { night, selectedId: state.selectedFurniture, figure: anchors => (figure ? figure(anchors) : '') + petSvg });
    const away = isAway(home) && !state.busy;
    const presence = home.presence || {};
    const name = characterView(char).name;
    const unread = unreadFromChar(home);
    const diaryBadge = unreadDiary(home);

    // 房间页签上的小点：这间房里有小家伙
    const pets = home.pets || {};
    const petRooms = new Set([...(pets.animals || []).map(a => animalRoom(a, house.rooms)), ...(pets.plants || []).map(p => p.room)]);
    const petNeeds = (pets.animals || []).filter(a => animalStatus(a).bubble).length + (pets.plants || []).filter(p => plantStatus(p).trouble).length;
    const tabs = house.rooms.length > 1
        ? `<div class="mxj-chips" role="tablist">${house.rooms.map(r => `<button type="button" role="tab" aria-selected="${r.id === roomId}" class="mxj-chip${r.id === roomId ? ' is-on' : ''}" data-act="room" data-id="${esc(r.id)}">${esc(r.name)}${petRooms.has(r.id) ? '<i class="mxj-pet-dot" aria-label="有小家伙"></i>' : ''}</button>`).join('')}</div>`
        : '';

    const statusLine = away
        ? `<span class="mxj-dot is-away"></span><span class="mxj-grow">他还没回来</span>`
        : `<span class="mxj-dot"></span><span class="mxj-grow">他在家${patAnimal ? ` · 在摸${esc(patAnimal.name)}` : presence.activity ? ` · ${esc(presence.activity)}` : ''}</span>`;

    const portrait = showFigure && home.art?.path ? `<button type="button" class="mxj-art-person is-${homeTheme(home)}" data-act="avatar" aria-label="查看角色形象"><img src="${esc(home.art.path)}" alt="${esc(name)}"><span>${esc(moodFace(presence.mood,homeTheme(home)))}</span></button>` : '';
    return `
      <div class="mxj-strip">${statusLine}<span class="mxj-muted">${night ? '夜里' : '白天'} · ${esc(formatTime(Date.now()).replace('今天 ', ''))}</span></div>
      ${tabs}
      <div class="mxj-scene">
        ${svg}${portrait}
        ${unread ? `<button type="button" class="mxj-badge-btn" data-act="go" data-view="notes">${ICON.mail}<span>${unread} 张新纸条</span></button>` : ''}
        <div class="mxj-scene-hint">${petSvg ? '点家具或小家伙可以互动' : '点家具可以互动'}</div>
      </div>
      <div class="mxj-row"><button type="button" class="mxj-btn mxj-grow" data-act="go" data-view="art">绘制人物、房间与家具</button></div>
      ${getSettings().visitMode === 'manual' && !away ? '<p class="mxj-muted">当前为手动回家模式；他已在家。下次离家后可点击「等他回家」。</p>' : ''}
      <details class="mxj-expand"${state.expandOpen ? ' open' : ''}><summary>扩建与搬家 · 房间模块</summary>
        <p class="mxj-muted">只增加房间数据，不会生成新房屋图片。原有家具、记录和装修保留。</p>
        <div class="mxj-chips is-wrap">${HOUSE_SIZES.filter(z=>z.maxRooms>HOUSE_SIZES.find(h=>h.id===house.size).maxRooms).map(z=>`<button type="button" class="mxj-chip" data-act="upgrade" data-id="${z.id}">搬到${esc(z.name)}</button>`).join('')}</div>
        <p class="mxj-muted">当前 ${house.rooms.length} / ${HOUSE_SIZES.find(h=>h.id===house.size)?.maxRooms||8} 个模块 · 删除房间前会确认，家具移入仓库</p>
        <div class="mxj-chips is-wrap">${house.rooms.length>1?house.rooms.map(r=>`<button type="button" class="mxj-chip" data-act="remove-room" data-id="${esc(r.id)}">移除${esc(r.name)}</button>`).join(''):''}</div>
        <div class="mxj-chips is-wrap">${Object.entries(ROOM_MODULES).map(([id,label])=>`<button type="button" class="mxj-chip" data-act="add-room" data-id="${id}">＋${esc(label)}</button>`).join('')}</div>
        <label class="mxj-field"><span>补充房间（例如：三个卧室、一个阳光房）</span><input class="mxj-input" data-field="roomExtra" placeholder="描述想增加的房间" value="${esc(state.roomExtra||'')}"></label>
        <button type="button" class="mxj-btn" data-act="add-room-text">按描述添加房间</button>
      </details>
      ${home.v >= 2 && !room.art?.path ? '<p class="mxj-muted">当前为布局草图。到绘制页生成并保存房间背景和家具，房间里就会换成所选画风的图片。</p>' : ''}
      ${state.selectedPet ? app.renderView('petcard', char, home) || eventCard(char, home, away) : state.selectedFurniture ? furnitureCard(home, away) : eventCard(char, home, away)}
      <nav class="mxj-entries" aria-label="小屋功能">
        <button type="button" class="mxj-entry" data-act="decorate">${ICON.sofa}<span>布置</span></button>
        <button type="button" class="mxj-entry" data-act="go" data-view="notes">${ICON.note}<span>小纸条</span>${unread ? `<i class="mxj-badge">${unread}</i>` : ''}</button>
        <button type="button" class="mxj-entry" data-act="go" data-view="diary">${ICON.diary}<span>交换日记</span>${diaryBadge ? `<i class="mxj-badge">${diaryBadge}</i>` : ''}</button>
        <button type="button" class="mxj-entry" data-act="go" data-view="pets">${ICON.paw}<span>小家伙们</span>${petNeeds ? `<i class="mxj-badge">${petNeeds}</i>` : ''}</button>
        <button type="button" class="mxj-entry" data-act="go" data-view="log">${ICON.log}<span>回家记录</span></button>
        <button type="button" class="mxj-entry" data-act="go" data-view="build">${ICON.house}<span>房子档案</span></button>
      </nav>`;
}

function eventCard(char, home, away) {
    const name = characterView(char).name;
    if (away) {
        return `<section class="mxj-card">
          <p class="mxj-event">家里静悄悄的，${esc(name)}还没回来。</p>
          <div class="mxj-row"><button type="button" class="mxj-btn is-primary mxj-grow" data-act="visit">等他回家</button></div>
        </section>`;
    }
    const visit = home.visits?.[home.visits.length - 1];
    if (!visit) {
        return `<section class="mxj-card">
          <p class="mxj-event">新家刚布置好，${esc(name)}还没回来过。</p>
          <div class="mxj-row"><button type="button" class="mxj-btn is-primary mxj-grow" data-act="visit">等他回家</button></div>
        </section>`;
    }
    const url = avatarUrl(char);
    const turns = (visit.turns || []).slice(-4).map(t => `
        <div class="mxj-turn is-user">${esc(t.user)}</div>
        <div class="mxj-turn">${esc(t.reply)}</div>`).join('');
    let options = (visit.options || []).map(o => `<button type="button" class="mxj-btn" data-act="option" data-text="${esc(o)}">${esc(o)}</button>`).join('');
    if (state.newLayout) options = `<button type="button" class="mxj-btn is-primary" data-act="show-layout">叫他来看看新布置</button>${options}`;
    return `<section class="mxj-card">
      <div class="mxj-event-head">
        <span class="mxj-avatar">${url ? `<img src="${esc(url)}" alt="">` : esc(name.slice(0, 1))}</span>
        <p class="mxj-event">${esc(visit.event)}</p>
      </div>
      ${turns ? `<div class="mxj-turns">${turns}</div>` : ''}
      ${options ? `<div class="mxj-options">${options}</div>` : ''}
      <form class="mxj-say" data-form="say">
        <label class="mxj-sr" for="mxj-say-input">自己写一句</label>
        <input id="mxj-say-input" type="text" class="mxj-input" placeholder="做点什么，或者对他说…" autocomplete="off" enterkeyhint="send">
        <button type="submit" class="mxj-icon-btn is-solid" aria-label="发送">${ICON.pen}</button>
      </form>
    </section>`;
}

function furnitureCard(home, away) {
    const f = home.house.furniture.find(x => x.id === state.selectedFurniture);
    if (!f) {
        state.selectedFurniture = '';
        return '';
    }
    const who = f.by === 'user' ? '你放的' : (f.by === 'char' ? '他放的' : '搬进来时就有');
    return `<section class="mxj-card">
      <div class="mxj-row mxj-between">
        <div><b>${esc(f.name)}</b><div class="mxj-muted">${f.name === CATALOG[f.type]?.label ? '' : `${esc(CATALOG[f.type]?.label || '')} · `}${who}</div></div>
        <button type="button" class="mxj-link-btn" data-act="unselect">收起</button>
      </div>
      ${away ? '<p class="mxj-muted">他不在家。等他回来再一起用吧。</p>' : `
      <div class="mxj-options">
        <button type="button" class="mxj-btn" data-act="furniture-act" data-text="叫他到${esc(f.name)}这边来">叫他过来</button>
        <button type="button" class="mxj-btn" data-act="furniture-act" data-text="坐到${esc(f.name)}旁边，陪着他">在这儿陪他</button>
      </div>
      <form class="mxj-say" data-form="furniture-say">
        <label class="mxj-sr" for="mxj-furniture-input">在${esc(f.name)}旁边做点什么</label>
        <input id="mxj-furniture-input" type="text" class="mxj-input" placeholder="在${esc(f.name)}旁边做点什么…" autocomplete="off" enterkeyhint="send">
        <button type="submit" class="mxj-icon-btn is-solid" aria-label="发送">${ICON.pen}</button>
      </form>`}
    </section>`;
}

function viewLog(char, home) {
    if (!home) return viewNoChar();
    const visits = (home.visits || []).slice().reverse();
    if (!visits.length) return '<section class="mxj-card mxj-empty"><p>他还没回过家。</p></section>';
    return visits.map(v => `<section class="mxj-card">
        <div class="mxj-muted">${esc(formatTime(v.at))}${v.activity ? ` · ${esc(v.activity)}` : ''}${v.mood ? ` · ${esc(v.mood)}` : ''}</div>
        <p class="mxj-event">${esc(v.event)}</p>
        ${(v.turns || []).map(t => `<div class="mxj-turn is-user">${esc(t.user)}</div><div class="mxj-turn">${esc(t.reply)}</div>`).join('')}
      </section>`).join('');
}

async function doVisit() {
    const char = currentCharacter();
    if (!char) return;
    const name = characterView(char).name;
    await run(`${name}正在回家的路上…`, signal => comeHome(char, { signal }));
    const h = getHome(char);
    if (h && h.changesSeenAt >= Date.now() - 60000) state.newLayout = '';
}

async function doRespond(text, furnitureId = '') {
    const char = currentCharacter();
    const action = String(text || '').trim();
    if (!char || !action) return;
    state.selectedFurniture = '';
    await run('他在想怎么回应…', signal => respond(char, action, { signal, furnitureId }));
}
