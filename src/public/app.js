/* Small, dependency-free front-end. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const csrf = () => $('meta[name=csrf]')?.content || '';

  // ---- toast ----
  let toastTimer;
  function toast(text, isError) {
    const el = $('#toast'); if (!el) return;
    el.textContent = text; el.classList.toggle('error', !!isError); el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // ---- fetch helper ----
  async function post(url, data) {
    const res = await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF': csrf(), Accept: 'application/json' },
      body: JSON.stringify(data || {}),
    });
    let json = {}; try { json = await res.json(); } catch {}
    return { ok: res.ok && json.ok !== false, status: res.status, ...json };
  }

  // ---- phone formatting: (819) 208-5721 ----
  $$('input[data-phone]').forEach((inp) => {
    const fmt = () => {
      let d = inp.value.replace(/\D/g, '');
      if (d.length === 11 && d[0] === '1') d = d.slice(1);
      d = d.slice(0, 10);
      let out = d;
      if (d.length > 6) out = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
      else if (d.length > 3) out = `(${d.slice(0, 3)}) ${d.slice(3)}`;
      else if (d.length > 0) out = `(${d}`;
      inp.value = out;
    };
    inp.addEventListener('input', fmt); fmt();
  });

  // ---- modals ----
  function openModal(m) { m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
  function closeModal(m) { m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); }
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    if (opener) { const m = $(opener.dataset.open); if (m) openModal(m); return; }
    if (e.target.closest('[data-close]')) { const m = e.target.closest('.modal'); if (m) closeModal(m); return; }
    if (e.target.classList.contains('modal')) closeModal(e.target);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.modal.open').forEach(closeModal); });

  // ---- auto-submit and confirm forms ----
  $$('[data-autosubmit]').forEach((el) => el.addEventListener('change', () => el.form?.submit()));
  $$('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));

  // ---- offer page ----
  const offerEl = $('#offer');
  if (offerEl) initOffer(offerEl);

  function initOffer(root) {
    const offerId = root.dataset.offer;
    const me = Number(root.dataset.me);
    let active = root.dataset.active === '1';
    let lastMsg = Number(root.dataset.lastMsg || 0);
    const lotsBox = $('#lots');
    const rulesModal = $('#rules-modal');
    let pendingLot = null;
    const T = window.__i18n || {};

    // Reserve flow: button → rules modal → POST. There is no matching cancel:
    // a reservation is a commitment, and only an admin can free a lot again.
    lotsBox.addEventListener('click', (e) => {
      const r = e.target.closest('[data-reserve]');
      if (!r || r.disabled) return;
      pendingLot = r.dataset.reserve;
      $('#rules-ok').checked = false; $('#rules-confirm').disabled = true;
      openModal(rulesModal);
    });
    $('#rules-ok')?.addEventListener('change', (e) => { $('#rules-confirm').disabled = !e.target.checked; });
    $('#rules-confirm')?.addEventListener('click', async (e) => {
      if (!pendingLot) return;
      e.target.classList.add('busy');
      const r = await post(`/offres/${offerId}/lots/${pendingLot}/reserver`);
      e.target.classList.remove('busy');
      closeModal(rulesModal);
      toast(r.message || (r.ok ? 'OK' : r.error || 'Erreur'), !r.ok);
      refreshLots();
    });

    // An administrator's actions on a lot (free it, mark an absence, undo one)
    // sit on the same rows, so they are handled here rather than on a page of
    // their own. Delegated from the container because refreshLots() replaces
    // its contents on every live update, taking any bound form with it.
    lotsBox.addEventListener('submit', async (e) => {
      const f = e.target.closest('form[data-lot-action]');
      if (!f) return;
      e.preventDefault();
      const btn = e.submitter;
      if (btn?.dataset.confirm && !confirm(btn.dataset.confirm)) return;
      const r = await post(f.getAttribute('action'), { action: btn?.value });
      if (!r.ok) toast(r.error || 'Erreur', true);
      else if (r.notice) toast(r.notice);
      refreshLots();
    });

    let refreshing = false;
    async function refreshLots() {
      if (refreshing) return; refreshing = true;
      try {
        const res = await fetch(`/offres/${offerId}/lots`, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
        if (res.ok) { lotsBox.innerHTML = await res.text(); startCountdown(); }
      } finally { refreshing = false; }
    }

    // Cooldown countdown → enable buttons when over
    let cdTimer;
    function startCountdown() {
      clearInterval(cdTimer);
      const el = $('#cooldown', lotsBox); if (!el) return;
      const until = Number(el.dataset.until);
      const tick = () => {
        const left = until - Date.now();
        if (left <= 0) { clearInterval(cdTimer); refreshLots(); return; }
        const s = Math.ceil(left / 1000);
        const out = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        $$('.countdown', el).forEach((c) => (c.textContent = out));
      };
      tick(); cdTimer = setInterval(tick, 1000);
    }
    startCountdown();

    // Chat
    const chat = $('#chat');
    const form = $('#chat-form');
    const scrollChat = () => { chat.scrollTop = chat.scrollHeight; };
    scrollChat();
    // Same shape as the server's fmtWhen: "11 septembre a 15H13". The zone is
    // pinned so a contact reading from another time zone still sees pickup
    // times as Gatineau sees them, like every server-rendered date.
    function fmtWhen(ms) {
      const fr = document.documentElement.lang === 'fr';
      const s = new Intl.DateTimeFormat(fr ? 'fr-CA' : 'en-CA', {
        timeZone: 'America/Toronto', day: 'numeric', month: 'long',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(new Date(ms));
      return fr ? s.replace(/(\d{1,2}) h (\d{2})/, '$1H$2') : s;
    }
    function addMessage(m) {
      if (m.id <= lastMsg || $(`.msg[data-id="${m.id}"]`, chat)) return;
      lastMsg = Math.max(lastMsg, m.id);
      $('#chat-empty')?.remove();
      const mine = m.contactId === me;
      const div = document.createElement('div');
      div.className = `msg p${m.contactId % 6}${mine ? ' mine' : ''}`; div.dataset.id = m.id;
      const by = document.createElement('span'); by.className = 'by';
      by.textContent = mine ? (T.you || (document.documentElement.lang === 'fr' ? 'Vous' : 'You')) : m.name + (m.org ? ' - ' + m.org : '');
      const at = document.createElement('span'); at.className = 'at';
      at.textContent = fmtWhen(m.at);
      div.appendChild(by); div.appendChild(at); div.appendChild(document.createTextNode(m.body));
      chat.appendChild(div); scrollChat();
    }
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ta = form.body; const text = ta.value.trim(); if (!text) return;
      ta.value = ''; ta.style.height = '';
      const r = await post(`/offres/${offerId}/messages`, { body: text });
      if (!r.ok) { toast(r.message || r.error || 'Erreur', true); ta.value = text; return; }
      if (r.message) addMessage(r.message);
    });
    form?.body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form?.body.addEventListener('input', (e) => { const t = e.target; t.style.height = 'auto'; t.style.height = Math.min(120, t.scrollHeight) + 'px'; });

    // Live updates (SSE) with polling fallback
    let es, pollTimer;
    function connect() {
      if (!('EventSource' in window)) return poll();
      es = new EventSource(`/offres/${offerId}/stream`);
      es.addEventListener('message', (e) => { try { addMessage(JSON.parse(e.data)); } catch {} });
      es.addEventListener('refresh', (e) => {
        refreshLots();
        try { const d = JSON.parse(e.data); if (d.reason === 'expired' || d.reason === 'closed') setTimeout(() => location.reload(), 800); } catch {}
      });
      es.onerror = () => { es.close(); es = null; setTimeout(connect, 5000); };
    }
    function poll() {
      clearTimeout(pollTimer);
      pollTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/offres/${offerId}/messages?after=${lastMsg}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
          const j = await res.json(); (j.messages || []).forEach(addMessage);
        } catch {}
        poll();
      }, 8000);
    }
    if (active) connect();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refreshLots(); if (active && !es) connect(); } });
  }

  // ---- admin: photo upload with browser-side resize ----
  $$('[data-photo-field]').forEach(initPhotoField);
  function initPhotoField(box) {
    const name = box.dataset.photoField;
    const multiple = box.dataset.multiple === '1';
    const max = Number(box.dataset.max || 6);
    const input = $('input[type=file]', box);
    const grid = $('.photos', box);
    const addBtn = $('.ph.add', box);
    const uploadUrl = '/admin/photos';

    function count() { return $$('.ph[data-file]', grid).length; }
    function updateAdd() { addBtn.style.display = count() >= max ? 'none' : ''; }
    function tile(file, url) {
      const div = document.createElement('div'); div.className = 'ph'; div.dataset.file = file;
      const img = document.createElement('img'); img.src = url; img.alt = '';
      const hid = document.createElement('input'); hid.type = 'hidden'; hid.name = name; hid.value = file;
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'rm'; rm.textContent = '×'; rm.setAttribute('aria-label', 'Retirer');
      rm.addEventListener('click', () => { div.remove(); updateAdd(); });
      div.append(img, hid, rm); grid.insertBefore(div, addBtn); updateAdd();
    }
    $$('.ph[data-file]', grid).forEach((div) => $('.rm', div)?.addEventListener('click', () => { div.remove(); updateAdd(); }));
    addBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []).slice(0, Math.max(0, max - count()));
      input.value = '';
      for (const f of files) {
        const ph = document.createElement('div'); ph.className = 'ph uploading'; grid.insertBefore(ph, addBtn);
        try {
          const blob = await resize(f, 1600, 0.82);
          const res = await fetch(uploadUrl, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg', 'X-CSRF': csrf() }, body: blob });
          const j = await res.json();
          if (!res.ok || !j.file) throw new Error(j.error || 'upload');
          if (!multiple) $$('.ph[data-file]', grid).forEach((d) => d.remove());
          ph.remove(); tile(j.file, URL.createObjectURL(blob));
        } catch (e) { ph.remove(); toast('Photo: ' + (e.message || 'erreur'), true); }
      }
    });
    updateAdd();
  }

  /** Resize an image File to a JPEG Blob (max side px). Strips EXIF as a side effect. */
  async function resize(file, maxSide, quality) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
    const img = bmp || await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    const w = img.width, h = img.height;
    const k = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  }

  // ---- admin: recipients select all / none, counter ----
  const recip = $('#recipients');
  if (recip) {
    const boxes = () => $$('input[type=checkbox][name=contacts]', recip);
    const btn = $('#send-btn');
    const tpl = btn?.dataset.tpl || '{n}';
    const update = () => { const n = boxes().filter((b) => b.checked).length; if (btn) { btn.textContent = tpl.replace('{n}', n); btn.disabled = n === 0; } };
    recip.addEventListener('change', update);
    $('#sel-all')?.addEventListener('click', () => { boxes().forEach((b) => (b.checked = true)); update(); });
    $('#sel-none')?.addEventListener('click', () => { boxes().forEach((b) => (b.checked = false)); update(); });
    update();
    $('#publish-form')?.addEventListener('submit', (e) => { if (!confirm(btn.dataset.confirm)) e.preventDefault(); else btn.classList.add('busy'); });
  }

  // ---- copy to clipboard ----
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const el = $(b.dataset.copy); if (!el) return;
    try { await navigator.clipboard.writeText(el.textContent.trim()); toast(b.dataset.done || 'OK'); }
    catch { const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  }));

  // ---- SMS template live preview (confirm page + settings) ----
  const gsm = (t) => t.replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...');
  $$('[data-sms-template]').forEach((ta) => {
    const lang = ta.dataset.smsTemplate;
    const box = ta.closest('[data-sample]');
    const sample = JSON.parse(box?.dataset.sample || '{}');
    const vars = { first: lang === 'fr' ? 'Marie' : 'John', org: lang === 'fr' ? 'Église de la Grâce' : 'Hope Church', title: sample.title || '…', n: sample.n ?? 4, url: sample.url || 'https://…' };
    const prev = $(`[data-sms-preview="${lang}"]`, box), cnt = $(`[data-sms-count="${lang}"]`, box);
    const render = () => {
      let out = ta.value; for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v);
      out = gsm(out);
      if (prev) prev.textContent = out;
      if (cnt) { const n = out.length; cnt.textContent = `${n} car. · ${n <= 160 ? '1 SMS' : Math.ceil(n / 153) + ' SMS'}`; }
    };
    ta.addEventListener('input', render); render();
    $(`[data-reset-template="${lang}"]`)?.addEventListener('click', (e) => { ta.value = e.target.dataset.default; render(); });
  });

  // ---- reset pickup to defaults ----
  $('#reset-pickup')?.addEventListener('click', (e) => {
    const d = JSON.parse(e.target.dataset.defaults || '{}');
    for (const k of ['pickup_name', 'pickup_address', 'pickup_details']) { const el = document.querySelector(`[name=${k}]`); if (el) el.value = d[k] || ''; }
  });
})();
