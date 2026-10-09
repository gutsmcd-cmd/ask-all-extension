// Ask All - Settings page.
(() => {
  const $ = (id) => document.getElementById(id);
  const A = globalThis.AskAll;
  const ext = globalThis.ext || globalThis.chrome;
  const ENV = globalThis.AskAllEnv;
  const KEYS = ['composer', 'send', 'stop', 'busy', 'answer', 'answerExclude', 'loggedOut'];
  let current = A.SITES[0].id;

  function msg(text, ok) {
    $('msg').textContent = text;
    $('msg').className = ok ? 'ok' : 'bad';
  }

  async function loadGeneral() {
    const s = await A.getSettings();
    $('timeoutSec').value = s.timeoutSec;
    $('newChatEachRound').checked = !!s.newChatEachRound;
    $('pinTabs').checked = !!s.pinTabs;
    $('runMode').value = s.runMode || 'auto';
    $('returnToHub').checked = s.returnToHub !== false;
    $('layout').value = s.layout || 'auto';
    await ENV.platform();
    $('runModeAuto').textContent = 'Automatic (now: ' + (ENV.isAndroid ? 'one at a time, because this is Android' : 'all at once') + ')';
    $('pinRow').hidden = $('pinTabs').hidden = !!ENV.isAndroid;
  }

  async function loadSite() {
    const overrides = await A.getOverrides();
    const cfg = globalThis.askAllSiteConfig(current, overrides);
    $('json').value = JSON.stringify(cfg, null, 2);
    $('customFlag').textContent = overrides[current] ? 'Using your edited selectors.' : 'Using built-in defaults.';
    document.querySelectorAll('#siteTabs button').forEach((b) => b.classList.toggle('active', b.dataset.site === current));
    $('testOut').textContent = '';
    $('msg').textContent = '';
  }

  function validate(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('The JSON must be an object { ... }.');
    for (const k of KEYS) {
      if (obj[k] === undefined) continue;
      if (!Array.isArray(obj[k]) || obj[k].some((x) => typeof x !== 'string')) throw new Error('"' + k + '" must be a list of strings.');
      for (const sel of obj[k]) {
        try { document.createDocumentFragment().querySelector(sel); } catch (e) { throw new Error('Not a valid CSS selector in "' + k + '": ' + sel); }
      }
    }
    for (const k of ['composer', 'answer']) {
      if (!obj[k] || !obj[k].length) throw new Error('"' + k + '" needs at least one selector.');
    }
    if (obj.newChatUrl) {
      const site = A.siteById(current);
      const host = new URL(obj.newChatUrl).hostname;
      if (!site.hosts.includes(host)) throw new Error('newChatUrl must be on ' + site.hosts.join(' or '));
    }
  }

  async function saveSite() {
    let obj;
    try {
      obj = JSON.parse($('json').value);
      validate(obj);
    } catch (e) { msg(e.message, false); return; }
    const overrides = await A.getOverrides();
    overrides[current] = obj;
    await ext.storage.local.set({ overrides });
    msg('Saved. New questions will use these selectors.', true);
    $('customFlag').textContent = 'Using your edited selectors.';
  }

  async function resetSite() {
    const overrides = await A.getOverrides();
    delete overrides[current];
    await ext.storage.local.set({ overrides });
    await loadSite();
    msg('Reset to the built-in defaults.', true);
  }

  async function testSite() {
    $('testOut').className = 'muted';
    $('testOut').textContent = ENV.isAndroid
      ? 'Testing… (the site comes to the front for a moment, then you come back here; nothing is typed)'
      : 'Testing… (opens the site in a background tab if it is not open yet; nothing is typed)';
    let r;
    if (ENV.hasBackgroundRunner) {
      let me = null;
      try { me = await ext.tabs.getCurrent(); } catch (e) { me = null; }
      try { r = await ext.runtime.sendMessage({ type: 'askall:test', siteId: current, returnTabId: me ? me.id : null }); } catch (e) { r = { ok: false, error: String(e.message || e) }; }
      r = r || { ok: false, error: 'no_access' };
    } else {
      r = await A.testSite(current);
    }
    const lines = [];
    if (r.ok) {
      lines.push('✔ Message box found with: ' + r.composer);
    } else if (r.error) {
      lines.push('✘ ' + (A.ERRORS[r.error] || r.error) + (r.detail ? ' (' + r.detail + ')' : ''));
    } else {
      lines.push('✘ Message box NOT found. Edit the "composer" selectors.');
    }
    if (r.url) lines.push('Page: ' + r.url);
    if (r.composer !== undefined) {
      lines.push('Send button (only shows once text is typed on some sites): ' + (r.send || 'not visible right now'));
      lines.push('Answers on this page: ' + (r.answers || 0) + (r.answerSelector ? ' (via ' + r.answerSelector + ')' : ''));
      lines.push('Still answering: ' + (r.generating ? 'yes' : 'no'));
      if (r.loggedOut) lines.push('⚠ Looks logged out (found ' + r.loggedOut + ')');
    }
    $('testOut').className = r.ok ? 'ok' : 'bad';
    $('testOut').textContent = lines.join('\n');
  }

  async function init() {
    await ENV.platform();
    document.body.classList.toggle('touch', !!ENV.isAndroid || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
    $('selDate').textContent = globalThis.ASK_ALL_SELECTORS_DATE;
    for (const s of A.SITES) {
      const b = document.createElement('button');
      b.textContent = s.name;
      b.dataset.site = s.id;
      b.addEventListener('click', () => { current = s.id; loadSite(); });
      $('siteTabs').appendChild(b);
    }
    $('saveGeneral').addEventListener('click', async () => {
      const t = Math.max(20, Math.min(900, parseInt($('timeoutSec').value, 10) || 180));
      const layout = $('layout').value;
      await A.saveSettings({
        timeoutSec: t, newChatEachRound: $('newChatEachRound').checked, pinTabs: $('pinTabs').checked,
        runMode: $('runMode').value, returnToHub: $('returnToHub').checked,
        layout, layoutChosen: true
      });
      $('timeoutSec').value = t;
      $('generalMsg').textContent = 'Saved.';
      setTimeout(() => { $('generalMsg').textContent = ''; }, 1500);
    });
    $('saveSite').addEventListener('click', saveSite);
    $('resetSite').addEventListener('click', resetSite);
    $('testSite').addEventListener('click', testSite);
    const want = new URLSearchParams(location.search).get('site');
    if (want && A.siteById(want)) current = want;
    await loadGeneral();
    await loadSite();
  }
  init();
})();
