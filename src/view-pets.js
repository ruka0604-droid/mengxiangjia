// 梦想家 · 界面 · 小家伙们（照顾、领养、种一盆、成长记录）和小屋里点中它时的那张卡
import { esc, formatTime, daysSince } from './util.js?mxj=0.7.0';
import { characterView } from './character.js?mxj=0.7.0';
import { getHome, getSettings, currentCharacter, characterKey } from './settings.js?mxj=0.7.0';
import { isAway } from './home-visit.js?mxj=0.7.0';
import { imageConfigProblems } from './imageApi.js?mxj=0.7.0';
import {
    getPets, findPet, adoptAnimal, plantNew, careAnimal, moveAnimal, removePet,
    waterPlant, fertilizePlant, writeStageNote, drawCustomPet, drawPetImage,
} from './home-pets.js?mxj=0.7.0';
import {
    MAX_ANIMALS, MAX_PLANTS, CAT_COATS, DOG_COATS, PLANT_KINDS, STAGE_POINTS,
    animalStatus, animalRoom, animalPose, animalLabel, genderLabel,
    plantStatus, nextStageHint, todayTasks, dayKey,
} from './pets-data.js?mxj=0.7.0';
import { animalIcon, plantIcon, plantStageIcon } from './pet-art.js?mxj=0.7.0';

let app = null;
let state = null;
const render = () => app.render();
const run = (label, task) => app.run(label, task);
const flash = text => app.flash(text);

function ui() {
    state.pets ||= {};
    const p = state.pets;
    p.tab ||= 'animal';
    p.adopt ||= { mode: 'template', kind: 'cat', coat: 'orange', name: '', gender: 'girl', room: '', desc: '', habit: 'cat', draft: null };
    p.plantNew ||= { kind: 'mint', name: '', room: '' };
    return p;
}

