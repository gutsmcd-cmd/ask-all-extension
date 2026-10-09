// End-to-end test of the FIREFOX build against the same local mock sites (TEST ONLY).
// Runs real desktop Firefox through geckodriver (Selenium), installs dist/firefox as a
// temporary add-on, and sends grok.com, chatgpt.com ... to the mock server through a
// tiny local proxy. Covers the background runner, one-at-a-time mode (what Android
// uses), Stop, closing the Hub mid-round, Settings > Test site and the phone layouts.
// Firefox for Android itself can't be tested here (needs a real phone + adb).
//
//   FIREFOX_BIN=/path/to/firefox GECKODRIVER=/path/to/geckodriver npm run test:firefox
// (Without them, Selenium Manager finds or downloads Firefox and geckodriver.)
const { Builder } = require('selenium-webdriver');
const ff = require('selenium-webdriver/firefox');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'dist', 'firefox');
const ADDON_ID = 'ask-all@gutsmcd-cmd.github.io';
const UUID = '5a5e0a11-0000-4000-8000-a5ca11a5ca11';
const BASE = `moz-extension://${UUID}`;
const PROXY_PORT = 8081;
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
const get = (p) => new Promise((res, rej) => https.get({ host: '127.0.0.1', port: 8443, path: p, rejectUnauthorized: false, headers: { host: 'grok.com' } }, (r) => { let b = ''; r.on('data', (c) => b += c); r.on('end', () => res(b)); }).on('error', rej));
const logs = async () => JSON.parse(await get('/__logs'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// CONNECT proxy: every https host -> the mock server.
function startProxy() {
  const p = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
  p.on('connect', (req, sock, head) => {
    const up = net.connect(8443, '127.0.0.1', () => {
      sock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) up.write(head);
      up.pipe(sock); sock.pipe(up);
    });
    up.on('error', () => sock.destroy());
    sock.on('error', () => up.destroy());
  });
  return new Promise((r) => p.listen(PROXY_PORT, '127.0.0.1', () => r(p)));
}

// ---- tiny page wrapper over a WebDriver window handle ----
let d;
async function chrome(script, ...args) {
  d.setContext('chrome');
  try { return await d.executeScript(script, ...args); } finally { d.setContext('content'); }
}
// Marionette can't navigate to moz-extension:// pages, so open them from the browser chrome.
async function openTab(url) {
  const before = await d.getAllWindowHandles();
  await chrome(`const w = Services.wm.getMostRecentWindow('navigator:browser');
    w.gBrowser.selectedTab = w.gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });`, url);
  for (let i = 0; i < 50; i++) {
    const h = (await d.getAllWindowHandles()).find((x) => !before.includes(x));
    if (h) { await d.switchTo().window(h); await page(h).waitForFunction(() => document.readyState === 'complete', null, { timeout: 10000 }); return page(h); }
    await sleep(100);
  }
  throw new Error('tab did not open: ' + url);
}
const selectedUrl = () => chrome(`return Services.wm.getMostRecentWindow('navigator:browser').gBrowser.selectedBrowser.currentURI.spec;`);
function page(h) {
  const on = async () => { await d.switchTo().window(h); };
  const P = {
    handle: h,
    async evaluate(fn, arg) { await on(); return d.executeScript(`return (${fn})(arguments[0]);`, arg === undefined ? null : arg); },
    async waitForFunction(fn, arg, o) {
      const t0 = Date.now(); const ms = (o && o.timeout) || 30000;
      for (;;) {
        let v = null; try { v = await P.evaluate(fn, arg); } catch (e) { v = null; }
        if (v) return v;
        if (Date.now() - t0 > ms) throw new Error('waitForFunction timed out after ' + ms + ' ms');
        await sleep((o && o.polling) || 250);
      }
    },
    async $$eval(sel, fn) { await on(); return d.executeScript(`return (${fn})(Array.from(document.querySelectorAll(arguments[0])));`, sel); },
    async $eval(sel, fn) { await on(); return d.executeScript(`return (${fn})(document.querySelector(arguments[0]));`, sel); },
    async count(sel) { return P.$$eval(sel, (a) => a.length); },
    async fill(sel, v) { await on(); await d.executeScript('const e = document.querySelector(arguments[0]); e.value = arguments[1]; e.dispatchEvent(new Event("input", { bubbles: true }));', sel, v); },
    async click(sel) { await on(); await d.executeScript('const e = document.querySelector(arguments[0]); if (!e) throw new Error("no " + arguments[0]); e.click();', sel); },
    async selectOption(sel, v) { await on(); await d.executeScript('const e = document.querySelector(arguments[0]); e.value = arguments[1]; e.dispatchEvent(new Event("change", { bubbles: true }));', sel, v); },
    async textContent(sel) { return P.$eval(sel, (e) => e && e.textContent); },
    async isVisible(sel) { return P.$eval(sel, (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length)); },
    async reload() { await on(); await d.executeScript('location.reload()'); await sleep(500); await P.waitForFunction(() => document.readyState === 'complete' && !!window.AskAll, null, { timeout: 10000 }); await sleep(300); },
    async screenshot(file) { await on(); fs.writeFileSync(file, Buffer.from(await d.takeScreenshot(), 'base64')); },
    async close() { await on(); await d.close(); const hs = await d.getAllWindowHandles(); await d.switchTo().window(hs[0]); },
    async front() { await d.switchTo().window(h); }
  };
  return P;
}

async function badges(p) {
  return p.$$eval('.panel[data-site]', (ps) => ps.map((x) => ({
    site: x.dataset.site, status: x.querySelector('.badge').className.replace('badge', '').trim(),
    err: x.querySelector('.perr').textContent, text: x.querySelector('.pbody').innerText })));
}
const allFinal = () => {
  const b = [...document.querySelectorAll('.panel[data-site] .badge')];
  return b.length && b.every((x) => /done|error|timeout|stopped/.test(x.className)) && !document.getElementById('sendBtn').disabled;
};
const setSettings = (p, patch) => p.evaluate((pt) => browser.storage.local.get('settings').then(({ settings }) =>
  browser.storage.local.set({ settings: Object.assign({}, ASK_ALL_DEFAULT_SETTINGS, settings || {}, pt) }).then(() => true)), patch);
// wait from the test side (no tab switching, so the browser's selected tab is untouched)
async function waitLogs(pred, ms) {
  const t0 = Date.now();
  for (;;) { const L = await logs(); if (pred(L)) return L; if (Date.now() - t0 > ms) return L; await sleep(500); }
}

(async () => {
  execFileSync('bash', [path.join(ROOT, 'tools', 'build-firefox.sh')], { stdio: 'inherit' });
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  const server = spawn('node', [path.join(__dirname, 'server.js')], { stdio: 'inherit' });
  const proxy = await startProxy();
  await sleep(800);
  const opts = new ff.Options().addArguments('-headless').setAcceptInsecureCerts(true)
    .setPreference('extensions.webextensions.uuids', JSON.stringify({ [ADDON_ID]: UUID }))
    .setPreference('network.proxy.type', 1)
    .setPreference('network.proxy.ssl', '127.0.0.1')
    .setPreference('network.proxy.ssl_port', PROXY_PORT)
    .setPreference('network.proxy.http', '127.0.0.1')
    .setPreference('network.proxy.http_port', PROXY_PORT)
    .setPreference('browser.tabs.warnOnClose', false);
  opts.windowSize({ width: 1500, height: 1000 });
  if (process.env.FIREFOX_BIN) opts.setBinary(process.env.FIREFOX_BIN);
  const svc = new ff.ServiceBuilder(process.env.GECKODRIVER || undefined).addArguments('--allow-system-access');
  d = await new Builder().forBrowser('firefox').setFirefoxOptions(opts).setFirefoxService(svc).build();
  try {
    const version = (await d.getCapabilities()).get('browserVersion');
    const id = await d.installAddon(EXT, true);
    check('Firefox build installs as a temporary add-on (Firefox ' + version + ')', id === ADDON_ID, id);
    await sleep(800);

    const hub = await openTab(`${BASE}/hub.html`);
    await setSettings(hub, { enabled: { grok: true, chatgpt: true, claude: true, gemini: true, meta: true, deepseek: true }, timeoutSec: 60, runMode: 'parallel' });
    await hub.reload();
    check('hub shows 6 panels (Firefox)', (await hub.count('.panel[data-site]')) === 6);
    check('Firefox uses the background runner', await hub.evaluate(() => AskAllEnv.hasBackgroundRunner === true && AskAllEnv.isFirefox === true));

    // ---- Round 1: all at once (desktop Firefox) ----
    await hub.fill('#question', 'Is data center water use really that big?\nSecond line of the question.');
    await hub.click('#sendBtn');
    await hub.waitForFunction(allFinal, null, { timeout: 120000 });
    const by = Object.fromEntries((await badges(hub)).map((b) => [b.site, b]));
    const fruit = { grok: 'KIWI', chatgpt: 'MANGO', claude: 'PEAR', gemini: 'PLUM', deepseek: 'LIME' };
    for (const [s, f] of Object.entries(fruit)) check(`ff round1 ${s} done with full answer`, by[s].status === 'done' && by[s].text.includes('END-' + f), by[s].status + ' ' + by[s].err);
    check('ff round1 meta reports not logged in', by.meta.status === 'error' && /Not logged in/.test(by.meta.err), by.meta.err);
    check('ff thinking blocks / buttons excluded', !/SECRET-THOUGHTS/.test(by.deepseek.text) && !/Thinking about it/.test(by.grok.text) && !/\bcopy\b/.test(by.grok.text));
    check('ff markdown conversion', /### Fruit KIWI reporting/.test(by.grok.text) && /- First point/.test(by.grok.text) && /\[KIWI source\]\(https:\/\/example\.org\/kiwi-source\)/.test(by.grok.text));
    let L = await logs();
    const rec = L.filter((l) => l.ev === 'received');
    const cnt = (hh) => rec.filter((l) => l.site === hh).length;
    check('ff each site received the question exactly once', ['grok.com', 'chatgpt.com', 'claude.ai', 'gemini.google.com', 'chat.deepseek.com'].every((hh) => cnt(hh) === 1) && cnt('www.meta.ai') === 0, JSON.stringify(rec.map((r) => r.site)));
    const g = (rec.find((r) => r.site === 'grok.com') || {}).data || '';
    check('ff question text intact (paste path: grok)', /^Is data center water use really that big\?\n+Second line of the question\.$/.test(g), JSON.stringify(g));
    check('ff question text intact (execCommand path: chatgpt)', /Is data center water use really that big\?\s*Second line/.test((rec.find((r) => r.site === 'chatgpt.com') || {}).data || ''));
    check('ff question text intact (textarea path: deepseek)', /Second line/.test((rec.find((r) => r.site === 'chat.deepseek.com') || {}).data || ''));
    const times = rec.map((r) => r.t);
    check('ff sites ran in parallel', Math.max(...times) - Math.min(...times) < 5000, 'spread ' + (Math.max(...times) - Math.min(...times)) + ' ms');
    await hub.screenshot(path.join(__dirname, 'out', 'ff-hub-round1.png'));

    // ---- Combine ----
    await hub.click('#combineBtn');
    await hub.waitForFunction(() => /done|error|timeout/.test(document.getElementById('combinedStatus').className), null, { timeout: 60000 });
    const comb = await hub.evaluate(() => ({ status: document.getElementById('combinedStatus').className, map: document.getElementById('mapping').innerText }));
    L = await logs();
    const grokRec = L.filter((l) => l.ev === 'received' && l.site === 'grok.com');
    const cp = grokRec[grokRec.length - 1].data;
    check('ff combined done, new chat, anonymised A..E', /done/.test(comb.status) && grokRec.length === 2 && ['A', 'B', 'C', 'D', 'E'].every((x) => cp.includes('=== Answer ' + x + ' ===')) && !/grok|chatgpt|claude|gemini|deepseek/i.test(cp), comb.map);

    // ---- Round 2: ONE AT A TIME (what Android uses) ----
    await get('/__reset');
    await setSettings(hub, { runMode: 'sequential', enabled: { grok: true, chatgpt: true, claude: true, gemini: false, meta: false, deepseek: true } });
    await hub.reload();
    await hub.fill('#question', 'one at a time please');
    // click and read in one go: the site tabs start coming to the front right after
    const queued = await hub.evaluate(() => { document.getElementById('sendBtn').click(); return /queued/.test(document.querySelector('#panel-deepseek .badge').className); });
    check('one-at-a-time: later sites show "waiting its turn"', queued);
    // Don't touch the tabs while it runs; record which tab is in front from the browser chrome.
    const fronts = new Set();
    L = await waitLogs((x) => { return x.filter((l) => l.ev === 'finished').length >= 4; }, 180000);
    for (let i = 0; i < 20; i++) { fronts.add(new URL(await selectedUrl()).protocol); if (/hub\.html/.test(await selectedUrl())) break; await sleep(500); }
    const order = ['grok.com', 'chatgpt.com', 'claude.ai', 'chat.deepseek.com'];
    const recs = order.map((hh) => L.find((l) => l.ev === 'received' && l.site === hh) || {});
    const fins = order.map((hh) => L.find((l) => l.ev === 'finished' && l.site === hh) || {});
    const seqOk = recs.every((r) => r.t) && fins.every((f) => f.t) && order.slice(1).every((_, i) => recs[i + 1].t > fins[i].t);
    check('one-at-a-time: each site only gets the question after the previous one finished', seqOk, JSON.stringify({ rec: recs.map((r) => r.t - recs[0].t), fin: fins.map((f) => f.t - recs[0].t) }));
    check('one-at-a-time: each site\'s tab was in front (visible) while it got the question', recs.every((r) => r.vis === 'visible'), recs.map((r) => r.vis).join(','));
    const endUrl = await selectedUrl();
    check('one-at-a-time: back on the Hub at the end', /hub\.html/.test(endUrl), endUrl);
    await hub.waitForFunction(allFinal, null, { timeout: 20000 });
    const b2 = Object.fromEntries((await badges(hub)).map((b) => [b.site, b]));
    check('one-at-a-time: all 4 answers shown in the Hub', ['grok', 'chatgpt', 'claude', 'deepseek'].every((s) => b2[s].status === 'done' && /END-/.test(b2[s].text)), JSON.stringify(Object.fromEntries(Object.entries(b2).map(([k, v]) => [k, v.status]))));
    // the parallel round: tabs stayed in the background
    check('all-at-once mode keeps site tabs in the background (round 1)', rec.some((r) => r.vis === 'hidden'), rec.map((r) => r.site + ':' + r.vis).join(' '));

    // ---- Stop ----
    await setSettings(hub, { runMode: 'parallel', timeoutSec: 120, enabled: { grok: false, chatgpt: false, claude: false, gemini: false, meta: false, deepseek: true } });
    await hub.reload();
    await hub.fill('#question', 'NEVERSTOP please');
    await hub.click('#sendBtn');
    await hub.waitForFunction(() => /waiting/.test(document.querySelector('#panel-deepseek .badge').className), null, { timeout: 30000 });
    await sleep(2500);
    await hub.click('#stopBtn');
    await hub.waitForFunction(allFinal, null, { timeout: 20000 });
    const b3 = Object.fromEntries((await badges(hub)).map((b) => [b.site, b]));
    check('Stop ends a never-ending answer, keeps the partial text', b3.deepseek.status === 'stopped' && /Fruit LIME/.test(b3.deepseek.text), b3.deepseek.status);

    // ---- Closing the Hub mid-round: the background finishes it ----
    await setSettings(hub, { runMode: 'parallel', timeoutSec: 60, enabled: { grok: true, chatgpt: false, claude: true, gemini: false, meta: false, deepseek: false } });
    await hub.reload();
    await hub.fill('#question', 'closing the hub mid round');
    await hub.click('#sendBtn');
    await sleep(1500);
    await hub.close();
    await sleep(12000);
    const hub2 = await openTab(`${BASE}/hub.html`);
    const bgDone = await hub2.waitForFunction(() => browser.storage.local.get('history').then((x) => {
      const r = x.history.find((hh) => hh.question === 'closing the hub mid round');
      return !!(r && r.answers.grok.status === 'done' && r.answers.claude.status === 'done');
    }), null, { timeout: 60000, polling: 500 }).then(() => true, () => false);
    check('round finishes in the background after the Hub tab is closed', bgDone);

    // ---- Settings > Test site (runs through the background) ----
    const st = await openTab(`${BASE}/settings.html?site=grok`);
    await st.click('#testSite');
    await st.waitForFunction(() => /✔|✘/.test(document.getElementById('testOut').textContent), null, { timeout: 40000 });
    const tOut = await st.textContent('#testOut');
    check('ff Settings > Test site finds Grok composer', /Message box found/.test(tOut), tOut.split('\n')[0]);
    await st.selectOption('#runMode', 'sequential');
    await st.selectOption('#layout', 'portrait');
    await st.click('#saveGeneral');
    await sleep(400);
    const saved = await st.evaluate(() => browser.storage.local.get('settings').then((x) => x.settings));
    check('ff Settings saves run mode + layout', saved.runMode === 'sequential' && saved.layout === 'portrait');
    await st.screenshot(path.join(__dirname, 'out', 'ff-settings.png'));

    // ---- Phone layouts (forced with ?phone=1; real phones are detected automatically) ----
    await setSettings(hub2, { layoutChosen: false, layout: 'auto', runMode: 'auto', enabled: { grok: true, chatgpt: true, claude: true, gemini: true, meta: false, deepseek: true } });
    await d.manage().window().setRect({ width: 844, height: 390 });
    const ph = await openTab(`${BASE}/hub.html?phone=1`);
    await sleep(500);
    check('first run on a phone asks Landscape / Portrait', await ph.isVisible('#chooser'));
    check('chooser marks Landscape as recommended', /Landscape \(recommended\)/.test(await ph.textContent('#chooser')));
    await ph.screenshot(path.join(__dirname, 'out', 'ff-phone-chooser.png'));
    await ph.click('#chooser [data-layout="landscape"]');
    await sleep(300);
    const lay = await ph.evaluate(() => browser.storage.local.get('settings').then((x) => x.settings));
    check('choice saved (landscape, chosen)', lay.layout === 'landscape' && lay.layoutChosen === true);
    // show round 1 from history (6 answers)
    await ph.click('#historyToggle');
    await ph.evaluate(() => { const li = [...document.querySelectorAll('#historyList li[data-id]')].find((x) => /data center water/.test(x.textContent)); li.click(); return true; });
    await sleep(300);
    const rects = await ph.$$eval('.panel[data-site]', (ps) => ps.map((p) => { const r = p.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }));
    const vw = await ph.evaluate(() => window.innerWidth);
    check('landscape: answers side by side in columns (one row, swipe sideways)', rects.length === 6 && rects.every((r) => r.y === rects[0].y) && rects[1].x > rects[0].x && rects[0].w <= vw / 2 + 5, 'innerWidth ' + vw + ' ' + JSON.stringify(rects.slice(0, 3)));
    const btnH = await ph.$eval('#sendBtn', (b) => b.getBoundingClientRect().height);
    check('big touch targets (Send button >= 44 px tall)', btnH >= 44, String(btnH));
    await ph.evaluate(() => { document.getElementById('panels').scrollIntoView(); return true; });
    await ph.screenshot(path.join(__dirname, 'out', 'ff-phone-landscape.png'));
    await d.manage().window().setRect({ width: 390, height: 844 });
    await sleep(600);
    check('landscape layout held upright shows the "turn sideways" hint', await ph.isVisible('#rotateHint'));
    await ph.click('#usePortrait');
    await sleep(400);
    const rects2 = await ph.$$eval('.panel[data-site]', (ps) => ps.map((p) => { const r = p.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; }));
    check('portrait: answers stacked full width', rects2.length === 6 && rects2[1].y > rects2[0].y && rects2[1].x === rects2[0].x, JSON.stringify(rects2.slice(0, 3)));
    await ph.screenshot(path.join(__dirname, 'out', 'ff-phone-portrait.png'));
    check('"Automatic" = all at once on desktop Firefox (one at a time only on Android)', (await ph.evaluate(() => AskAllEnv.isAndroid)) === false);
  } finally {
    await d.quit().catch(() => {});
    server.kill();
    proxy.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} Firefox checks passed`);
  fs.writeFileSync(path.join(__dirname, 'out', 'results-firefox.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
