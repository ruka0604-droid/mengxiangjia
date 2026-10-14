// 梦想家 · 小家伙们的画法：猫、狗、六种植物（每个生长阶段一个样子），房间里的那一层
import { esc, shade, luminance } from './util.js?mxj=0.7.0';
import { SCENE_W, SCENE_H } from './furniture.js?mxj=0.7.0';
import { coatOf, habitOf, animalStatus, animalRoom, animalPose, animalLabel, plantStatus, PLANT_KINDS } from './pets-data.js?mxj=0.7.0';

const PINK = '#E8A0A8';

// 动物：本地坐标 80×64，地面在 y=62
function catShape(coat, pose) {
    const b = coat.base, d = coat.dark;
    const eye = luminance(b) < 0.25 ? '#F2D27A' : '#2A2A2A';
    const [p1, p2] = coat.patches || [];
    if (pose === 'sleep') {
        return `<path d="M62 52 C78 50 76 32 68 30" fill="none" stroke="${b}" stroke-width="6" stroke-linecap="round"/>
<ellipse cx="44" cy="48" rx="21" ry="14" fill="${b}"/>
${p1 ? `<ellipse cx="50" cy="43" rx="9" ry="6" fill="${p1}"/>` : ''}${p2 ? `<ellipse cx="36" cy="54" rx="6" ry="4" fill="${p2}"/>` : ''}
${coat.stripes ? `<path d="M38 42h10M40 47h10M42 52h8" stroke="${d}" stroke-width="2" stroke-linecap="round"/>` : ''}
<circle cx="26" cy="36" r="14" fill="${b}"/>
${p2 ? `<ellipse cx="22" cy="30" rx="6" ry="5" fill="${p2}"/>` : ''}
<polygon points="14,29 16,15 25,23" fill="${b}"/><polygon points="27,23 36,15 38,29" fill="${b}"/>
<polygon points="17,25 18,19 22,23" fill="${PINK}" opacity=".7"/><polygon points="30,23 34,19 35,25" fill="${PINK}" opacity=".7"/>
<path d="M19 38q3 3 6 0M28 38q3 3 6 0" fill="none" stroke="${eye}" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    return `<path d="M52 60C68 60 72 46 62 40" fill="none" stroke="${b}" stroke-width="5" stroke-linecap="round"/>
<ellipse cx="40" cy="48" rx="14" ry="14" fill="${b}"/>
${p1 ? `<ellipse cx="45" cy="46" rx="6" ry="7" fill="${p1}"/>` : ''}${p2 ? `<ellipse cx="34" cy="53" rx="4" ry="4" fill="${p2}"/>` : ''}
${coat.stripes ? `<path d="M30 44h6M30 49h7M44 44h6M43 49h7" stroke="${d}" stroke-width="2" stroke-linecap="round"/>` : ''}
<ellipse cx="34" cy="61" rx="4.5" ry="2" fill="${b}" stroke="${d}" stroke-width="1"/><ellipse cx="46" cy="61" rx="4.5" ry="2" fill="${b}" stroke="${d}" stroke-width="1"/>
<circle cx="40" cy="26" r="13" fill="${b}"/>
${p2 ? `<ellipse cx="45" cy="20" rx="6" ry="5" fill="${p2}"/>` : ''}
<polygon points="29,20 30,8 38,15" fill="${b}"/><polygon points="42,15 50,8 51,20" fill="${b}"/>
<polygon points="31,17 31.5,11 36,15" fill="${PINK}" opacity=".7"/><polygon points="44,15 48.5,11 49,17" fill="${PINK}" opacity=".7"/>
${coat.stripes ? `<path d="M36 15v4M40 14v4M44 15v4" stroke="${d}" stroke-width="1.6" stroke-linecap="round"/>` : ''}
<circle cx="35" cy="26" r="2.2" fill="${eye}"/><circle cx="45" cy="26" r="2.2" fill="${eye}"/>
<path d="M38.6 30h2.8l-1.4 1.6z" fill="${PINK}"/>`;
}

function dogShape(coat, pose) {
    const b = coat.base, d = coat.dark, belly = coat.belly || shade(b, 0.4);
    const eye = luminance(b) < 0.25 ? '#F2D27A' : '#2A2A2A';
    const patch = coat.patches?.[0];
    if (pose === 'sleep') {
        const ears = coat.ears === 'up'
            ? `<polygon points="14,40 15,29 22,36" fill="${b}"/><polygon points="27,35 33,28 34,40" fill="${b}"/>`
            : `<ellipse cx="15" cy="46" rx="4.5" ry="9" fill="${d}" transform="rotate(12 15 46)"/>`;
        return `<path d="M66 50q10-2 8-12" fill="none" stroke="${b}" stroke-width="5" stroke-linecap="round"/>
<ellipse cx="46" cy="52" rx="22" ry="10" fill="${b}"/>
${patch ? `<circle cx="52" cy="49" r="5" fill="${patch}"/><circle cx="40" cy="55" r="3" fill="${patch}"/>` : ''}
${ears}
<circle cx="24" cy="46" r="12" fill="${b}"/>
<ellipse cx="18" cy="52" rx="6.5" ry="4.5" fill="${belly}"/>
<ellipse cx="13.5" cy="50" rx="2.4" ry="1.8" fill="#2A2A2A"/>
<path d="M19 44q2.5 2 5 0M27 44q2.5 2 5 0" fill="none" stroke="${eye}" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    const ears = coat.ears === 'up'
        ? `<polygon points="28,20 29,8 37,14" fill="${b}"/><polygon points="43,14 51,8 52,20" fill="${b}"/><polygon points="30,17 30.5,11 35,14" fill="${PINK}" opacity=".6"/><polygon points="45,14 49.5,11 50,17" fill="${PINK}" opacity=".6"/>`
        : '';
    const flops = coat.ears === 'up' ? '' : `<ellipse cx="28" cy="27" rx="5" ry="10" fill="${d}" transform="rotate(15 28 27)"/><ellipse cx="52" cy="27" rx="5" ry="10" fill="${d}" transform="rotate(-15 52 27)"/>`;
    return `${coat.curl ? `<path d="M53 50q12-4 6-14" fill="none" stroke="${b}" stroke-width="5" stroke-linecap="round"/>` : `<path d="M53 54q10-2 12-11" fill="none" stroke="${b}" stroke-width="4.5" stroke-linecap="round"/>`}
<ellipse cx="40" cy="48" rx="15" ry="14" fill="${b}"/>
${patch ? `<circle cx="47" cy="45" r="5" fill="${patch}"/>` : ''}
<ellipse cx="40" cy="52" rx="8" ry="9" fill="${belly}"/>
<rect x="33" y="52" width="5" height="10" rx="2" fill="${b}"/><rect x="42" y="52" width="5" height="10" rx="2" fill="${b}"/>
${ears}
<circle cx="40" cy="25" r="13" fill="${b}"/>
${patch ? `<circle cx="34" cy="19" r="4" fill="${patch}"/>` : ''}
${flops}
<ellipse cx="40" cy="31" rx="7" ry="5" fill="${belly}"/>
<ellipse cx="40" cy="28.6" rx="2.6" ry="2" fill="#2A2A2A"/>
<circle cx="35" cy="23" r="2" fill="${eye}"/><circle cx="45" cy="23" r="2" fill="${eye}"/>`;
}

export function animalShape(animal, pose = 'sit') {
    if (animal.kind === 'custom' && animal.art?.path) {
        return `<image href="${esc(animal.art.path)}" x="6" y="2" width="68" height="60" preserveAspectRatio="xMidYMax meet"/>`;
    }
    const coat = coatOf(animal);
    return habitOf(animal) === 'dog' && animal.kind !== 'custom' ? dogShape(coat, pose) : (animal.kind === 'custom' ? catShape(coatOf({ kind: 'cat', coat: 'gray' }), pose) : catShape(coat, pose));
}

export function animalIcon(animal, { size = 80, pose = 'sit' } = {}) {
    return `<svg viewBox="0 0 80 64" width="${size}" height="${Math.round(size * 0.8)}" role="img" aria-label="${esc(`${animal.name || ''} ${animalLabel(animal)}`)}">${animalShape(animal, pose)}</svg>`;
}

// 植物：本地坐标 40×64，地面在 y=62
function plantShape(plant, st) {
    const kind = PLANT_KINDS[plant.kind] ? plant.kind : 'mint';
    const n = st.kind.stages.length - 1;
    const stage = st.stage;
    const s = stage / n;
    const sick = st.trouble;
    const leaf = sick === 'soggy' ? '#C9B84E' : sick === 'dry' ? '#B3A15A' : '#6E9E6A';
    const leaf2 = sick ? shade(leaf, -0.15) : '#5A8456';
    const droop = sick ? 6 : 0;
    const pot = st.kind.pot;
    let body = '';
    if (stage === 0 && kind !== 'cactus') {
        body = `<path d="M20 42v-6" stroke="${leaf2}" stroke-width="1.6"/><ellipse cx="17" cy="35" rx="3.4" ry="2" fill="${leaf}"/><ellipse cx="23" cy="35" rx="3.4" ry="2" fill="${leaf}"/>`;
    } else if (kind === 'cactus') {
        const h = 8 + 20 * s, w = 9 + 6 * s, top = 42 - h;
        body = `<rect x="${20 - w / 2}" y="${top}" width="${w}" height="${h + 1}" rx="${w / 2}" fill="${leaf}"/>
<path d="M${20 - w / 5} ${top + 3}v${h - 4}M20 ${top + 2}v${h - 3}M${20 + w / 5} ${top + 3}v${h - 4}" stroke="${leaf2}" stroke-width="1"/>
${stage >= 1 ? `<path d="M${20 - w / 2} ${top + h * 0.4}l-2.5-1M${20 + w / 2} ${top + h * 0.5}l2.5-1M${20 - w / 2} ${top + h * 0.75}l-2.5 0M${20 + w / 2} ${top + h * 0.25}l2.5-1" stroke="#F4F1EA" stroke-width="1" stroke-linecap="round"/>` : ''}
${stage === 3 ? `<ellipse cx="20" cy="${top - 1}" rx="3.2" ry="4" fill="${PINK}"/>` : ''}
${stage >= 4 ? [0, 72, 144, 216, 288].map(a => `<ellipse cx="20" cy="${top - 5}" rx="2.6" ry="5" fill="${PINK}" transform="rotate(${a} 20 ${top - 1})"/>`).join('') + `<circle cx="20" cy="${top - 1}" r="2" fill="#F2C46B"/>` : ''}`;
    } else if (kind === 'pothos') {
        const vines = Math.min(4, stage + 1);
        const paths = [];
        for (let i = 0; i < vines; i++) {
            const side = i % 2 ? 1 : -1;
            const reach = 6 + 10 * s + i * 2;
            if (stage >= 3 && i >= 2) {
                const ex = 20 + side * 12, ey = 52 + i;
                paths.push(`<path d="M20 42q${side * 8} -4 ${side * 12} ${ey - 42}" fill="none" stroke="${leaf2}" stroke-width="1.4"/><ellipse cx="${ex}" cy="${ey}" rx="3.2" ry="2.2" fill="${leaf}"/><ellipse cx="${20 + side * 9}" cy="${43}" rx="3" ry="2" fill="${leaf}"/>`);
            } else {
                const ex = 20 + side * (4 + i * 2), ey = 42 - reach + droop;
                paths.push(`<path d="M20 42Q${20 + side * 2} ${42 - reach / 2} ${ex} ${ey}" fill="none" stroke="${leaf2}" stroke-width="1.4"/><ellipse cx="${ex}" cy="${ey}" rx="3.4" ry="2.4" fill="${leaf}"/><ellipse cx="${(20 + ex) / 2 + side}" cy="${(42 + ey) / 2}" rx="3" ry="2" fill="${leaf}"/>`);
            }
        }
        body = paths.join('');
    } else if (kind === 'mint') {
        const stems = Math.min(4, stage + 1);
        const parts = [];
        for (let i = 0; i < stems; i++) {
            const x = 20 + (i - (stems - 1) / 2) * 4.5;
            const h = 8 + 16 * s - (i % 2) * 3;
            const top = 42 - h + droop;
            parts.push(`<path d="M${x} 42V${top}" stroke="${leaf2}" stroke-width="1.4"/><ellipse cx="${x - 2.6}" cy="${top + h * 0.45}" rx="2.8" ry="1.8" fill="${leaf}"/><ellipse cx="${x + 2.6}" cy="${top + h * 0.45}" rx="2.8" ry="1.8" fill="${leaf}"/><ellipse cx="${x}" cy="${top}" rx="2.6" ry="2.2" fill="${leaf}"/>${stage >= 4 ? `<circle cx="${x}" cy="${top - 3}" r="1.6" fill="#FFFFFF" stroke="#D9D4C8" stroke-width=".5"/>` : ''}`);
        }
        body = parts.join('');
    } else if (kind === 'sunflower') {
        const h = 10 + 28 * s, top = 42 - h;
        const lean = sick ? 5 : 0;
        body = `<path d="M20 42Q20 ${top + h / 2} ${20 + lean} ${top}" fill="none" stroke="${leaf2}" stroke-width="2"/>
<ellipse cx="15" cy="${42 - h * 0.4}" rx="4.5" ry="2.4" fill="${leaf}" transform="rotate(-20 15 ${42 - h * 0.4})"/><ellipse cx="25" cy="${42 - h * 0.6}" rx="4.5" ry="2.4" fill="${leaf}" transform="rotate(20 25 ${42 - h * 0.6})"/>
${stage === 3 ? `<circle cx="${20 + lean}" cy="${top}" r="3.6" fill="${leaf}"/>` : ''}
${stage >= 4 ? `<circle cx="${20 + lean}" cy="${top}" r="8" fill="${sick ? '#C9B84E' : '#F2C46B'}"/><circle cx="${20 + lean}" cy="${top}" r="3.6" fill="#7A5638"/>` : ''}`;
    } else if (kind === 'succulent') {
        const count = 3 + stage * 2;
        const r = 3 + 6 * s;
        const parts = [];
        for (let i = 0; i < count; i++) {
            const a = (i / count) * 360;
            parts.push(`<ellipse cx="20" cy="${38 - r / 2}" rx="${2 + s * 1.5}" ry="${r / 1.4 + 2}" fill="${i % 2 ? leaf : shade(leaf, 0.15)}" transform="rotate(${a} 20 ${38})"/>`);
        }
        body = parts.join('') + `<circle cx="20" cy="38" r="${1.5 + s}" fill="${shade(leaf, 0.25)}"/>` + (stage >= 4 ? `<path d="M20 36V18" stroke="${leaf2}" stroke-width="1.2"/><circle cx="20" cy="17" r="2.6" fill="${PINK}"/><circle cx="22" cy="21" r="1.8" fill="${PINK}"/>` : '');
    } else {
        const h = 8 + 24 * s, top = 42 - h + droop;
        body = `<path d="M20 42V${top}" stroke="${leaf2}" stroke-width="1.8"/>
<path d="M20 ${42 - h * 0.35}l-6-3M20 ${42 - h * 0.6}l6-3M20 ${42 - h * 0.85}l-5-2" stroke="${leaf2}" stroke-width="1.4"/>
<ellipse cx="13" cy="${42 - h * 0.35 - 3}" rx="3.4" ry="2.2" fill="${leaf}"/><ellipse cx="27" cy="${42 - h * 0.6 - 3}" rx="3.4" ry="2.2" fill="${leaf}"/><ellipse cx="14.5" cy="${42 - h * 0.85 - 2}" rx="3" ry="2" fill="${leaf}"/>
${stage === 3 ? `<circle cx="24" cy="${42 - h * 0.5}" r="1.8" fill="#F2C46B"/><circle cx="16" cy="${42 - h * 0.7}" r="1.8" fill="#F2C46B"/>` : ''}
${stage >= 4 ? `<circle cx="25" cy="${42 - h * 0.45}" r="3" fill="#D9534F"/><circle cx="15" cy="${42 - h * 0.65}" r="3" fill="#D9534F"/><circle cx="22" cy="${top + 3}" r="2.6" fill="#E07A4F"/>` : ''}`;
    }
    const puddle = sick === 'soggy' ? `<ellipse cx="20" cy="62.5" rx="15" ry="2" fill="#8FB5D6" opacity=".75"/>` : '';
    return `${puddle}${body}
<path d="M10 44h20l-3 18H13z" fill="${pot}"/><rect x="8" y="41" width="24" height="5" rx="1.5" fill="${shade(pot, -0.12)}"/>
<ellipse cx="20" cy="42" rx="10" ry="1.6" fill="#5A3A22"/>`;
}

export function plantIcon(plant, { size = 40, t = Date.now() } = {}) {
    const st = plantStatus(plant, t);
    return `<svg viewBox="0 0 40 64" width="${size}" height="${Math.round(size * 1.6)}" role="img" aria-label="${esc(`${plant.name} · ${st.stageName}`)}">${plantShape(plant, st)}</svg>`;
}

// 一棵植物某个阶段的样子（成长记录里用）
export function plantStageIcon(plant, stage, { size = 28 } = {}) {
    const st = { ...plantStatus(plant), stage, trouble: '' };
    return `<svg viewBox="0 0 40 64" width="${size}" height="${Math.round(size * 1.6)}" aria-hidden="true">${plantShape(plant, st)}</svg>`;
}

function bubble(x, y, text) {
    if (!text) return '';
    if (text === '!') return `<g pointer-events="none"><circle cx="${x}" cy="${y - 6}" r="7" fill="#C2452D" stroke="#FFFFFF" stroke-width="1.5"/><text x="${x}" y="${y - 2.4}" text-anchor="middle" font-size="10" font-weight="900" fill="#FFFFFF">!</text></g>`;
    const w = text.length * 9 + 10;
    return `<g pointer-events="none"><rect x="${x - w / 2}" y="${y - 16}" width="${w}" height="14" rx="5" fill="#FFFBF2" stroke="#4A3A2C" stroke-width="1"/><path d="M${x - 3} ${y - 2.5}l3 4 3-4z" fill="#FFFBF2" stroke="#4A3A2C" stroke-width="1"/><rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="1.6" fill="#FFFBF2"/><text x="${x}" y="${y - 5.6}" text-anchor="middle" font-size="9" fill="#4A3A2C">${esc(text)}</text></g>`;
}

// 房间里的那一层：先画植物，再画动物（站在最前面）
export function petsLayer(home, roomId, { t = Date.now(), selectedId = '' } = {}) {
    const pets = home?.pets;
    if (!pets) return '';
    const rooms = home.house?.rooms || [];
    let svg = '';
    for (const p of (pets.plants || []).filter(x => x.room === roomId)) {
        const st = plantStatus(p, t);
        const x = Math.min(90, Math.max(10, Number(p.x) || 50)) / 100 * SCENE_W;
        const sc = 1, base = SCENE_H - 6;
        const tip = st.trouble ? '蔫了' : st.thirsty ? '渴了' : '';
        svg += `<g class="mxj-pet${p.id === selectedId ? ' mxj-selected' : ''}" data-act="plant" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="${esc(`${p.name}（${st.stageName}）`)}"><g transform="translate(${(x - 20 * sc).toFixed(1)} ${(base - 62 * sc).toFixed(1)}) scale(${sc})">${plantShape(p, st)}</g>${bubble(x, base - 50 * sc - (st.stage * 4), tip)}</g>`;
    }
    for (const a of (pets.animals || [])) {
        if (animalRoom(a, rooms, t) !== roomId) continue;
        const { pose, x: px } = animalPose(a, t);
        const st = animalStatus(a, t);
        const x = px / 100 * SCENE_W;
        const sc = a.kind === 'custom' ? 0.78 : 0.7, base = SCENE_H - 3;
        svg += `<g class="mxj-pet${a.id === selectedId ? ' mxj-selected' : ''}" data-act="pet" data-id="${esc(a.id)}" role="button" tabindex="0" aria-label="${esc(`${a.name}（${animalLabel(a)}）`)}"><g transform="translate(${(x - 40 * sc).toFixed(1)} ${(base - 62 * sc).toFixed(1)}) scale(${sc})"><g class="mxj-pet-body is-${pose}">${animalShape(a, pose)}</g></g>${bubble(x, base - (pose === 'sleep' ? 32 : 46) * sc, st.bubble)}</g>`;
    }
    return svg;
}