export function setup(a) {
    app = a;
    state = a.state;
    return {
        views: { pets: viewPets, 'pet-adopt': viewAdopt, 'plant-new': viewPlantNew, plant: viewPlant, petcard: petCardForHome },
        parents: { 'pet-adopt': 'pets', 'plant-new': 'pets', plant: 'pets' },
        titles: {
            pets: (char, home) => {
                const p = getPets(home);
                return ['小家伙们', `${p.animals.length} 只小动物 · ${p.plants.length} 盆植物`];
            },
            'pet-adopt': () => ['领养一只', '挑好样子，起个名字'],
            'plant-new': () => ['种一盆', '挑一种，放在家里哪儿'],
            plant: (char, home) => {
                const p = getPets(home).plants.find(x => x.id === ui().plantId);
                return p ? [p.name, plantStatus(p).stageName] : ['成长记录', ''];
            },
        },
        actions: {
            pet(el) { selectInHome(el.dataset.id); },
            plant(el) { selectInHome(el.dataset.id); },
            'pet-unselect'() { state.selectedPet = ''; state.keepScroll = true; render(); },
            'pet-tab'(el) { ui().tab = el.dataset.id === 'plant' ? 'plant' : 'animal'; state.keepScroll = true; render(); },
            'pet-care'(el, char) { doCare(char, el.dataset.id, el.dataset.care); },
            'pet-move'(el, char) {
                if (!char || state.busy) return;
                const a = moveAnimal(char, el.dataset.id, el.dataset.room);
                const room = getHome(char).house.rooms.find(r => r.id === a.room)?.name || '';
                state.keepScroll = true; render(); flash(`把${a.name}抱到${room}了，过一会儿它又会自己溜达`);
            },
            'pet-remove'(el, char) {
                if (!char || state.busy) return;
                const pet = findPet(getHome(char), el.dataset.id);
                if (!pet) return;
                void app.askConfirm(`不养${pet.name}了？它会从家里离开，以前的纸条还留着。`, { yes: '不养了', danger: true }).then(ok => {
                    if (!ok || characterKey(currentCharacter()) !== characterKey(char)) return;
                    removePet(char, pet.id);
                    if (state.selectedPet === pet.id) state.selectedPet = '';
                    if (state.view === 'plant') app.go('pets'); else { state.keepScroll = true; render(); }
                    flash(`${pet.name}离开了`);
                });
            },
            'plant-open'(el) { ui().plantId = el.dataset.id; state.selectedPet = ''; app.go('plant'); },
            // 领养
            'adopt-mode'(el) { ui().adopt.mode = el.dataset.id === 'custom' ? 'custom' : 'template'; state.keepScroll = true; render(); },
            'adopt-kind'(el) {
                const ad = ui().adopt;
                ad.kind = el.dataset.id === 'dog' ? 'dog' : 'cat';
                ad.coat = Object.keys(ad.kind === 'dog' ? DOG_COATS : CAT_COATS)[0];
                state.keepScroll = true; render();
            },
            'adopt-coat'(el) { ui().adopt.coat = el.dataset.id; state.keepScroll = true; render(); },
            'adopt-gender'(el) { ui().adopt.gender = el.dataset.id === 'boy' ? 'boy' : 'girl'; state.keepScroll = true; render(); },
            'adopt-habit'(el) { ui().adopt.habit = el.dataset.id === 'dog' ? 'dog' : 'cat'; state.keepScroll = true; render(); },
            'adopt-room'(el) { ui().adopt.room = el.dataset.id; state.keepScroll = true; render(); },
            'adopt-draw'(el, char) {
                if (!char || state.busy) return;
                const ad = ui().adopt;
                ad.desc = app.root()?.querySelector('[data-field="adoptDesc"]')?.value ?? ad.desc;
                void run('照你说的画一只…', async signal => {
                    const draft = await drawCustomPet(char, ad.desc, { signal });
                    if (!signal.aborted && characterKey(currentCharacter()) === characterKey(char)) ad.draft = { ...draft, owner: characterKey(char), useRaw: false };
                });
            },
            'adopt-redraw'(el, char) {
                const ad = ui().adopt;
                if (!char || state.busy || !ad.draft) return;
                void run('再画一张…', async signal => {
                    const img = await drawPetImage(ad.draft.prompt, ad.draft.theme, { signal });
                    if (!signal.aborted && ad.draft) ad.draft = { ...ad.draft, ...img, useRaw: false };
                });
            },
            'adopt-raw'() {
                const d = ui().adopt.draft;
                if (d) { d.useRaw = !d.useRaw; state.keepScroll = true; render(); }
            },
            'adopt-confirm'(el, char) {
                if (!char || state.busy) return;
                const ad = ui().adopt;
                ad.name = app.root()?.querySelector('[data-field="adoptName"]')?.value ?? ad.name;
                const custom = ad.mode === 'custom';
                if (custom && !ad.draft?.dataUrl) { state.error = '先画出来，满意了再领养'; state.keepScroll = true; render(); return; }
                const opts = custom
                    ? { kind: 'custom', habit: ad.habit, species: ad.draft.species, desc: ad.desc, prompt: ad.draft.prompt, dataUrl: ad.draft.useRaw ? ad.draft.rawDataUrl : ad.draft.dataUrl, name: ad.name, gender: ad.gender, room: ad.room }
                    : { kind: ad.kind, coat: ad.coat, name: ad.name, gender: ad.gender, room: ad.room };
                let animal = null;
                void run(custom ? '把它接回家…' : '领养中…', async signal => {
                    animal = await adoptAnimal(char, opts, { signal });
                }).then(() => {
                    if (!animal) return;
                    state.pets.adopt = null;
                    ui().tab = 'animal';
                    app.go('pets');
                    flash(`${animal.name}到家了`);
                });
            },
            // 种一盆
            'pnew-kind'(el) { ui().plantNew.kind = el.dataset.id; state.keepScroll = true; render(); },
            'pnew-room'(el) { ui().plantNew.room = el.dataset.id; state.keepScroll = true; render(); },
            'pnew-confirm'(el, char) {
                if (!char || state.busy) return;
                const pn = ui().plantNew;
                pn.name = app.root()?.querySelector('[data-field="pnewName"]')?.value ?? pn.name;
                try {
                    const plant = plantNew(char, pn);
                    state.pets.plantNew = null;
                    ui().tab = 'plant';
                    app.go('pets');
                    flash(`种下${plant.name}了，记得每天浇水`);
                } catch (error) {
                    state.error = error?.message || String(error); state.keepScroll = true; render();
                }
            },
        },
        fields: {
            adoptName(value) { ui().adopt.name = value; },
            adoptDesc(value) { ui().adopt.desc = value; },
            pnewName(value) { ui().plantNew.name = value; },
        },
        inputs: {
            adoptName(el) { ui().adopt.name = el.value; },
            adoptDesc(el) { ui().adopt.desc = el.value; },
            pnewName(el) { ui().plantNew.name = el.value; },
        },
        enter: {
            'pet-adopt'(char, home) {
                const ad = ui().adopt;
                if (ad.draft && ad.draft.owner !== characterKey(char)) ad.draft = null;
                if (!home?.house?.rooms.some(r => r.id === ad.room)) ad.room = home?.house?.rooms[0]?.id || '';
            },
            'plant-new'(char, home) {
                const pn = ui().plantNew;
                if (!home?.house?.rooms.some(r => r.id === pn.room)) {
                    const balcony = home?.house?.rooms.find(r => /阳台|露台|花园|院/.test(r.name));
                    pn.room = (balcony || home?.house?.rooms[0])?.id || '';
                }
            },
        },
    };
}

