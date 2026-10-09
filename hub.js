// Ask All - Hub page.
// Chrome: the Hub page runs each job itself (as before).
// Firefox: the background page runs it (AskAllEnv.hasBackgroundRunner) and the Hub
// shows progress from storage, so a round keeps going while this tab is hidden
// (on Android, hidden tabs are frozen).
(() => {
  const $ = (id) => document.getElementById(id);
  const A = globalThis.AskAll;
  const ext = globalThis.ext || globalThis.chrome;
  const ENV = globalThis.AskAllEnv;
  const SITES = A.SITES;
  const nameOf = (id) => (A.siteById(id) || { name: id }).name;

  let settings = null;
  let round = null;            // the round being shown
  let jobActive = false;       // a send / retry / combine is in progress
  let jobKind = null;
  let localCancel = null;      // Chrome: cancel flag of the job running in this page
  let hubTabId = null;
  const bgMode = !!(ENV && ENV.hasBackgroundRunner);

  // ---------- helpers ----------
  function muted(el, text) {
    el.textContent = '';
    const sp = document.createElement('span');
    sp.className = 'muted';
    sp.textContent = text;
    el.appendChild(sp);
  }

  function renderText(el, text) {
    el.textContent = '';
    const re = /https?:\/\/[^\s<>()\[\]"']+[^\s<>()\[\]"'.,;:!?]/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      el.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement('a');
      a.href = m[0];
      a.textContent = m[0];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      el.appendChild(a);
      last = m.index + m[0].length;
    }
    el.appendChild(document.createTextNode(text.slice(last)));
  }

  function statusLabel(st) {
    return { idle: 'idle', queued: 'waiting its turn', opening: 'opening tab', typing: 'typing', waiting: 'waiting for answer', done: 'done', error: 'error', timeout: 'timeout', stopped: 'stopped' }[st] || st;
  }

  function anyRunning() { return jobActive; }

  function isSequential() {
    const m = settings.runMode || 'auto';
    return m === 'sequential' || (m === 'auto' && !!ENV.isAndroid);
  }

  function refreshButtons() {
    $('sendBtn').disabled = anyRunning();
    $('sendBtn').textContent = jobActive && jobKind !== 'combine' ? 'Working…' : 'Send to all';
    $('stopBtn').hidden = !jobActive;
    const doneCount = round ? Object.values(round.answers).filter((a) => a.status === 'done' && a.text).length : 0;
    $('combineBtn').disabled = anyRunning() || doneCount < 2;
    $('combineBtn').title = doneCount < 2 ? 'Needs at least 2 finished answers' : '';
    document.querySelectorAll('[data-retry]').forEach((b) => { b.disabled = !round || anyRunning(); });
  }

  // ---------- site toggles ----------
  function renderToggles() {
    const box = $('siteToggles');
    box.textContent = '';
    for (const s of SITES) {
      const lab = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!settings.enabled[s.id];
      cb.dataset.site = s.id;
      lab.className = cb.checked ? 'on' : '';
      cb.addEventListener('change', async () => {
        settings.enabled[s.id] = cb.checked;
        lab.className = cb.checked ? 'on' : '';
        await A.saveSettings({ enabled: settings.enabled });
        if (!round) renderPanels();
      });
      lab.append(cb, document.createTextNode(s.name + (s.defaultOn ? '' : ' (optional)')));
      box.appendChild(lab);
    }
    const sel = $('combiner');
    sel.textContent = '';
    for (const s of SITES) {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.name;
      sel.appendChild(o);
    }
    sel.value = settings.combiner;
  }

  // ---------- panels ----------
  function panelSites() {
    return round ? round.sites : SITES.filter((s) => settings.enabled[s.id]).map((s) => s.id);
  }

  function renderPanels() {
    const box = $('panels');
    box.textContent = '';
    for (const id of panelSites()) {
      const p = document.createElement('div');
      p.className = 'panel';
      p.id = 'panel-' + id;
      p.dataset.site = id;
      p.innerHTML =
        '<div class="phead"><span class="pname"></span><span class="badge"></span><span class="spacer"></span>' +
        '<button class="mini" data-copy>Copy</button><button class="mini" data-retry>Retry</button><button class="mini" data-go>Go to tab</button></div>' +
        '<div class="perr"></div><div class="pbody"></div>';
      p.querySelector('.pname').textContent = nameOf(id);
      p.querySelector('[data-copy]').addEventListener('click', () => copy(answerOf(id).text, p.querySelector('[data-copy]')));
      p.querySelector('[data-retry]').addEventListener('click', () => retry(id));
      p.querySelector('[data-go]').addEventListener('click', () => goTo(id, answerOf(id).tabId));
      box.appendChild(p);
      paint(id);
    }
    refreshButtons();
  }

  function answerOf(id) { return (round && round.answers[id]) || { status: 'idle', text: '' }; }

  function paint(id) {
    const p = $('panel-' + id);
    if (!p) return;
    const a = answerOf(id);
    const badge = p.querySelector('.badge');
    badge.className = 'badge ' + a.status;
    badge.textContent = statusLabel(a.status);
    p.querySelector('.perr').textContent = a.error ? (A.ERRORS[a.error] || a.error) + (a.detail ? ' (' + a.detail + ')' : '') : '';
    const body = p.querySelector('.pbody');
    if (a.text) renderText(body, a.text);
    else muted(body, a.status === 'idle' ? 'Waiting for a question.' : (a.status === 'error' || a.status === 'timeout' || a.status === 'stopped') ? 'No answer.' : a.status === 'queued' ? 'Waiting for its turn.' : '…');
  }

  async function copy(text, btn) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = old; }, 1200);
  }

  async function goTo(siteId, tabId) {
    if (!(await A.focusTab(tabId))) {
      const t = await A.tabForSite(siteId);
      if (!(await A.focusTab(t))) alert('No open tab for ' + nameOf(siteId) + '.');
    }
  }

  // ---------- running ----------
  function paintAll() {
    if (!round) return;
    for (const id of round.sites) paint(id);
    renderCombined();
    refreshButtons();
  }

  // A job changed the round (called directly in Chrome, via storage in Firefox).
  function applyLive(r) {
    if (round && round.id === r.id && round !== r) {
      round.answers = r.answers;
      round.combined = r.combined;
    }
    if (round && round.id === r.id) paintAll();
  }

  function jobDone() {
    jobActive = false;
    jobKind = null;
    localCancel = null;
    refreshButtons();
    renderHistory();
  }

  async function startJob(job) {
    jobActive = true;
    jobKind = job.kind;
    refreshButtons();
    job.settings = settings;
    job.sequential = isSequential();
    job.hubTabId = hubTabId;
    if (bgMode) {
      let res = null;
      try { res = await ext.runtime.sendMessage({ type: 'askall:run', job: JSON.parse(JSON.stringify(job)) }); } catch (e) { res = { ok: false, error: String(e.message || e) }; }
      if (!res || !res.ok) {
        jobDone();
        alert(res && res.error === 'busy' ? 'Ask All is still working on another question. Wait for it, or press Stop.' : 'Could not start: ' + ((res && res.error) || 'unknown error'));
      }
      return; // progress and the end arrive through storage (liveRound)
    }
    localCancel = { stopped: false };
    job.cancel = localCancel;
    try {
      await A.runJob(job, { publish: (r) => applyLive(r) });
    } finally {
      jobDone();
    }
  }

  async function stop() {
    if (!jobActive) return;
    $('stopBtn').disabled = true;
    if (bgMode) { try { await ext.runtime.sendMessage({ type: 'askall:stop' }); } catch (e) { /* ignore */ } }
    else if (localCancel) localCancel.stopped = true;
    setTimeout(() => { $('stopBtn').disabled = false; }, 1500);
  }

  async function send() {
    const q = $('question').value.trim();
    if (!q || anyRunning()) return;
    const sites = SITES.filter((s) => settings.enabled[s.id]).map((s) => s.id);
    if (!sites.length) { alert('Turn on at least one site.'); return; }
    const factCheck = $('factCheck').checked;
    round = {
      id: 'r' + Date.now(),
      ts: Date.now(),
      question: q,
      factCheck,
      prompt: factCheck ? A.factCheckPrompt(q) : q,
      sites,
      answers: {},
      combined: null
    };
    const seq = isSequential();
    for (const id of sites) round.answers[id] = { status: seq ? 'queued' : 'opening', text: '' };
    renderPanels();
    renderCombined();
    $('roundInfo').textContent = 'Sent ' + new Date(round.ts).toLocaleTimeString() + (factCheck ? ' · fact-check mode' : '') +
      (seq ? ' · one at a time: each site comes to the front while it answers, then you come back here' : '');
    await A.putRound(round);
    renderHistory();
    if (document.body.classList.contains('phone')) $('panels').scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Each site is sent exactly once; use Retry to send again.
    // All at once on a computer; one at a time (tab in front) on Android.
    await startJob({ kind: 'round', round });
  }

  async function retry(id) {
    if (!round || anyRunning()) return;
    await startJob({ kind: 'retry', round, siteId: id });
  }

  // ---------- combine ----------
  function renderCombined() {
    const c = round && round.combined;
    const badge = $('combinedStatus');
    badge.className = 'badge ' + (c ? c.status : 'idle');
    badge.textContent = statusLabel(c ? c.status : 'idle');
    $('combinedErr').textContent = c && c.error ? (A.ERRORS[c.error] || c.error) + (c.detail ? ' (' + c.detail + ')' : '') : '';
    const m = $('mapping');
    m.textContent = '';
    if (c && c.mapping) {
      m.append('Only you see this key: ');
      Object.entries(c.mapping).forEach(([letter, id], i) => {
        if (i) m.append(' · ');
        const b = document.createElement('b');
        b.textContent = 'Answer ' + letter;
        m.append(b, ' = ' + nameOf(id));
      });
      m.append(' · written by ' + nameOf(c.siteId));
    }
    const body = $('combinedBody');
    if (c && c.text) renderText(body, c.text);
    else if (c) muted(body, '…');
    else muted(body, 'Press Combine after the answers are in. The answers are sent as Answer A, B, C… so the combining AI doesn\'t know which AI wrote which.');
  }

  async function combine() {
    if (!round || anyRunning()) return;
    const answers = round.sites
      .filter((id) => round.answers[id] && round.answers[id].status === 'done' && round.answers[id].text)
      .map((id) => ({ siteId: id, text: round.answers[id].text }));
    if (answers.length < 2) return;
    const siteId = $('combiner').value;
    const { prompt, mapping } = A.buildCombinePrompt(round.question, answers, round.factCheck);
    round.combined = { siteId, mapping, prompt, status: 'opening', text: '', error: null };
    renderCombined();
    if (document.body.classList.contains('phone')) $('combinedPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    await startJob({ kind: 'combine', round }); // always a NEW chat for the combined answer
  }

  // ---------- history ----------
  async function renderHistory() {
    const list = $('historyList');
    const h = await A.getHistory();
    list.textContent = '';
    if (!h.length) {
      list.innerHTML = '<li class="muted small" style="cursor:default">No rounds yet.</li>';
      return;
    }
    for (const r of h) {
      const li = document.createElement('li');
      li.dataset.id = r.id;
      if (round && round.id === r.id) li.className = 'active';
      const q = document.createElement('div');
      q.className = 'q';
      q.textContent = r.question;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const done = Object.values(r.answers || {}).filter((a) => a.status === 'done').length;
      meta.textContent = new Date(r.ts).toLocaleString() + ' · ' + done + '/' + (r.sites || []).length + ' answers' +
        (r.combined && r.combined.status === 'done' ? ' · combined' : '') + (r.factCheck ? ' · fact-check' : '');
      li.append(q, meta);
      li.addEventListener('click', () => {
        if (anyRunning()) return;
        round = JSON.parse(JSON.stringify(r));
        $('question').value = r.question;
        $('factCheck').checked = !!r.factCheck;
        $('roundInfo').textContent = 'From history · ' + new Date(r.ts).toLocaleString();
        renderPanels();
        renderCombined();
        renderHistory();
      });
      list.appendChild(li);
    }
  }

  // ---------- layout (phones) ----------
  // ?phone=1 in the Hub's address previews the phone layout on a computer.
  const forcePhone = new URLSearchParams(location.search).get('phone') === '1';
  function isPhone() {
    if (forcePhone) return true;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return !!ENV.isAndroid || (coarse && Math.min(screen.width, screen.height) < 700);
  }

  function applyLayout() {
    const b = document.body;
    const phone = isPhone();
    const lay = settings.layout || 'auto';
    b.classList.toggle('phone', phone);
    b.classList.toggle('touch', phone || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
    b.classList.toggle('layout-landscape', lay === 'landscape');
    b.classList.toggle('layout-portrait', lay === 'portrait');
    $('layoutBtn').hidden = !phone && lay === 'auto';
    $('layoutBtn').textContent = lay === 'landscape' ? 'Layout: landscape' : lay === 'portrait' ? 'Layout: portrait' : 'Layout';
    updateRotateHint();
  }

  function updateRotateHint() {
    const portraitScreen = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
    $('rotateHint').hidden = !(settings.layout === 'landscape' && portraitScreen && isPhone());
  }

  async function setLayout(lay) {
    settings = await A.saveSettings({ layout: lay, layoutChosen: true });
    $('chooser').hidden = true;
    applyLayout();
  }

  function showChooser() {
    $('chooserNote').textContent = isSequential()
      ? 'On a phone, Ask All asks the sites one at a time: each site\'s tab comes to the front while it answers, then you\'re brought back here.'
      : '';
    $('chooser').hidden = false;
  }

  // Firefox: pick up a round the background is (or was) running.
  async function syncWithBackground() {
    if (!bgMode) return;
    let st = null;
    try { st = await ext.runtime.sendMessage({ type: 'askall:status' }); } catch (e) { st = null; }
    if (st && st.busy && st.round) {
      if (!round || round.id !== st.round.id) {
        round = st.round;
        $('question').value = round.question;
        $('factCheck').checked = !!round.factCheck;
        $('roundInfo').textContent = 'Working · started ' + new Date(round.ts).toLocaleTimeString();
        renderPanels();
        renderCombined();
      }
      jobActive = true;
      applyLive(st.round);
    } else if (jobActive && st && !st.busy) {
      const { liveRound } = await ext.storage.local.get('liveRound');
      if (liveRound && round && liveRound.id === round.id) applyLive(liveRound);
      jobDone();
    }
  }

  // ---------- init ----------
  async function init() {
    await ENV.platform();
    settings = await A.getSettings();
    try { const me = await ext.tabs.getCurrent(); hubTabId = me ? me.id : null; } catch (e) { hubTabId = null; }
    applyLayout();
    if (isPhone()) {
      $('history').classList.add('hidden');
      $('historyNote').textContent = 'Last 50 rounds, kept only on this device.';
      $('question').placeholder = 'Type your question (or paste a claim to fact-check)…';
      if (!settings.layoutChosen) showChooser();
    }
    document.querySelectorAll('#chooser [data-layout]').forEach((b) => b.addEventListener('click', () => setLayout(b.dataset.layout)));
    $('layoutBtn').addEventListener('click', showChooser);
    $('usePortrait').addEventListener('click', () => setLayout('portrait'));
    window.addEventListener('resize', updateRotateHint);
    $('stopBtn').addEventListener('click', stop);
    renderToggles();
    $('factCheck').checked = !!settings.factCheck;
    $('newChat').checked = !!settings.newChatEachRound;
    $('factCheck').addEventListener('change', () => A.saveSettings({ factCheck: $('factCheck').checked }));
    $('newChat').addEventListener('change', async () => { settings = await A.saveSettings({ newChatEachRound: $('newChat').checked }); });
    $('combiner').addEventListener('change', async () => { settings = await A.saveSettings({ combiner: $('combiner').value }); });
    $('sendBtn').addEventListener('click', send);
    $('question').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
    $('combineBtn').addEventListener('click', combine);
    $('combinedCopy').addEventListener('click', () => copy(round && round.combined ? round.combined.text : '', $('combinedCopy')));
    $('combinedGo').addEventListener('click', () => round && round.combined && goTo(round.combined.siteId, round.combined.tabId));
    $('clearHistory').addEventListener('click', async () => {
      if (anyRunning() || !confirm('Delete all saved rounds from this ' + (isPhone() ? 'device' : 'PC') + '?')) return;
      await A.clearHistory();
      renderHistory();
    });
    $('historyToggle').addEventListener('click', () => $('history').classList.toggle('hidden'));
    // Settings changed in the other page (e.g. timeout) -> pick them up.
    ext.storage.onChanged.addListener(async (ch, area) => {
      if (area !== 'local') return;
      if (ch.settings) { settings = await A.getSettings(); applyLayout(); }
      if (bgMode && ch.liveRound && ch.liveRound.newValue) {
        const live = ch.liveRound.newValue;
        if (round && live.id === round.id) {
          applyLive(live);
          if (live._finished) jobDone();
        }
      }
    });
    // Coming back to this tab (Android unfreezes it): catch up with the background.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncWithBackground(); });
    renderPanels();
    renderCombined();
    renderHistory();
    await syncWithBackground();
    if (!isPhone()) $('question').focus();
  }

  window.addEventListener('beforeunload', (e) => {
    // In Firefox the background keeps working, so closing the Hub is fine.
    if (anyRunning() && !bgMode) { e.preventDefault(); e.returnValue = ''; }
  });

  init();
})();
