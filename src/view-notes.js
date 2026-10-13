// 梦想家 · 界面 · 小纸条
import { esc, formatTime } from './util.js?mxj=0.6.10';
import { characterView } from './character.js?mxj=0.6.10';
import { NOTE_KINDS, NOTE_PLACES, postNote, replyToNote, writeCharNote, markCharNotesRead } from './home-notes.js?mxj=0.6.10';
import { viewNoChar } from './ui-common.js?mxj=0.6.10';

let app = null;
let state = null;
const render = () => app.render();
const run = (label, task) => app.run(label, task);
const flash = text => app.flash(text);
const renderStatus = () => app.renderStatus();

export function setup(a) {
    app = a;
    state = a.state;
    return {
        views: { notes: viewNotes },
        titles: {
            notes: (char, home) => ['小纸条', `${(home?.notes || []).length} 张`],
        },
        // 打开纸条页就算看过他的纸条了
        after: {
            notes(char, home) { if (char && home) markCharNotesRead(char); },
        },
        actions: {
            kind(el) { state.composer.kind = el.dataset.id; state.keepScroll = true; render(); },
            place(el) { state.composer.place = el.dataset.id; state.keepScroll = true; render(); },
            'reply-note'(el) {
                state.composer.kind = el.dataset.kind || '日常';
                state.keepScroll = true;
                render();
                app.root().querySelector('#mxj-composer')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                app.root().querySelector('[data-field="noteText"]')?.focus({ preventScroll: true });
            },
            'post-note'(el, char) { void submitNote(char); },
            'note-ask'(el, char) { if(char) void run('正在写纸条…',signal=>writeCharNote(char,{signal})); },
            'note-reply'(el, char) { if(char && el.dataset.id) void run('他在看你的纸条…', signal => replyToNote(char, el.dataset.id, { signal })); },
        },
        fields: {
            deferred(value) { state.composer.deferred = value; },
            noteText(value) { state.composer.text = value; },
        },
        inputs: {
            noteText(el) { state.composer.text = el.value; },
        },
    };
}

function noteCard(n, home, name) {
    const from = n.from === 'user' ? '我写的' : name;
    const isNew = n.from === 'char' && !n.readAt;
    let status = '';
    if (n.from === 'user') {
        if (n.replyId) status = '<span class="mxj-note-status is-ok">他回了</span>';
        else if (n.readAt) status = '<span class="mxj-note-status">他看过了</span>';
        else status = '<span class="mxj-note-status">他还没看到</span>';
    }
    let replyTo = '';
    if (n.replyTo) {
        const orig = home.notes.find(x => x.id === n.replyTo);
        if (orig) replyTo = `<div class="mxj-note-quote">回你的「${esc(orig.text.slice(0, 18))}${orig.text.length > 18 ? '…' : ''}」</div>`;
    }
    const tilt = ((n.id.charCodeAt(n.id.length - 1) % 5) - 2) * 0.6;
    return `<article class="mxj-note kind-${NOTE_KINDS.indexOf(n.kind)}${n.from === 'user' ? ' is-mine' : ''}" style="transform:rotate(${tilt}deg)">
      <div class="mxj-note-meta"><span class="mxj-note-kind">${esc(n.kind)}</span><span>${esc(from)} · ${esc(n.place)} · ${esc(formatTime(n.at))}${isNew ? ' · 新' : ''}</span></div>
      ${replyTo}
      <div class="mxj-note-text">${esc(n.text)}</div>
      <div class="mxj-row mxj-between">${status || '<span></span>'}${n.from === 'char' ? `<button type="button" class="mxj-link-btn" data-act="reply-note" data-kind="${esc(n.kind)}">回他一张</button>` : (!n.replyId ? `<button type="button" class="mxj-link-btn" data-act="note-reply" data-id="${esc(n.id)}" ${state.busy ? 'disabled' : ''}>请他现在回</button>` : '')}</div>
    </article>`;
}

function viewNotes(char, home) {
    if (!home) return viewNoChar();
    const name = characterView(char).name;
    const notes = (home.notes || []).slice().reverse();
    const c = state.composer;
    const kinds = NOTE_KINDS.map(k => `<button type="button" class="mxj-chip${c.kind === k ? ' is-on is-red' : ''}" data-act="kind" data-id="${esc(k)}" aria-pressed="${c.kind === k}">${esc(k)}</button>`).join('');
    const places = NOTE_PLACES.map(p => `<button type="button" class="mxj-place${c.place === p ? ' is-on' : ''}" data-act="place" data-id="${esc(p)}" aria-pressed="${c.place === p}">${esc(p)}</button>`).join('');
    return `
      <section class="mxj-board">
        ${notes.length ? notes.map(n => noteCard(n, home, name)).join('') : '<p class="mxj-board-empty">门边的软木板还空着。</p>'}
      </section>
      <section class="mxj-card" id="mxj-composer">
        <h3>写一张</h3>
        <div class="mxj-chips is-wrap">${kinds}</div>
        <label class="mxj-field">
          <span>写给${esc(name)}</span>
          <textarea class="mxj-input mxj-paper" rows="3" data-field="noteText" placeholder="想说的话…">${esc(c.text)}</textarea>
        </label>
        <div class="mxj-field"><span>贴在哪里</span><div class="mxj-places">${places}</div></div>
        <label class="mxj-check">
          <span>他回家时再读（不马上回复）</span>
          <input type="checkbox" data-field="deferred" ${c.deferred ? 'checked' : ''}>
        </label>
        <button type="button" class="mxj-btn" data-act="note-ask" ${state.busy ? 'disabled' : ''}>请他现在留一张纸条</button>
        <button type="button" class="mxj-btn is-red" data-act="post-note" ${state.busy ? 'disabled' : ''}>贴上去</button>
      </section>`;
}

async function submitNote(char) {
    const c = state.composer;
    const text = String(c.text || '').trim();
    if (!text) {
        state.error = '纸条还是空的。';
        renderStatus();
        return;
    }
    const note = postNote(char, c);
    c.text = '';
    if (state.busy && !c.deferred) {
        state.keepScroll = false;
        render();
        flash('贴好了。他这会儿在忙，可以等一下点「请他现在回」，或者等他回家时看');
        return;
    }
    if (c.deferred) {
        state.keepScroll = false;
        render();
        flash('贴好了，他回家时会看到');
        return;
    }
    await run('他在看你的纸条…', signal => replyToNote(char, note.id, { signal }));
}
