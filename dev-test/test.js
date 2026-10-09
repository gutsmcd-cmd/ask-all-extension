// End-to-end test of the Ask All extension against local mock sites (TEST ONLY).
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

const EXT = path.resolve(__dirname, '..');
const PROFILE = path.join(require('os').tmpdir(), 'askall-test-profile');
const HOSTS = ['grok.com', 'chatgpt.com', 'claude.ai', 'gemini.google.com', 'www.meta.ai', 'chat.deepseek.com'];
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
const get = (p) => new Promise((res, rej) => https.get({ host: '127.0.0.1', port: 8443, path: p, rejectUnauthorized: false, headers: { host: 'grok.com' } }, (r) => { let b = ''; r.on('data', (c) => b += c); r.on('end', () => res(b)); }).on('error', rej));
const logs = async () => JSON.parse(await get('/__logs'));

async function launch() {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium', headless: true, ignoreHTTPSErrors: true, viewport: { width: 1500, height: 1000 },
    args: [
      `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      '--host-resolver-rules=' + HOSTS.map((h) => `MAP ${h} 127.0.0.1:8443`).join(', '),
      '--ignore-certificate-errors'
    ]
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  return { ctx, id };
}

async function badges(page) {
  return page.$$eval('.panel[data-site]', (ps) => ps.map((p) => ({
    site: p.dataset.site, status: p.querySelector('.badge').className.replace('badge', '').trim(),
    err: p.querySelector('.perr').textContent, text: p.querySelector('.pbody').innerText })));
}
async function waitAllFinal(page, ms) {
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('.panel[data-site] .badge')];
    return b.length && b.every((x) => /done|error|timeout/.test(x.className)) && !document.getElementById('sendBtn').disabled;
  }, null, { timeout: ms, polling: 250 });
}

(async () => {
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const server = spawn('node', [path.join(__dirname, 'server.js')], { stdio: 'inherit' });
  await new Promise((r) => setTimeout(r, 800));
  let { ctx, id } = await launch();
  console.log('extension id', id);
  const hub = await ctx.newPage();
  await hub.goto(`chrome-extension://${id}/hub.html`);
  await hub.evaluate(() => chrome.storage.local.set({ settings: Object.assign({}, ASK_ALL_DEFAULT_SETTINGS, {
    enabled: { grok: true, chatgpt: true, claude: true, gemini: true, meta: true, deepseek: true }, timeoutSec: 60 }) }));
  await hub.reload();
  check('hub shows 6 panels', (await hub.$$('.panel[data-site]')).length === 6);

  // ---- Round 1: all six in parallel ----
  await hub.fill('#question', 'Is data center water use really that big?\nSecond line of the question.');
  const t0 = Date.now();
  await hub.click('#sendBtn');
  await waitAllFinal(hub, 120000);
  const elapsed = Date.now() - t0;
  const b1 = await badges(hub);
  const by = Object.fromEntries(b1.map((b) => [b.site, b]));
  const fruit = { grok: 'KIWI', chatgpt: 'MANGO', claude: 'PEAR', gemini: 'PLUM', deepseek: 'LIME' };
  for (const [s, f] of Object.entries(fruit)) {
    check(`round1 ${s} done with full answer`, by[s].status === 'done' && by[s].text.includes('END-' + f), by[s].status + ' ' + by[s].err);
  }
  check('round1 meta reports not logged in (others unaffected)', by.meta.status === 'error' && /Not logged in/.test(by.meta.err), by.meta.err);
  check('grok answer kept full text across a 1.5 s mid-stream pause', /Second point/.test(by.grok.text) && /END-KIWI/.test(by.grok.text));
  check('deepseek (no stop button, stability only) survived a 2.5 s pause', /END-LIME/.test(by.deepseek.text));
  check('deepseek thinking block excluded', !/SECRET-THOUGHTS/.test(by.deepseek.text));
  check('grok thinking/buttons excluded', !/Thinking about it/.test(by.grok.text) && !/\bcopy\b/.test(by.grok.text));
  check('markdown conversion (heading, bullets, link)', /### Fruit KIWI reporting/.test(by.grok.text) && /- First point/.test(by.grok.text) && /\[KIWI source\]\(https:\/\/example\.org\/kiwi-source\)/.test(by.grok.text), JSON.stringify(by.grok.text.slice(0, 200)));
  let L = await logs();
  const rec = L.filter((l) => l.ev === 'received');
  const recBy = {};
  for (const r of rec) (recBy[r.site] = recBy[r.site] || []).push(r);
  check('each site received the question exactly once (no auto re-send)', ['grok.com', 'chatgpt.com', 'claude.ai', 'gemini.google.com', 'chat.deepseek.com'].every((h) => (recBy[h] || []).length === 1), JSON.stringify(Object.fromEntries(Object.entries(recBy).map(([k, v]) => [k, v.length]))));
  check('meta (logged out) received nothing', !recBy['www.meta.ai']);
  check('question text intact incl. newline (paste path: grok; mock renders lines as <p>)', /^Is data center water use really that big\?\n+Second line of the question\.$/.test((recBy['grok.com'] || [{}])[0].data), JSON.stringify((recBy['grok.com'] || [{}])[0].data));
  check('question text intact (execCommand path: chatgpt)', /Is data center water use really that big\?\s*Second line/.test((recBy['chatgpt.com'] || [{}])[0].data), JSON.stringify((recBy['chatgpt.com'] || [{}])[0].data));
  check('question text intact (textarea path: deepseek)', (recBy['chat.deepseek.com'] || [{}])[0].data.includes('Second line'));
  const times = rec.map((r) => r.t);
  const spread = Math.max(...times) - Math.min(...times);
  const fin = L.filter((l) => l.ev === 'finished');
  check('sites ran in parallel (all received within 4 s of each other)', spread < 4000, 'spread ' + spread + ' ms, total round ' + elapsed + ' ms');
  const tabs = await ctx.pages();
  const pinned = await hub.evaluate(() => chrome.tabs.query({ pinned: true }).then((t) => t.map((x) => new URL(x.url).hostname)));
  check('site tabs opened pinned in background', pinned.length >= 5, pinned.join(','));
  await hub.screenshot({ path: path.join(__dirname, 'out', 'hub-round1.png'), fullPage: true });

  // ---- Combine ----
  await hub.selectOption('#combiner', 'grok');
  await hub.click('#combineBtn');
  await hub.waitForFunction(() => /done|error|timeout/.test(document.getElementById('combinedStatus').className), null, { timeout: 60000 });
  const comb = await hub.evaluate(() => ({ status: document.getElementById('combinedStatus').className, text: document.getElementById('combinedBody').innerText, map: document.getElementById('mapping').innerText }));
  check('combined panel done', /done/.test(comb.status), comb.status);
  L = await logs();
  const grokRec = L.filter((l) => l.ev === 'received' && l.site === 'grok.com');
  const cp = grokRec[grokRec.length - 1].data;
  check('combine prompt went to grok in a NEW chat (2nd grok message)', grokRec.length === 2);
  check('combine prompt has Answer A..E', ['A', 'B', 'C', 'D', 'E'].every((x) => cp.includes('=== Answer ' + x + ' ===')) && !cp.includes('=== Answer F ==='));
  check('combine prompt is anonymised (no site names)', !/grok|chatgpt|claude|gemini|deepseek|meta ai/i.test(cp));
  check('combine prompt asks for all 6 sections', ['Combined best answer', 'Strongest agreement', 'Disagreements', 'Points only one answer made', 'Likely errors', 'Possibly outdated'].every((s) => cp.includes(s)));
  const nameToFruit = { Grok: 'KIWI', ChatGPT: 'MANGO', Claude: 'PEAR', Gemini: 'PLUM', DeepSeek: 'LIME' };
  const pairs = [...comb.map.matchAll(/Answer ([A-E]) = (\w+)/g)];
  const mapOk = pairs.length === 5 && pairs.every(([, letter, name]) => {
    const blk = cp.split('=== Answer ' + letter + ' ===')[1].split('=== Answer')[0];
    return blk.includes('Fruit ' + nameToFruit[name]);
  });
  check('hub mapping (letter -> site) matches what was sent', mapOk, comb.map);
  await hub.screenshot({ path: path.join(__dirname, 'out', 'hub-combined.png'), fullPage: true });

  // ---- Round 2: timeout on one site, others fine; Retry ----
  await hub.evaluate(() => chrome.storage.local.get('settings').then(({ settings }) => chrome.storage.local.set({ settings: Object.assign(settings, {
    timeoutSec: 12, enabled: { grok: true, chatgpt: true, claude: false, gemini: false, meta: false, deepseek: true } }) })));
  await hub.reload();
  await hub.fill('#question', 'NEVERSTOP please');
  await hub.click('#sendBtn');
  await waitAllFinal(hub, 60000);
  const b2 = Object.fromEntries((await badges(hub)).map((b) => [b.site, b]));
  check('round2 deepseek times out with partial text', b2.deepseek.status === 'timeout' && /Timed out/.test(b2.deepseek.err) && /Fruit LIME/.test(b2.deepseek.text), b2.deepseek.status);
  check('round2 grok + chatgpt still done', b2.grok.status === 'done' && b2.chatgpt.status === 'done');
  // Retry one site
  await hub.click('#panel-chatgpt [data-retry]');
  await hub.waitForFunction(() => !/done|error|timeout/.test(document.querySelector('#panel-chatgpt .badge').className), null, { timeout: 5000 });
  await waitAllFinal(hub, 60000);
  const b2r = Object.fromEntries((await badges(hub)).map((b) => [b.site, b]));
  L = await logs();
  const cnt = (h) => L.filter((l) => l.ev === 'received' && l.site === h).length;
  check('Retry re-sends only that site once', b2r.chatgpt.status === 'done' && cnt('chatgpt.com') === 3 && cnt('grok.com') === 3 && cnt('chat.deepseek.com') === 2, `chatgpt ${cnt('chatgpt.com')} grok ${cnt('grok.com')} deepseek ${cnt('chat.deepseek.com')}`);

  // ---- Round 3: same chat (no new chat) ----
  await hub.evaluate(() => chrome.storage.local.get('settings').then(({ settings }) => chrome.storage.local.set({ settings: Object.assign(settings, {
    timeoutSec: 60, newChatEachRound: false, enabled: { grok: false, chatgpt: false, claude: true, gemini: true, meta: false, deepseek: false } }) })));
  await hub.reload();
  await hub.fill('#question', 'first in same chat');
  await hub.click('#sendBtn');
  await waitAllFinal(hub, 60000);
  await hub.fill('#question', 'second follow-up in same chat');
  await hub.click('#sendBtn');
  await waitAllFinal(hub, 60000);
  const b3 = Object.fromEntries((await badges(hub)).map((b) => [b.site, b]));
  check('same-chat mode reads the NEW (2nd) reply, not the old one', b3.claude.status === 'done' && /second follow-up/.test(b3.claude.text) && b3.gemini.status === 'done' && /second follow-up/.test(b3.gemini.text), b3.claude.text.slice(0, 120));

  // ---- History persists across a browser restart ----
  const hCount = await hub.evaluate(() => chrome.storage.local.get('history').then((x) => x.history.length));
  check('history saved (4 rounds)', hCount === 4, String(hCount));
  await ctx.close();
  ({ ctx, id } = await launch());
  const hub2 = await ctx.newPage();
  await hub2.goto(`chrome-extension://${id}/hub.html`);
  await hub2.waitForSelector('#historyList li[data-id]');
  const items = await hub2.$$eval('#historyList li[data-id] .q', (q) => q.map((x) => x.textContent));
  check('history survives browser restart', items.length === 4 && items.includes('Is data center water use really that big?\nSecond line of the question.'), items.join(' | ').replace(/\n/g, ' '));
  await hub2.click('#historyList li:last-child');
  const old = Object.fromEntries((await badges(hub2)).map((b) => [b.site, b]));
  const oldComb = await hub2.evaluate(() => document.getElementById('combinedBody').innerText);
  check('opening a history round shows its answers + combined', /END-MANGO/.test(old.chatgpt.text) && /END-KIWI/.test(oldComb));
  // history cap 50
  await hub2.evaluate(async () => { for (let i = 0; i < 60; i++) await AskAll.putRound({ id: 'x' + i, ts: Date.now() + i, question: 'q' + i, sites: [], answers: {} }); });
  const capped = await hub2.evaluate(() => chrome.storage.local.get('history').then((x) => x.history.length));
  check('history capped at 50', capped === 50, String(capped));

  // ---- Settings page ----
  const st = await ctx.newPage();
  await st.goto(`chrome-extension://${id}/settings.html?site=grok`);
  await st.click('#testSite');
  await st.waitForFunction(() => /✔|✘/.test(document.getElementById('testOut').textContent), null, { timeout: 40000 });
  const tOut = await st.textContent('#testOut');
  check('Settings > Test site finds Grok composer', /Message box found with: \[data-testid="chat-input"\]/.test(tOut), tOut.split('\n')[0]);
  await st.goto(`chrome-extension://${id}/settings.html?site=chatgpt`);
  const j = JSON.parse(await st.inputValue('#json'));
  j.composer = ['#definitely-not-there'];
  j.composerWaitMs = 2000;
  await st.fill('#json', JSON.stringify(j, null, 2));
  await st.click('#saveSite');
  const ov = await st.evaluate(() => chrome.storage.local.get('overrides').then((x) => x.overrides));
  check('Settings saves a selector override', ov && ov.chatgpt && ov.chatgpt.composer[0] === '#definitely-not-there');
  await st.click('#testSite');
  await st.waitForFunction(() => /✔|✘/.test(document.getElementById('testOut').textContent), null, { timeout: 40000 });
  check('Test site reports missing composer with broken selector', /NOT found/.test(await st.textContent('#testOut')));
  await st.fill('#json', '{"composer": ["div[["], "answer": ["x"]}');
  await st.click('#saveSite');
  check('Settings rejects an invalid selector', /Not a valid CSS selector/.test(await st.textContent('#msg')));
  st.on('dialog', (d) => d.accept());
  await st.click('#resetSite');
  await st.waitForTimeout(300);
  const ov2 = await st.evaluate(() => chrome.storage.local.get('overrides').then((x) => x.overrides));
  check('Reset to defaults removes the override', !ov2.chatgpt && JSON.parse(await st.inputValue('#json')).composer[0] === '#prompt-textarea[contenteditable="true"]');
  await st.screenshot({ path: path.join(__dirname, 'out', 'settings.png'), fullPage: true });

  await ctx.close();
  server.kill();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  fs.writeFileSync(path.join(__dirname, 'out', 'results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
