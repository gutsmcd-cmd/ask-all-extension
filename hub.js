// Ask All (PC) - Hub page.
(() => {
  const $ = (id) => document.getElementById(id);
  const A = globalThis.AskAll;
  const SITES = A.SITES;
  const nameOf = (id) => (A.siteById(id) || { name: id }).name;

  let settings = null;
  let round = null;            // the round being shown
  const running = {};          // siteId -> true while a site is working
  let combining = false;

  // ---------- helpers ----------
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
    return { idle: 'idle', opening: 'opening tab', typing: 'typing', waiting: 'waiting for answer', done: 'done', error: 'error', timeout: 'timeout' }[st] || st;
  }

  function anyRunning() { return combining || Object.values(running).some(Boolean); }

  function refreshButtons() {
    $('sendBtn').disabled = anyRunning();
    $('sendBtn').textContent = Object.values(running).some(Boolean) ? 'Working…' : 'Send to all';
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
    else body.innerHTML = '<span class="muted">' + (a.status === 'idle' ? 'Waiting for a question.' : (a.status === 'error' || a.status === 'timeout') ? 'No answer.' : '…') + '</span>';
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
  async function runOne(id) {
    running[id] = true;
    refreshButtons();
    const r = round;
    r.answers[id] = { status: 'opening', text: '', error: null, detail: '' };
    paint(id);
    const res = await A.runSite(id, r.prompt, {
      settings,
      fresh: settings.newChatEachRound,
      update: (patch) => {
        Object.assign(r.answers[id], patch);
        if (round === r) paint(id);
      }
    });
    Object.assign(r.answers[id], { status: res.status, text: res.text, error: res.error, detail: res.detail, tabId: res.tabId, ms: Date.now() - res.startedAt });
    running[id] = false;
    if (round === r) paint(id);
    await A.putRound(r);
    refreshButtons();
    renderHistory();
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
    for (const id of sites) round.answers[id] = { status: 'opening', text: '' };
    renderPanels();
    renderCombined();
    $('roundInfo').textContent = 'Sent ' + new Date(round.ts).toLocaleTimeString() + (factCheck ? ' · fact-check mode' : '');
    await A.putRound(round);
    renderHistory();
    // All sites in parallel. Each one is sent exactly once; use Retry to send again.
    await Promise.all(sites.map((id) => runOne(id)));
  }

  async function retry(id) {
    if (!round || anyRunning()) return;
    await runOne(id);
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
    else if (c) body.innerHTML = '<span class="muted">…</span>';
    else body.innerHTML = '<span class="muted">Press Combine after the answers are in. The answers are sent as Answer A, B, C… so the combining AI doesn\'t know which AI wrote which.</span>';
  }

  async function combine() {
    if (!round || anyRunning()) return;
    const answers = round.sites
      .filter((id) => round.answers[id] && round.answers[id].status === 'done' && round.answers[id].text)
      .map((id) => ({ siteId: id, text: round.answers[id].text }));
    if (answers.length < 2) return;
    const siteId = $('combiner').value;
    const { prompt, mapping } = A.buildCombinePrompt(round.question, answers, round.factCheck);
    const r = round;
    r.combined = { siteId, mapping, prompt, status: 'opening', text: '', error: null };
    combining = true;
    refreshButtons();
    renderCombined();
    const res = await A.runSite(siteId, prompt, {
      settings,
      fresh: true, // always a NEW chat for the combined answer
      update: (patch) => {
        Object.assign(r.combined, patch);
        if (round === r) renderCombined();
      }
    });
    Object.assign(r.combined, { status: res.status, text: res.text, error: res.error, detail: res.detail, tabId: res.tabId });
    combining = false;
    if (round === r) renderCombined();
    await A.putRound(r);
    refreshButtons();
    renderHistory();
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

  // ---------- init ----------
  async function init() {
    settings = await A.getSettings();
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
      if (anyRunning() || !confirm('Delete all saved rounds from this PC?')) return;
      await A.clearHistory();
      renderHistory();
    });
    $('historyToggle').addEventListener('click', () => $('history').classList.toggle('hidden'));
    // Settings changed in the other page (e.g. timeout) -> pick them up.
    chrome.storage.onChanged.addListener(async (ch, area) => {
      if (area === 'local' && ch.settings) settings = await A.getSettings();
    });
    renderPanels();
    renderCombined();
    renderHistory();
    $('question').focus();
  }

  window.addEventListener('beforeunload', (e) => {
    if (anyRunning()) { e.preventDefault(); e.returnValue = ''; }
  });

  init();
})();