function selectInHome(id) {
    state.selectedPet = state.selectedPet === id ? '' : id;
    state.selectedFurniture = '';
    state.keepScroll = true;
    render();
}

function doCare(char, id, care) {
    if (!char || state.busy || !id) return;
    const name = characterView(char).name;
    try {
        if (['feed', 'water', 'walk', 'walk-char'].includes(care)) {
            const msg = careAnimal(char, id, care === 'walk-char' ? 'walk' : care, { by: care === 'walk-char' ? 'char' : 'user', charName: name });
            state.keepScroll = true;
            render();
            flash(msg);
            return;
        }
        const res = care === 'fert' ? fertilizePlant(char, id) : waterPlant(char, id);
        state.keepScroll = true;
        render();
        flash(res.msg);
        if (res.stageUp !== null) {
            const plant = getPets(getHome(char)).plants.find(x => x.id === id);
            const stageName = PLANT_KINDS[plant.kind].stages[res.stageUp];
            void run(`${plant.name}${stageName}！${name}看到了，在写纸条…`, signal => writeStageNote(char, id, res.stageUp, { signal }))
                .then(() => { if (!state.error) flash(`${plant.name}${stageName}，${name}留了一张纸条`); });
        }
    } catch (error) {
        state.error = error?.message || String(error);
        state.keepScroll = true;
        render();
    }
}

// ---------------- 小零件 ----------------

function meter(label, value, low) {
    const cells = Array.from({ length: 5 }, (_, i) => `<i class="${i < value ? (value <= 2 ? 'is-low' : 'is-on') : ''}"></i>`).join('');
    return `<span>${label}</span><span class="mxj-meter-row"><span class="mxj-meter" role="img" aria-label="${label} ${value} / 5">${cells}</span>${value <= 1 ? `<b class="mxj-warn">${low}</b>` : ''}</span>`;
}

function roomName(home, id) {
    return home.house.rooms.find(r => r.id === id)?.name || '家里';
}

function petPic(a, size, pose) {
    if (a.kind === 'custom' && a.art?.path) return `<img src="${esc(a.art.path)}" alt="${esc(a.name)}" width="${size}" height="${size}">`;
    return animalIcon(a, { size, pose });
}

function chips(list, act, current, extra = '') {
    return `<div class="mxj-chips is-wrap">${list.map(([id, label]) => `<button type="button" class="mxj-chip${id === current ? ' is-on' : ''}" data-act="${act}" data-id="${esc(id)}" aria-pressed="${id === current}"${extra}>${esc(label)}</button>`).join('')}</div>`;
}

