// 梦想家 · 界面 · 交换日记
import { esc, ctx, clip } from './util.js?mxj=0.8.2';
import { characterView } from './character.js?mxj=0.8.2';
import { WEATHERS, DIARY_MODES, getDiary, charTurn, markDiaryRead, setDiaryMode, addUserEntry, writeCharDiary } from './home-diary.js?mxj=0.8.2';
import { viewNoChar } from './ui-common.js?mxj=0.8.2';

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
        views: { diary: viewDiary },
        titles: {
            diary: (char, home) => {
                const n = getDiary(home).entries.length;
                return ['交换日记', n ? `第 ${Math.floor((n - 1) / 2) + 1} 页` : '新本子'];
            },
        },
        // 每次进日记页：先只看最近几篇，收起引用聊天
        enter: {
            diary() {
                state.diaryAll = false;
                state.diaryDraft.picking = false;
            },
        },
        after: {
            diary(char, home) { if (char && home) markDiaryRead(char); },
        },
        actions: {
            'diary-weather'(el) { state.diaryDraft.weather = el.dataset.id; state.keepScroll = true; render(); },
            'diary-pick'() { state.diaryDraft.picking = !state.diaryDraft.picking; state.keepScroll = true; render(); },
            'diary-quote'(el) {
                const q = recentChatForQuote()[Number(el.dataset.idx)];
                if (q) state.diaryDraft.quote = q;
                state.diaryDraft.picking = false;
                state.keepScroll = true;
                render();
            },
            'diary-unquote'() { state.diaryDraft.quote = null; state.keepScroll = true; render(); },
            'diary-more'() { state.diaryAll = true; state.keepScroll = true; render(); },
            'diary-mode'(el, char) { setDiaryMode(char, el.dataset.id); state.keepScroll = true; render(); },
            'diary-ask'(el, char) { void askDiary(char); },
            'diary-save'(el, char) {
                const dr = state.diaryDraft;
                const text = String(dr.text || '').trim();
                if (text) {
                    addUserEntry(char, dr);
                    state.diaryDraft = { weather: dr.weather, text: '', quote: null, picking: false };
                    go('home');
                    flash('本子放回书桌了');
                } else {
                    go('home');
                }
            },
        },
        fields: {
            diaryText(value) { state.diaryDraft.text = value; },
        },
        inputs: {
            diaryText(el) { state.diaryDraft.text = el.value; },
        },
    };
}

