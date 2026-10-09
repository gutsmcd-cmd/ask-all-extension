// Ask All (PC) - Settings page.
(() => {
  const $ = (id) => document.getElementById(id);
  const A = globalThis.AskAll;
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
    await chrome.storage.local.set({ overrides });
    msg('Saved. New questions will use these selectors.', true);
    $('customFlag').textContent = 'Using your edited selectors.';
  }

  async function resetSite() {
    const overrides = await A.getOverrides();
    delete overrides[current];
    await chrome.storage.local.set({ overrides });
    await loadSite();
    msg('Reset to the built-in defaults.', true);
  }

  async function testSite() {
    $('testOut').className = 'muted';
    $('testOut').textContent = 'Testing… (opens the site in a background tab if it is not open yet; nothing is typed)';
    const r = await A.testSite(current);
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
      await A.saveSettings({ timeoutSec: t, newChatEachRound: $('newChatEachRound').checked, pinTabs: $('pinTabs').checked });
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