function animalButtons(a, home, st) {
    const away = isAway(home);
    const busy = state.busy ? ' disabled' : '';
    const b = (care, text, primary, disabled) => `<button type="button" class="mxj-btn${primary ? ' is-primary' : ''}" data-act="pet-care" data-id="${esc(a.id)}" data-care="${care}"${disabled ? ' disabled' : busy}>${text}</button>`;
    let out = b('feed', st.fedToday ? '今天喂过了' : '喂食', !st.fedToday && st.full <= 2, st.fedToday);
    out += b('water', st.waterToday ? '今天换过水' : '换水', !st.waterToday && st.water <= 2, st.waterToday);
    if (st.needsWalk) {
        if (st.walkedToday) out += b('walk', '今天遛过了', false, true);
        else out += b('walk', '我去遛', false, false) + b('walk-char', away ? '他不在家' : '让他去遛', false, away);
    }
    return `<div class="mxj-pet-actions">${out}</div>`;
}

function animalCard(a, home, { compact = false } = {}) {
    const st = animalStatus(a);
    const { pose, activity } = animalPose(a);
    const where = roomName(home, animalRoom(a, home.house.rooms));
    const walkText = st.walkedToday ? (a.walkedBy === 'char' ? '他今天遛过了' : '今天遛过了') : '今天还没出门';
    const more = compact ? '' : `<details class="mxj-pet-more"><summary>抱到别的房间 · 不养了</summary>
        <div class="mxj-chips is-wrap">${home.house.rooms.map(r => `<button type="button" class="mxj-chip" data-act="pet-move" data-id="${esc(a.id)}" data-room="${esc(r.id)}">${esc(r.name)}</button>`).join('')}</div>
        <button type="button" class="mxj-link-btn" data-act="pet-remove" data-id="${esc(a.id)}">不养${esc(a.name)}了</button>
      </details>`;
    return `<section class="mxj-card mxj-pet-card">
      <div class="mxj-pet-head">
        <div class="mxj-pet-pic">${petPic(a, 84, pose)}</div>
        <div class="mxj-grow">
          <div class="mxj-pet-name"><b>${esc(a.name)}</b><span class="mxj-tag">${esc(genderLabel(a))}</span><span class="mxj-tag">${esc(animalLabel(a))}</span></div>
          <div class="mxj-muted">在${esc(where)} · ${esc(activity)}</div>
          <div class="mxj-meters">${meter('饱腹', st.full, '饿了')}${meter('喝水', st.water, '渴了')}${st.needsWalk ? `<span>散步</span><span class="${st.walkedToday ? '' : 'mxj-warn'}">${walkText}</span>` : ''}</div>
        </div>
      </div>
      ${animalButtons(a, home, st)}
      ${a.mischief ? `<div class="mxj-muted">最近捣蛋：${esc(a.mischief.text)} · ${esc(formatTime(a.mischief.at))}</div>` : ''}
      ${more}
    </section>`;
}

function plantButtons(p, st) {
    const busy = state.busy ? ' disabled' : '';
    const water = `<button type="button" class="mxj-btn${!st.wateredToday && !st.trouble ? ' is-primary' : ''}" data-act="pet-care" data-id="${esc(p.id)}" data-care="pwater"${busy}>${st.wateredToday ? '再浇一点' : '浇水'}</button>`;
    const fertText = st.trouble ? '先等它缓过来' : st.fertDue ? '施肥' : `${st.fertInDays} 天后能施肥`;
    const fert = `<button type="button" class="mxj-btn${st.fertDue && !st.trouble ? ' is-primary' : ''}" data-act="pet-care" data-id="${esc(p.id)}" data-care="fert"${st.fertDue && !st.trouble ? busy : ' disabled'}>${fertText}</button>`;
    return `<div class="mxj-pet-actions">${water}${fert}</div>`;
}

function plantLine(p, st) {
    if (st.trouble) return `<div class="mxj-warn">${esc(st.troubleText)}${st.trouble === 'soggy' ? '，这几天先别浇' : '，快浇点水'}</div>`;
    if (st.thirsty) return '<div class="mxj-warn">土有点干了</div>';
    return `<div class="mxj-muted">${esc(nextStageHint(p))}</div>`;
}