function recentChatForQuote() {
    const chat = Array.isArray(ctx().chat) ? ctx().chat : [];
    const out = [];
    for (let i = chat.length - 1; i >= 0 && out.length < 8; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        const text = String(m.mes || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (text) out.push({ name: m.name || (m.is_user ? '我' : '他'), text: clip(text, 200) });
    }
    return out;
}

function diaryEntryHtml(e, name) {
    const mine = e.author === 'user';
    const [y, m, d] = String(e.date || '').split('-');
    const dateText = m ? `${Number(m)} 月 ${Number(d)} 日` : '';
    return `<article class="mxj-diary-entry${mine ? ' is-mine' : ''}">
      <div class="mxj-diary-meta"><span>${esc(dateText)}${e.weather ? ` · ${esc(e.weather)}` : ''}</span><span>${mine ? '你写的' : `${esc(name)}写的`}</span></div>
      ${e.quote ? `<blockquote class="mxj-diary-quote">${esc(e.quote.name)}：${esc(e.quote.text)}</blockquote>` : ''}
      <div class="mxj-diary-text">${esc(e.text)}</div>
      ${e.stamp ? `<div class="mxj-stamp" aria-label="印章">${esc(e.stamp)}</div>` : ''}
    </article>`;
}

function viewDiary(char, home) {
    if (!home) return viewNoChar();
    const name = characterView(char).name;
    const diary = getDiary(home);
    const entries = diary.entries;
    const shown = state.diaryAll ? entries : entries.slice(-8);
    const hisTurn = charTurn(home);
    const dr = state.diaryDraft;
    const modeText = { visit: `${name}下次回家时会接着写。`, daily: `${name}每天会写一篇，今天写过就等明天。`, manual: `等你叫${name}写。` }[diary.mode];
    let writer = '';
    if (hisTurn) {
        writer = `<section class="mxj-card">
          <p><b>轮到${esc(name)}写了。</b>${esc(modeText)}</p>
          <button type="button" class="mxj-btn" data-act="diary-ask" ${state.busy ? 'disabled' : ''}>叫他现在写</button>
        </section>`;
    } else {
        const weathers = WEATHERS.map(w => `<button type="button" class="mxj-chip${dr.weather === w ? ' is-on' : ''}" data-act="diary-weather" data-id="${esc(w)}" aria-pressed="${dr.weather === w}">${esc(w)}</button>`).join('');
        const quotes = dr.picking ? recentChatForQuote() : [];
        writer = `<section class="mxj-diary-page is-writing">
          <div class="mxj-diary-meta"><span>${new Date().getMonth() + 1} 月 ${new Date().getDate()} 日 · 轮到你写</span></div>
          <div class="mxj-chips">${weathers}</div>
          ${dr.quote ? `<blockquote class="mxj-diary-quote">${esc(dr.quote.name)}：${esc(dr.quote.text)} <button type="button" class="mxj-link-btn" data-act="diary-unquote">去掉</button></blockquote>` : ''}
          <label class="mxj-sr" for="mxj-diary-text">今天的日记</label>
          <textarea id="mxj-diary-text" class="mxj-input mxj-diary-input" rows="6" data-field="diaryText" placeholder="写点今天发生的事…">${esc(dr.text)}</textarea>
          <button type="button" class="mxj-btn" data-act="diary-pick">${dr.picking ? '收起聊天' : '引用一段聊天'}</button>
          ${dr.picking ? `<div class="mxj-quote-list">${quotes.length ? quotes.map((q, i) => `<button type="button" class="mxj-quote-item" data-act="diary-quote" data-idx="${i}"><b>${esc(q.name)}</b>${esc(q.text)}</button>`).join('') : '<p class="mxj-muted">当前聊天里还没有可以引用的话。</p>'}</div>` : ''}
        </section>`;
    }
    const modes = DIARY_MODES.map(m => `<button type="button" class="mxj-place${diary.mode === m.id ? ' is-on' : ''}" data-act="diary-mode" data-id="${m.id}" aria-pressed="${diary.mode === m.id}">${esc(m.label)}</button>`).join('');
    return `
      <div class="mxj-strip"><span class="mxj-dot${hisTurn ? ' is-away' : ' is-red'}"></span><span class="mxj-grow">${hisTurn ? `轮到${esc(name)}写` : '轮到你写'}</span><span class="mxj-muted">共 ${entries.length} 篇</span></div>
      <section class="mxj-notebook">
        ${entries.length > shown.length ? `<button type="button" class="mxj-link-btn" data-act="diary-more">看更早的 ${entries.length - shown.length} 篇</button>` : ''}
        ${shown.length ? shown.map(e => diaryEntryHtml(e, name)).join('') : `<p class="mxj-diary-empty">新本子。你先写第一篇，${esc(name)}会接着写。</p>`}
      </section>
      ${writer}
      <section class="mxj-card">
        <h3>${esc(name)}自动写日记的时机</h3><p class="mxj-muted">无论选哪种，都可以使用上方「叫他现在写」手动生成。</p>
        <div class="mxj-places">${modes}</div>
      </section>
      ${hisTurn ? '' : '<button type="button" class="mxj-btn is-primary" data-act="diary-save">合上本子，放回书桌</button>'}`;
}

async function askDiary(char) {
    const name = characterView(char).name;
    await run(`${name}在写日记…`, signal => writeCharDiary(char, { signal }));
    if (state.view === 'diary') {
        const main = app.root()?.querySelector('.mxj-main');
        if (main) main.scrollTop = main.scrollHeight;
    }
}
