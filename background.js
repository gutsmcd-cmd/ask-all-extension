// Ask All - background.
// Chrome (service worker): its only job is to open (or focus) the Hub page when the
// toolbar button is clicked. All the real work runs in the Hub page itself.
// Firefox (background page, see firefox/manifest.json): also runs the rounds, so
// they keep going while the Hub tab is hidden. On Android, hidden tabs are frozen,
// so the Hub page cannot do the waiting itself there.

const extApi = globalThis.ext || globalThis.browser || globalThis.chrome;

async function askAllOpenHub() {
  const hubUrl = extApi.runtime.getURL('hub.html');
  let tabs = [];
  try { tabs = await extApi.tabs.query({ url: hubUrl }); } catch (e) { tabs = []; }
  if (tabs.length) {
    await extApi.tabs.update(tabs[0].id, { active: true });
    if (extApi.windows && extApi.windows.update) {
      try { await extApi.windows.update(tabs[0].windowId, { focused: true }); } catch (e) { /* ignore */ }
    }
  } else {
    await extApi.tabs.create({ url: hubUrl });
  }
}

(extApi.action || extApi.browserAction).onClicked.addListener(() => { askAllOpenHub(); });

// ---- Firefox only: background runner ----
if (globalThis.AskAll && globalThis.AskAllEnv && globalThis.AskAllEnv.hasBackgroundRunner) {
  const A = globalThis.AskAll;
  let job = null; // the job being run: { id, round, cancel }

  // On a phone, show the Hub right after installing so people can find it.
  extApi.runtime.onInstalled.addListener(async (d) => {
    if (d.reason !== 'install') return;
    const { android } = await globalThis.AskAllEnv.platform();
    if (android) askAllOpenHub();
  });

  extApi.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object' || !String(msg.type || '').startsWith('askall:')) return undefined;
    if (msg.type === 'askall:status') {
      return Promise.resolve({ busy: !!job, roundId: job && job.round.id, round: job && job.round });
    }
    if (msg.type === 'askall:test') {
      // Settings > Test site: run it here so it survives the Settings tab being hidden.
      return A.testSite(msg.siteId, msg.returnTabId);
    }
    if (msg.type === 'askall:stop') {
      if (job) job.cancel.stopped = true;
      return Promise.resolve({ ok: true });
    }
    if (msg.type === 'askall:run') {
      if (job) return Promise.resolve({ ok: false, error: 'busy' });
      const cancel = { stopped: false };
      job = { id: msg.job.round.id, round: msg.job.round, cancel };
      const t = { last: 0, timer: null };
      const publish = (round, force) => {
        // Throttle storage writes while text streams in; always write status changes.
        job && (job.round = round);
        const now = Date.now();
        const write = () => { t.last = Date.now(); t.timer = null; extApi.storage.local.set({ liveRound: JSON.parse(JSON.stringify(round)) }); };
        if (force || now - t.last > 400) { if (t.timer) clearTimeout(t.timer); write(); }
        else if (!t.timer) t.timer = setTimeout(write, 400 - (now - t.last));
      };
      A.runJob(Object.assign({}, msg.job, { cancel }), { publish })
        .catch((e) => console.error('Ask All job failed', e))
        .finally(async () => {
          const round = job.round;
          job = null;
          if (t.timer) clearTimeout(t.timer);
          await extApi.storage.local.set({ liveRound: Object.assign(JSON.parse(JSON.stringify(round)), { _finished: Date.now() }) });
        });
      return Promise.resolve({ ok: true });
    }
    return undefined;
  });
}