function plantCard(p, home, { compact = false } = {}) {
    const st = plantStatus(p);
    return `<section class="mxj-card mxj-pet-card">
      <div class="mxj-pet-head">
        <div class="mxj-pet-pic is-plant">${plantIcon(p, { size: 46 })}</div>
        <div class="mxj-grow">
          <div class="mxj-pet-name"><b>${esc(p.name)}</b><span class="mxj-tag">${esc(st.kind.label)}</span><span class="mxj-tag is-stage">${esc(st.stageName)}</span></div>
          <div class="mxj-muted">在${esc(roomName(home, p.room))} · 第 ${daysSince(p.plantedAt)} 天${st.wateredToday ? ' · 今天浇过了' : ''}</div>
          ${plantLine(p, st)}
        </div>
      </div>
      ${plantButtons(p, st)}
      <button type="button" class="mxj-link-btn" data-act="plant-open" data-id="${esc(p.id)}">看成长记录${compact ? '' : '和他的纸条'}</button>
    </section>`;
}

// ---------------- 小家伙们 ----------------

function viewPets(char, home) {
    if (!home?.house) return app.renderView('build', char, home);
    const p = ui();
    const pets = getPets(home);
    const tasks = todayTasks(pets);
    const pending = tasks.filter(x => !x.done).length;
    const busy = state.busy ? ' disabled' : '';
    const today = tasks.length ? `<section class="mxj-card">
        <div class="mxj-row mxj-between"><h3>今天要做的</h3><span class="mxj-muted">${pending ? `还剩 ${pending} 件` : '都做完了'}</span></div>
        <div class="mxj-tasks">${tasks.map(t => t.done
            ? `<span class="mxj-task is-done">${esc(t.label)}</span>`
            : `<button type="button" class="mxj-task" data-act="pet-care" data-id="${esc(t.id)}" data-care="${t.act === 'pwater' ? 'pwater' : t.act}"${busy}>${esc(t.label)}</button>`).join('')}</div>
      </section>` : '';
    const tabs = `<div class="mxj-pet-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="${p.tab === 'animal'}" class="mxj-chip${p.tab === 'animal' ? ' is-on' : ''}" data-act="pet-tab" data-id="animal">动物 · ${pets.animals.length}</button>
        <button type="button" role="tab" aria-selected="${p.tab === 'plant'}" class="mxj-chip${p.tab === 'plant' ? ' is-on' : ''}" data-act="pet-tab" data-id="plant">植物 · ${pets.plants.length}</button>
      </div>`;
    let body;
    if (p.tab === 'animal') {
        body = pets.animals.map(a => animalCard(a, home)).join('')
            || '<section class="mxj-card mxj-empty"><p>家里还没有小动物。领养一只吧，它会在各个房间溜达，偶尔还会捣蛋。</p></section>';
        body += pets.animals.length < MAX_ANIMALS
            ? '<button type="button" class="mxj-btn mxj-add-btn" data-act="go" data-view="pet-adopt">领养一只</button>'
            : `<p class="mxj-muted mxj-center">最多养 ${MAX_ANIMALS} 只小动物</p>`;
    } else {
        body = pets.plants.map(x => plantCard(x, home)).join('')
            || '<section class="mxj-card mxj-empty"><p>家里还没有植物。种一盆吧，每天浇水，隔几天施肥，长到新的样子时他会留纸条。</p></section>';
        body += pets.plants.length < MAX_PLANTS
            ? '<button type="button" class="mxj-btn mxj-add-btn" data-act="go" data-view="plant-new">种一盆</button>'
            : `<p class="mxj-muted mxj-center">最多养 ${MAX_PLANTS} 盆植物</p>`;
    }
    return `${tabs}${today}${body}`;
}

// 小屋里点中一只或一盆时，房间下面那张卡
function petCardForHome(char, home) {
    const pet = findPet(home, state.selectedPet);
    if (!pet) { state.selectedPet = ''; return ''; }
    const isPlant = getPets(home).plants.includes(pet);
    const card = isPlant ? plantCard(pet, home, { compact: true }) : animalCard(pet, home, { compact: true });
    return card.replace('<section class="mxj-card mxj-pet-card">', `<section class="mxj-card mxj-pet-card"><div class="mxj-row mxj-between"><button type="button" class="mxj-link-btn" data-act="go" data-view="pets">去小家伙们</button><button type="button" class="mxj-link-btn" data-act="pet-unselect">收起</button></div>`);
}

// ---------------- 领养 ----------------

