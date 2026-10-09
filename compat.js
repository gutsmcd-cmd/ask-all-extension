// Ask All - tiny cross-browser shim, loaded first on every extension page
// (and in the Firefox background page).
//   ext            - the extension API: `browser` in Firefox, `chrome` in Chrome
//                    (both return promises the way this code uses them).
//   AskAllEnv      - what this browser can do, so one codebase runs in desktop
//                    Chrome, desktop Firefox and Firefox for Android.
(() => {
  const g = globalThis;
  const ext = (typeof g.browser !== 'undefined' && g.browser && g.browser.runtime && g.browser.runtime.getBrowserInfo)
    ? g.browser
    : g.chrome;
  g.ext = ext;

  const isFirefox = !!(ext && ext.runtime && ext.runtime.getBrowserInfo);
  // Android: Firefox has no windows API there. getPlatformInfo() confirms it (async).
  const uaAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
  let platformPromise = null;

  const AskAllEnv = {
    isFirefox,
    hasWindows: !!(ext && ext.windows && ext.windows.update),
    // true/false once known; use platform() when it matters.
    isAndroid: uaAndroid,
    async platform() {
      if (!platformPromise) {
        platformPromise = (async () => {
          let os = '';
          try { os = (await ext.runtime.getPlatformInfo()).os; } catch (e) { /* ignore */ }
          AskAllEnv.isAndroid = os === 'android' || (!os && uaAndroid);
          return { os, android: AskAllEnv.isAndroid };
        })();
      }
      return platformPromise;
    },
    // Background runner = the Firefox background page does the work, so it keeps
    // going while the Hub tab is hidden (Android freezes hidden tabs completely).
    // Chrome's service worker can be stopped at any time, so Chrome runs in the Hub
    // page exactly as before.
    hasBackgroundRunner: isFirefox
  };
  g.AskAllEnv = AskAllEnv;
})();
