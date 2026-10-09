// Ask All - shared logic for the Hub and Settings pages (and, in Firefox, the
// background page). Opens/finds the site tabs, injects content.js, sends the
// question once, then reads the newest reply until it is finished.
// Uses `ext` from compat.js (browser.* in Firefox, chrome.* in Chrome).

const AskAll = (() => {
  const ext = globalThis.ext || globalThis.chrome;
  const ENV = globalThis.AskAllEnv || { isFirefox: false, hasWindows: true, isAndroid: false, platform: async () => ({ android: false }) };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SITES = globalThis.ASK_ALL_SITES;
  const siteById = (id) => SITES.find((s) => s.id === id);

  const ERRORS = {
    not_logged_in: 'Not logged in. Click "Go to tab", log in, then Retry.',
    composer_not_found: 'Could not find the message box. The site may have changed its layout (fix it in Settings), or the page is still loading.',
    type_failed: 'Found the message box but could not type into it (see Settings).',
    send_failed: 'Typed the question but it did not send. Check the tab.',
    busy: 'The site is still answering something else. Wait, then Retry.',
    timeout: 'Timed out waiting for the answer. Any partial answer is shown.',
    tab_closed: 'The tab was closed.',
    no_access: 'Could not access the page (it may be a login or error page).',
    load_timeout: 'The page took too long to load.',
    stopped: 'Stopped before it finished.'
  };

  // ---------- storage ----------
  async function getSettings() {
    const { settings } = await ext.storage.local.get('settings');
    // Settings added for Firefox / phones (kept here so sites.js stays selector-only):
    //   runMode 'auto' = all at once on a computer, one at a time on Android
    //   (Android freezes tabs that are not on screen); layout 'auto' = computer grid.
    const d = Object.assign({ runMode: 'auto', returnToHub: true, layout: 'auto', layoutChosen: false }, globalThis.ASK_ALL_DEFAULT_SETTINGS);
    const s = Object.assign({}, d, settings || {});
    s.enabled = Object.assign({}, d.enabled, (settings && settings.enabled) || {});
    return s;
  }
  async function saveSettings(patch) {
    const s = await getSettings();
    Object.assign(s, patch);
    await ext.storage.local.set({ settings: s });
    return s;
  }
  async function getOverrides() {
    const { overrides } = await ext.storage.local.get('overrides');
    return overrides || {};
  }
  async function cfgFor(siteId) {
    return globalThis.askAllSiteConfig(siteId, await getOverrides());
  }

  async function getHistory() {
    const { history } = await ext.storage.local.get('history');
    return Array.isArray(history) ? history : [];
  }
  async function putRound(round) {
    const h = await getHistory();
    const i = h.findIndex((r) => r.id === round.id);
    const copy = JSON.parse(JSON.stringify(round));
    if (i >= 0) h[i] = copy; else h.unshift(copy);
    h.sort((a, b) => b.ts - a.ts);
    await ext.storage.local.set({ history: h.slice(0, 50) });
  }
  async function clearHistory() { await ext.storage.local.set({ history: [] }); }

  // ---------- tabs ----------
  const hostOk = (site, url) => {
    try { return site.hosts.includes(new URL(url).hostname); } catch (e) { return false; }
  };

  async function rememberTab(siteId, tabId) {
    const { tabIds } = await ext.storage.session.get('tabIds');
    const t = tabIds || {};
    t[siteId] = tabId;
    await ext.storage.session.set({ tabIds: t });
  }

  async function existingTab(site) {
    const { tabIds } = await ext.storage.session.get('tabIds');
    const id = tabIds && tabIds[site.id];
    if (id != null) {
      try {
        const t = await ext.tabs.get(id);
        if (hostOk(site, t.url || t.pendingUrl || '')) return t;
      } catch (e) { /* closed */ }
    }
    const tabs = await ext.tabs.query({ url: site.match });
    if (!tabs.length) return null;
    tabs.sort((a, b) => (b.pinned - a.pinned) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
    return tabs[0];
  }

  async function waitComplete(tabId, ms) {
    const t0 = Date.now();
    // give a just-started navigation a moment to switch to "loading"
    while (Date.now() - t0 < 1500) {
      const t = await ext.tabs.get(tabId);
      if (t.status === 'loading') break;
      await sleep(100);
    }
    while (Date.now() - t0 < ms) {
      const t = await ext.tabs.get(tabId);
      if (t.status === 'complete') return t;
      await sleep(250);
    }
    return null;
  }

  // Find the site's tab (or open a pinned background one) and optionally go to a new chat.
  // active: bring the tab to the front (one-at-a-time mode; needed on Android,
  // where tabs that are not on screen are frozen and never finish their answer).
  async function prepareTab(site, cfg, { fresh, pin, active }) {
    let tab = await existingTab(site);
    if (!tab) {
      const props = { url: cfg.newChatUrl, active: !!active };
      if (pin && !ENV.isAndroid) props.pinned = true; // no pinned tabs on Android
      tab = await ext.tabs.create(props);
    } else if (fresh || active) {
      const upd = {};
      if (fresh) upd.url = cfg.newChatUrl;
      if (active) upd.active = true;
      await ext.tabs.update(tab.id, upd);
    }
    await rememberTab(site.id, tab.id);
    const done = await waitComplete(tab.id, 45000);
    if (!done) return { tab, error: 'load_timeout' };
    if (!hostOk(site, done.url)) {
      return { tab, error: 'not_logged_in', detail: 'The tab went to ' + new URL(done.url).hostname };
    }
    return { tab: done };
  }

  async function call(tabId, action, ...args) {
    await ext.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    const [res] = await ext.scripting.executeScript({
      target: { tabId },
      func: (a, xs) => window.__askAll[a](...xs),
      args: [action, args]
    });
    return res ? res.result : undefined;
  }

  async function focusTab(tabId) {
    if (tabId == null) return false;
    try {
      const t = await ext.tabs.update(tabId, { active: true });
      if (ENV.hasWindows && t && t.windowId != null) {
        try { await ext.windows.update(t.windowId, { focused: true }); } catch (e) { /* ignore */ }
      }
      return true;
    } catch (e) { return false; }
  }

  async function tabForSite(siteId) {
    const site = siteById(siteId);
    const t = site && (await existingTab(site));
    return t ? t.id : null;
  }

  // ---------- one site, one question ----------
  // update(patch) is called with {status, text, error, detail, tabId}
  async function runSite(siteId, prompt, opts) {
    const update = opts.update || (() => {});
    const settings = opts.settings || (await getSettings());
    const site = siteById(siteId);
    const cfg = await cfgFor(siteId);
    const result = { status: 'error', text: '', error: null, detail: '', tabId: null, startedAt: Date.now() };
    const fail = (code, detail, text) => {
      Object.assign(result, { status: code === 'timeout' ? 'timeout' : 'error', error: code, detail: detail || '', text: text || result.text });
      update({ status: result.status, error: code, detail: result.detail, text: result.text });
      return result;
    };
    try {
      update({ status: 'opening', text: '', error: null, detail: '' });
      const prep = await prepareTab(site, cfg, { fresh: opts.fresh, pin: opts.pin != null ? opts.pin : settings.pinTabs, active: !!opts.active });
      result.tabId = prep.tab && prep.tab.id;
      update({ tabId: result.tabId });
      if (prep.error) return fail(prep.error, prep.detail);

      update({ status: 'typing' });
      let sent;
      try {
        sent = await call(result.tabId, 'send', cfg, prompt);
      } catch (e) {
        return fail('no_access', String(e.message || e));
      }
      if (!sent) return fail('no_access', 'The page reloaded while typing.');
      if (!sent.ok) return fail(sent.error, sent.detail);

      update({ status: 'waiting', detail: '' });
      const timeoutMs = (settings.timeoutSec || 180) * 1000;
      const stableMs = cfg.stableMs || 2000;
      const t0 = Date.now();
      let lastText = '';
      let lastChange = Date.now();
      let lastBusy = Date.now();
      while (true) {
        await sleep(settings.pollMs || 700);
        if (opts.cancel && opts.cancel.stopped) {
          Object.assign(result, { status: 'stopped', error: 'stopped', text: lastText });
          update({ status: 'stopped', error: 'stopped', text: lastText });
          return result;
        }
        let r;
        try {
          await ext.tabs.get(result.tabId);
        } catch (e) { return fail('tab_closed', '', lastText); }
        try { r = await call(result.tabId, 'read', cfg); } catch (e) { r = null; }
        const now = Date.now();
        if (r) {
          if (r.generating) lastBusy = now;
          const isNew = r.count > sent.baseCount || (sent.baseCount > 0 && r.count >= sent.baseCount && r.text !== sent.baseText);
          if (isNew && r.text && r.text !== lastText) {
            lastText = r.text;
            lastChange = now;
            result.text = lastText;
            update({ text: lastText });
          }
          if (isNew && lastText && !r.generating && now - Math.max(lastChange, lastBusy) >= stableMs) {
            result.status = 'done';
            result.finishedAt = now;
            update({ status: 'done', text: lastText });
            return result;
          }
        }
        if (now - t0 > timeoutMs) return fail('timeout', 'No finished answer after ' + Math.round(timeoutMs / 1000) + ' s.', lastText);
      }
    } catch (e) {
      return fail('no_access', String((e && e.message) || e));
    }
  }

  // Settings > Test site: find the tab (do not navigate if it is open) and look for the composer.
  // returnTabId: on Android the site tab has to be in front to be checked; go back
  // to this tab (the Settings page) afterwards.
  async function testSite(siteId, returnTabId) {
    await ENV.platform();
    const site = siteById(siteId);
    const cfg = await cfgFor(siteId);
    const settings = await getSettings();
    const active = !!ENV.isAndroid;
    try {
      const prep = await prepareTab(site, cfg, { fresh: false, pin: settings.pinTabs, active });
      if (prep.error) return { ok: false, error: prep.error, detail: prep.detail, message: ERRORS[prep.error] };
      let r = null;
      const t0 = Date.now();
      while (Date.now() - t0 < 15000) {
        try { r = await call(prep.tab.id, 'probe', cfg); } catch (e) { r = { error: String(e.message || e) }; }
        if (r && r.composer) break;
        await sleep(1000);
      }
      return Object.assign({ ok: !!(r && r.composer), tabId: prep.tab.id }, r || {});
    } finally {
      if (active && returnTabId != null) await focusTab(returnTabId);
    }
  }

  // ---------- a whole job (round / retry / combine) ----------
  // Runs in the Hub page (Chrome) or in the Firefox background page.
  // job: { kind: 'round' | 'retry' | 'combine', round, siteId?, settings?, sequential?, hubTabId?, cancel? }
  // hooks.publish(round, force) is called whenever the round changes.
  const ACTIVE = ['opening', 'typing', 'waiting', 'queued'];
  async function runJob(job, hooks) {
    await ENV.platform();
    const round = job.round;
    const settings = job.settings || (await getSettings());
    const cancel = job.cancel || { stopped: false };
    const sequential = !!job.sequential;
    const pin = !!settings.pinTabs && !ENV.isAndroid && !sequential;
    const publish = (force) => { try { hooks.publish(round, force); } catch (e) { /* page gone */ } };
    const textOnly = (patch) => Object.keys(patch).every((k) => k === 'text');

    async function one(id) {
      if (cancel.stopped) {
        round.answers[id] = Object.assign(round.answers[id] || {}, { status: 'stopped', error: 'stopped', detail: '' });
        publish(true);
        return;
      }
      round.answers[id] = Object.assign({ text: '' }, round.answers[id] || {}, { status: 'opening', text: '', error: null, detail: '' });
      publish(true);
      const res = await runSite(id, round.prompt, {
        settings, pin, cancel,
        fresh: settings.newChatEachRound,
        active: sequential,
        update: (patch) => { Object.assign(round.answers[id], patch); publish(!textOnly(patch)); }
      });
      Object.assign(round.answers[id], { status: res.status, text: res.text, error: res.error, detail: res.detail, tabId: res.tabId, ms: Date.now() - res.startedAt });
      publish(true);
      await putRound(round);
    }

    try {
      if (job.kind === 'round') {
        if (sequential) {
          for (const id of round.sites) round.answers[id] = { status: 'queued', text: '' };
          publish(true);
          for (const id of round.sites) await one(id);
        } else {
          await Promise.all(round.sites.map((id) => one(id)));
        }
      } else if (job.kind === 'retry') {
        await one(job.siteId);
      } else if (job.kind === 'combine') {
        const c = round.combined;
        const res = await runSite(c.siteId, c.prompt, {
          settings, pin, cancel,
          fresh: true, // always a NEW chat for the combined answer
          active: sequential,
          update: (patch) => { Object.assign(c, patch); publish(!textOnly(patch)); }
        });
        Object.assign(c, { status: res.status, text: res.text, error: res.error, detail: res.detail, tabId: res.tabId });
        publish(true);
        await putRound(round);
      }
    } finally {
      // One-at-a-time mode moved the site tabs to the front: come back to the Hub.
      if (sequential && job.hubTabId != null && settings.returnToHub !== false) await focusTab(job.hubTabId);
    }
    return round;
  }

  // ---------- prompts ----------
  function factCheckPrompt(q) {
    const today = new Date().toISOString().slice(0, 10);
    return [
      'Fact-check the text below. Today\'s date is ' + today + '.',
      '',
      '1. List each separate factual claim it makes.',
      '2. For each claim give a verdict: True, False, Outdated (was true earlier but is not now), or Unclear.',
      '3. Explain each verdict in 1-3 sentences, with the relevant dates (when it was true, when it changed).',
      '4. Give source links (full URLs) for each claim, preferring primary sources and recent data.',
      '5. End with a short overall verdict.',
      '',
      'Text to check:',
      '"""',
      q,
      '"""'
    ].join('\n');
  }

  function shuffle(a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }

  // answers: [{siteId, text}] -> {prompt, mapping: {A: siteId, ...}}
  function buildCombinePrompt(question, answers, factCheck) {
    const order = shuffle(answers);
    const mapping = {};
    const blocks = order.map((a, i) => {
      const letter = String.fromCharCode(65 + i);
      mapping[letter] = a.siteId;
      return '=== Answer ' + letter + ' ===\n' + a.text.trim();
    });
    const letters = Object.keys(mapping).join(', ');
    const prompt = [
      'Below are ' + order.length + ' answers (' + letters + ') from different AI assistants to the same question. ' +
        'They are anonymised on purpose: judge them only on content and do not guess which assistant wrote which.',
      '',
      'Write your reply with exactly these sections:',
      '1. Combined best answer - the most accurate, complete answer you can build from them (fix anything wrong).',
      '2. Strongest agreement - the points most or all answers agree on.',
      '3. Disagreements - where they conflict, citing the letters (e.g. "A and C say X, B says Y") and which side looks right.',
      '4. Points only one answer made - with its letter, and whether it seems valid.',
      '5. Likely errors / things to double-check - mistakes, unsupported claims, missing or doubtful sources.',
      '6. Possibly outdated - anything that may have been true earlier but is out of date now (give dates where you can).',
      '',
      'Today\'s date is ' + new Date().toISOString().slice(0, 10) + '.' + (factCheck ? ' The question was a fact-check request, so keep the True / False / Outdated / Unclear verdicts and the source links in the combined answer.' : ''),
      '',
      '=== Question ===',
      question.trim(),
      '',
      blocks.join('\n\n')
    ].join('\n');
    return { prompt, mapping };
  }

  return {
    SITES, siteById, ERRORS, sleep,
    getSettings, saveSettings, getOverrides, cfgFor,
    getHistory, putRound, clearHistory,
    runSite, runJob, ACTIVE, testSite, focusTab, tabForSite,
    factCheckPrompt, buildCombinePrompt
  };
})();

globalThis.AskAll = AskAll;