function swatch(coat) {
    if (coat.patches?.length) {
        const cols = [coat.base, ...coat.patches];
        return `<span class="mxj-coat-dot">${cols.map(c => `<i style="background:${c}"></i>`).join('')}</span>`;
    }
    return `<span class="mxj-coat-dot"><i style="background:${coat.base}"></i></span>`;
}

function viewAdopt(char, home) {
    if (!home?.house) return app.renderView('build', char, home);
    const pets = getPets(home);
    if (pets.animals.length >= MAX_ANIMALS) {
        return `<section class="mxj-card mxj-empty"><p>家里已经有 ${MAX_ANIMALS} 只小动物了，再多就挤不下了。</p><button type="button" class="mxj-btn" data-act="go" data-view="pets">回小家伙们</button></section>`;
    }
    const ad = ui().adopt;
    const busy = state.busy ? ' disabled' : '';
    const modeTabs = `<div class="mxj-pet-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="${ad.mode === 'template'}" class="mxj-chip${ad.mode === 'template' ? ' is-on' : ''}" data-act="adopt-mode" data-id="template">从模板挑</button>
        <button type="button" role="tab" aria-selected="${ad.mode === 'custom'}" class="mxj-chip${ad.mode === 'custom' ? ' is-on' : ''}" data-act="adopt-mode" data-id="custom">照我说的画</button>
      </div>`;
    const nameGender = (preview) => `<section class="mxj-card mxj-adopt-who">
        <div class="mxj-adopt-preview">${preview}</div>
        <div class="mxj-grow mxj-stack">
          <label class="mxj-field"><span>名字</span><input class="mxj-input" type="text" data-field="adoptName" value="${esc(ad.name)}" placeholder="${ad.mode === 'custom' ? '给它起个名字' : (ad.kind === 'dog' ? '豆包' : '团子')}" maxlength="8" autocomplete="off"></label>
          ${chips([['girl', '女孩'], ['boy', '男孩']], 'adopt-gender', ad.gender)}
        </div>
      </section>`;
    const roomPick = `<section class="mxj-card"><h3>先放在哪个房间</h3>${chips(home.house.rooms.map(r => [r.id, r.name]), 'adopt-room', ad.room)}
        <p class="mxj-muted">之后它会自己在房间之间溜达，下次打开小屋时可能在任何一间。</p></section>`;
    if (ad.mode === 'template') {
        const coats = ad.kind === 'dog' ? DOG_COATS : CAT_COATS;
        const sample = { kind: ad.kind, coat: ad.coat, name: ad.name };
        return `${modeTabs}
          <section class="mxj-card"><h3>猫还是狗</h3>
            <div class="mxj-two">
              <button type="button" class="mxj-pick${ad.kind === 'cat' ? ' is-on' : ''}" data-act="adopt-kind" data-id="cat" aria-pressed="${ad.kind === 'cat'}">${animalIcon({ kind: 'cat', coat: 'gray', name: '猫' }, { size: 64 })}<span>猫</span></button>
              <button type="button" class="mxj-pick${ad.kind === 'dog' ? ' is-on' : ''}" data-act="adopt-kind" data-id="dog" aria-pressed="${ad.kind === 'dog'}">${animalIcon({ kind: 'dog', coat: 'shiba', name: '狗' }, { size: 64 })}<span>狗</span></button>
            </div>
            <p class="mxj-muted">${ad.kind === 'dog' ? '狗每天要喂食、换水、遛一次。' : '猫每天喂食、换水就行，不用遛。'}</p>
          </section>
          <section class="mxj-card"><h3>毛色</h3>
            <div class="mxj-coats">${Object.entries(coats).map(([id, c]) => `<button type="button" class="mxj-coat${id === ad.coat ? ' is-on' : ''}" data-act="adopt-coat" data-id="${id}" aria-pressed="${id === ad.coat}">${swatch(c)}<span>${esc(c.label)}</span></button>`).join('')}</div>
          </section>
          ${nameGender(animalIcon(sample, { size: 112 }))}
          ${roomPick}
          <button type="button" class="mxj-btn is-primary mxj-wide" data-act="adopt-confirm"${busy}>领养${esc(ad.name || (ad.kind === 'dog' ? '豆包' : '团子'))}</button>`;
    }
    const blocking = imageConfigProblems(getSettings()).filter(p => !p.includes('自动按结构化描述'));
    const d = ad.draft;
    const shown = d ? (d.useRaw ? d.rawDataUrl : d.dataUrl) : '';
    const preview = d ? `<img class="mxj-art-preview" src="${esc(shown)}" alt="画出来的样子">` : '<div class="mxj-art-wait">还没画</div>';
    return `${modeTabs}
      ${blocking.length ? `<section class="mxj-card"><p class="mxj-warn">要先配好生图连接：${esc(blocking.join('；'))}</p><button type="button" class="mxj-btn" data-act="settings" data-group="image">去配置生图连接</button></section>` : ''}
      <section class="mxj-card">
        <label class="mxj-field"><span>想要什么样的小家伙</span><textarea class="mxj-input" rows="3" data-field="adoptDesc" placeholder="比如：一只黑色的小狐狸，尾巴尖是白的，金色眼睛，脖子上系着红色的铃铛">${esc(ad.desc)}</textarea></label>
        <p class="mxj-muted">先整理成画面描述再画：用一次文字接口和一张图的额度。「再画一张」只花一张图。</p>
        <div class="mxj-row">
          <button type="button" class="mxj-btn${d ? '' : ' is-primary'} mxj-grow" data-act="adopt-draw"${blocking.length ? ' disabled' : busy}>${d ? '按新描述画' : '画出来'}</button>
          ${d ? `<button type="button" class="mxj-btn mxj-grow" data-act="adopt-redraw"${busy}>再画一张</button>` : ''}
        </div>
      </section>
      ${nameGender(preview)}
      ${d && d.cutout ? `<div class="mxj-row"><button type="button" class="mxj-btn mxj-grow" data-act="adopt-raw"${busy}>${d.useRaw ? '去掉背景' : '用原图'}</button></div>` : ''}
      <section class="mxj-card"><h3>它的习性像</h3>
        ${chips([['cat', '像猫 · 不用遛'], ['dog', '像狗 · 每天要遛']], 'adopt-habit', ad.habit)}
      </section>
      ${roomPick}
      <button type="button" class="mxj-btn is-primary mxj-wide" data-act="adopt-confirm"${d ? busy : ' disabled'}>${d ? `领养${esc(ad.name || (d.species || '它'))}` : '画好了才能领养'}</button>`;
}

// ---------------- 种一盆 ----------------

function viewPlantNew(char, home) {
    if (!home?.house) return app.renderView('build', char, home);
    if (getPets(home).plants.length >= MAX_PLANTS) {
        return `<section class="mxj-card mxj-empty"><p>家里已经有 ${MAX_PLANTS} 盆植物了。</p><button type="button" class="mxj-btn" data-act="go" data-view="pets">回小家伙们</button></section>`;
    }
    const pn = ui().plantNew;
    const kind = PLANT_KINDS[pn.kind] || PLANT_KINDS.mint;
    const days = Math.round(STAGE_POINTS[STAGE_POINTS.length - 1] / (1 + 2 / kind.fert));
    const grid = Object.entries(PLANT_KINDS).map(([id, k]) => `<button type="button" class="mxj-pick is-plant${id === pn.kind ? ' is-on' : ''}" data-act="pnew-kind" data-id="${id}" aria-pressed="${id === pn.kind}">${plantStageIcon({ kind: id, name: k.label, plantedAt: Date.now() }, 3, { size: 30 })}<span>${esc(k.label)}</span><small>${esc(k.trait)}</small></button>`).join('');
    return `<section class="mxj-card"><div class="mxj-plant-grid">${grid}</div></section>
      <section class="mxj-card"><h3>${esc(kind.label)}要这样照顾</h3>
        <div class="mxj-facts"><div><b>每天</b><span>浇一次水</span></div><div><b>${kind.fert} 天</b><span>施一次肥</span></div><div><b>约 ${days} 天</b><span>${esc(kind.stages[kind.stages.length - 1])}</span></div></div>
        <p class="mxj-muted">每长大一个阶段，他会留一张纸条。连着几天忘了浇水，或者一天浇好几次，它会蔫掉，他也会写；照顾回来就好。</p>
      </section>
      <section class="mxj-card"><h3>放在哪</h3>${chips(home.house.rooms.map(r => [r.id, r.name]), 'pnew-room', pn.room)}
        <label class="mxj-field"><span>起个名字（可以不起）</span><input class="mxj-input" type="text" data-field="pnewName" value="${esc(pn.name)}" placeholder="${esc(kind.label)}" maxlength="8" autocomplete="off"></label>
      </section>
      <button type="button" class="mxj-btn is-primary mxj-wide" data-act="pnew-confirm"${state.busy ? ' disabled' : ''}>种下${esc(pn.name || kind.label)}</button>`;
}

// ---------------- 成长记录 ----------------

function viewPlant(char, home) {
    if (!home?.house) return app.renderView('build', char, home);
    const p = getPets(home).plants.find(x => x.id === ui().plantId);
    if (!p) return viewPets(char, home);
    const st = plantStatus(p);
    const notes = home.notes || [];
    const timeline = st.kind.stages.map((name, i) => {
        const reached = i <= st.stage;
        const at = p.stageAt?.[i];
        const note = notes.find(n => n.id === p.stageNotes?.[i]);
        const cls = i === st.stage ? ' is-now' : reached ? ' is-done' : '';
        return `<li class="mxj-stage${cls}">
          <span class="mxj-stage-dot" aria-hidden="true"></span>
          <div class="mxj-grow">
            <div class="mxj-stage-head">${plantStageIcon(p, i, { size: 20 })}<b>${esc(name)}</b>${reached && at ? `<span class="mxj-muted">${esc(formatTime(at))}</span>` : ''}</div>
            ${note ? `<blockquote class="mxj-stage-note">${esc(note.text)}<span>—— ${esc(characterView(char).name)}</span></blockquote>` : ''}
            ${i === st.stage + 1 ? `<div class="mxj-muted">${esc(nextStageHint(p))}</div>` : ''}
          </div>
        </li>`;
    }).join('');
    // 这一周每天浇了几次
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const key = dayKey(d.getTime());
        const n = (p.waters || []).filter(w => dayKey(w) === key).length;
        days.push(`<div class="mxj-day${n > 1 ? ' is-much' : ''}${i === 0 ? ' is-today' : ''}"><span>${i === 0 ? '今天' : '日一二三四五六'[d.getDay()]}</span><span class="mxj-drops">${'<i></i>'.repeat(Math.min(n, 3))}</span></div>`);
    }
    const trouble = (home.notes || []).filter(n => n.about?.id === p.id && n.about.stage === undefined).slice(-2);
    return `<section class="mxj-card mxj-pet-card">
        <div class="mxj-pet-head">
          <div class="mxj-pet-pic is-plant is-big">${plantIcon(p, { size: 70 })}</div>
          <div class="mxj-grow">
            <div class="mxj-pet-name"><b>${esc(p.name)}</b><span class="mxj-tag is-stage">${esc(st.stageName)}</span></div>
            <div class="mxj-muted">${esc(st.kind.label)} · 在${esc(roomName(home, p.room))} · 第 ${daysSince(p.plantedAt)} 天</div>
            ${plantLine(p, st)}
          </div>
        </div>
        ${plantButtons(p, st)}
      </section>
      <section class="mxj-card"><h3>长成现在这样</h3><ol class="mxj-timeline">${timeline}</ol></section>
      <section class="mxj-card"><div class="mxj-row mxj-between"><h3>这一周浇的水</h3><span class="mxj-muted">一天一次就够了</span></div><div class="mxj-week">${days.join('')}</div></section>
      ${trouble.length ? `<section class="mxj-card"><h3>他写的</h3>${trouble.map(n => `<blockquote class="mxj-stage-note">${esc(n.text)}<span>${esc(formatTime(n.at))}</span></blockquote>`).join('')}</section>` : ''}
      <details class="mxj-pet-more"><summary>不养了</summary><button type="button" class="mxj-link-btn" data-act="pet-remove" data-id="${esc(p.id)}">不养${esc(p.name)}了</button></details>`;
}
