# Ask All

A small browser extension that asks **one question to several AI chat sites at once**, using the tabs you are already logged in to, and then has one of them write a **combined answer**.

It runs in **desktop Chrome** (and Edge/Brave), **desktop Firefox**, and **Firefox for Android**, all from this one codebase.

- Sites: **Grok**, **ChatGPT**, **Claude**, **Gemini**, plus optional **Meta AI** (Llama) and **DeepSeek**. Each one can be switched on or off.
- No API keys, no accounts with anyone new, no server. It uses your normal logged-in browser tabs.
- **Combine** sends all answers to one AI (Grok by default, you choose) as *Answer A, B, C…*, so it doesn't know which AI wrote which. You get: the combined best answer, strongest agreement, disagreements (by letter), points only one answer made, likely errors / things to double-check, and what may have been true earlier but is outdated now. Only you see which letter is which AI.
- **Fact-check mode** asks every AI to list the claims in your text and mark each **True / False / Outdated / Unclear**, with dates and source links.
- Keeps the **last 50 rounds** in the browser's local extension storage. Nothing is sent anywhere else: **free, no ads, no analytics, no login to us, no remote code.**

---

## Install on a computer (Chrome, Edge, Brave)

1. Download the ZIP: **https://github.com/gutsmcd-cmd/ask-all-extension/archive/refs/heads/main.zip**
   (Or use the green **Code → Download ZIP** button on the repo page.)
2. Unzip it (right-click → *Extract All…*). You get a folder called `ask-all-extension-main`. Put it somewhere it can stay, e.g. `Documents\ask-all-extension-main`. Don't delete it later: Chrome runs the extension from that folder.
3. In Chrome, go to **`chrome://extensions`**.
4. Turn on **Developer mode** (switch at the top right).
5. Click **Load unpacked** and pick the `ask-all-extension-main` folder (the one that contains `manifest.json`).
6. Click the puzzle-piece icon in the toolbar and **pin** "Ask All (PC)". It shows as a letter "A" for now.

Chrome may show a "developer mode extensions" notice on start-up. That's normal for extensions you load yourself; just close it.

**Updating later:** download the ZIP again, replace the folder's files, then press the ↻ reload button on the extension's card in `chrome://extensions`. Your history and settings are kept.

## Install in Firefox (Android phone or computer)

Once the add-on is on addons.mozilla.org (see [For the maintainer](#for-the-maintainer-publishing-the-firefox-version) below):

1. On an Android phone, install **Firefox** from the Play Store (free). Chrome for Android can't run extensions at all; Firefox can.
2. In Firefox, open the add-on's page on addons.mozilla.org and tap **Add to Firefox**, then **Add**.
   On a computer it's the same: open the page in desktop Firefox and click **Add to Firefox**.
3. In Firefox, log in to each site you want to use (see the list below).
4. Open Ask All: on Android, **⋮ menu → Extensions → Ask All**. On a computer, click the Ask All toolbar button.
5. The first time on a phone, Ask All asks how you want to see the answers:
   - **Landscape (recommended):** hold the phone sideways; answers sit side by side in columns and you swipe left and right to compare them.
   - **Portrait:** answers are stacked; you scroll down through them.
   You can change this later in **Settings → Hub layout** (or the **Layout** button at the top of the Hub).

**How it works on a phone:** Firefox for Android freezes tabs that are not on screen, so an AI in a hidden tab never finishes its answer. On Android, Ask All therefore asks the sites **one at a time**: each site's tab comes to the front while it types and answers (you can watch), then the next one, and at the end you're brought back to the Hub with all the answers. A round with 4 sites takes as long as the 4 answers added together, usually 1–3 minutes. Keep Firefox open and the screen on until it's done; **Stop** ends it early. On a computer, all sites are asked at once in background tabs, as before. (Settings → *Ask the sites* lets you choose.)

## Before the first use: log in to each site

In normal tabs of the same browser, open and log in to each site you want to use:

- https://grok.com
- https://chatgpt.com
- https://claude.ai
- https://gemini.google.com
- (optional) https://www.meta.ai
- (optional) https://chat.deepseek.com

Stay logged in. Close any welcome pop-ups or cookie banners once, because they can cover the message box.

## Using it

1. Open the Hub: click the **Ask All** toolbar button (on Android: ⋮ → Extensions → Ask All).
2. Type your question. Tick the sites you want, and tick **Fact-check mode** if you're checking a claim.
3. Press **Send to all** (or Ctrl+Enter on a computer).
   For each site, Ask All finds that site's tab, or opens it (pinned in the background on a computer). It starts a new chat, types your question and sends it. Then it waits until the answer has finished: the Stop button has gone and the text has stopped changing for about 2 seconds (3 minutes at most).
4. Each answer appears in its own panel with a status: *waiting its turn (phone) → opening tab → typing → waiting for answer → done* (or an error). Each panel has **Copy**, **Retry** and **Go to tab**. **Stop** ends a round early and keeps what has arrived.
5. Choose who writes the combined answer ("Written by") and press **Combine**. It always uses a **new chat**.
6. Click any round in **History** to see it again, or to Combine it later.

Tips:
- In Chrome, leave the Hub tab open while it works (closing it stops the round; the questions already sent stay in each site). In Firefox the round carries on even if you close or leave the Hub tab; open it again to see the results.
- If an answer looks cut off or stuck, click **Go to tab**. Browsers sometimes slow down pages in background tabs, and looking at the tab wakes it up. Then press **Retry** if needed.
- Ask All never re-sends a question by itself. Only **Retry** sends it again, to that one site.
- "New chat each round" is on by default. If you turn it off, follow-up questions go into the same chat on each site.
- On a phone, if a site doesn't work in its phone layout, open that tab's **⋮** menu, turn on **Desktop site**, and press **Retry**.

### Status / error messages

| Message | What to do |
|---|---|
| **Not logged in** | Click *Go to tab*, log in, press *Retry*. |
| **Could not find the message box** | The page didn't finish loading, a pop-up is covering it, or the site changed its layout. Look at the tab first. If it keeps happening, see "When a site breaks" below. |
| **Typed the question but it did not send** | The send button has probably changed. Check the tab and fix the `send` selectors. |
| **Timed out** | Very long answers (e.g. "deep research") can take longer. Raise the time limit in Settings. Any partial answer is still shown. |
| **Stopped** | You pressed Stop. Any partial answer is still shown. |

## When a site breaks (it will, now and then)

These sites change their page layout every few weeks. Ask All finds things on the page with **CSS selectors**, and all of them are in one place, so a fix is usually one line.

1. Open **Settings** (link at the top of the Hub; or right-click the toolbar button → *Options* in Chrome / *Manage Extension → Preferences* in Firefox).
2. Pick the site and press **Test site**. This opens the site, or uses its tab if already open, and checks it can find the message box. It doesn't type anything. (On Android the site comes to the front for a moment, then you're brought back.)
3. If something isn't found, go to the site's tab on a computer, right-click the part that's broken (the message box, the send button, an answer) → **Inspect**, and look for a stable attribute such as `data-testid="…"`, `aria-label="…"` or `id="…"`.
4. Add a selector for it at the **top** of the matching list in the JSON. Press **Save**, then **Test site** again.
5. **Reset to defaults** puts back the built-in selectors.

What each list is for:

- `composer`: the box you type in
- `send`: the send button. If none is found, Enter is pressed instead.
- `stop`: the "stop generating" button. While it's visible, the AI is still answering.
- `busy`: other signs that it's still answering, e.g. `[data-is-streaming="true"]`
- `answer`: one element per AI reply. The last one is read.
- `answerExclude`: parts inside a reply to leave out, such as "thinking" boxes and buttons
- `loggedOut`: signs that you're logged out (only checked when no message box is found)
- `newChatUrl`: the page that starts a fresh chat
- `stableMs`: how long the reply must stay unchanged before it counts as finished
- optional `inputMode: "insertText"`: try typing before pasting, if a site ignores the paste method

You can also edit the built-in defaults directly in [`sites.js`](sites.js). Every per-site selector lives in that one file.

### Where the selectors come from

No one can see these sites' code from outside, so the built-in selectors were put together on **2026-10-09**, for the **desktop** layouts. They come from recent open-source projects that automate the same sites:

| Tag in `sites.js` | Project | Date checked |
|---|---|---|
| [T] | [mvanhorn/agent-tincan](https://github.com/mvanhorn/agent-tincan) `extension/send.js` | last push 2026-10-08 |
| [M] | [teddashh/multi-ai-chat-desktop](https://github.com/teddashh/multi-ai-chat-desktop) `adapters/*.json` | adapters updated 2026-09-21 to 09-30 |
| [V] | [Milvago-AI/milvago-agent](https://github.com/Milvago-AI/milvago-agent) `extension/adapters.js` | Gemini measured 2026-09-14, last push 2026-10-06 |
| [O] | [MaxITService/OneClickPrompts](https://github.com/MaxITService/OneClickPrompts) `utils.js` | DeepSeek notes 2026-09, last push 2026-10-05 |
| [C] | [jackwener/OpenCLI](https://github.com/jackwener/OpenCLI) `clis/deepseek/utils.js` | checked 2026-10-09 |
| [A] | [martin-pok/agentree](https://github.com/martin-pok/agentree) `extension/sites.js` | last push 2026-10-08 |

Every list ends with more general fallbacks. Meta AI and DeepSeek have the fewest sources, so they're the most likely to need a fix. The phone layouts of these sites haven't been checked yet (see "Desktop site" tip above).

## Fair use

This is a personal tool. It does what you'd do by hand (type, press send, read the answer), in your own logged-in tabs. Automating a website's interface can still go against that site's terms of service, so:

- use it at a **normal personal pace**, one question at a time, and no loops or scripts that hammer the sites;
- don't use it to get around usage limits or to resell answers;
- each site's own limits and rules still apply to your account.

Free tiers may use your chats for training, so keep private things out.

## Privacy and permissions

- `tabs`: find and open the chat sites' tabs, and the *Go to tab* button
- `scripting`: put the small helper (`content.js`) into those tabs only while a question is being sent or read
- `storage`: your settings, selector edits and the last 50 rounds, saved on this device only
- Host access only for: grok.com, chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, meta.ai, chat.deepseek.com

No background polling (nothing runs when you're not asking), no analytics, no remote code. All the code is in this folder. In Firefox the add-on declares "no data collected" (`data_collection_permissions: none`): your question only goes to the AI sites you picked, typed into your own tabs, the same as typing it yourself.

## Files

| File | What it is |
|---|---|
| `manifest.json` | **Chrome** manifest (Manifest V3, service worker) |
| `firefox/manifest.json` | **Firefox** manifest (desktop + Android; Manifest V2, persistent background page; id `ask-all@gutsmcd-cmd.github.io`) |
| `compat.js` | Tiny shim: `browser.*` in Firefox, `chrome.*` in Chrome, and what this browser can do (Android? windows?) |
| `background.js` | Opens the Hub from the toolbar button. In Firefox it also runs the rounds, so they survive the Hub tab being hidden |
| `hub.html / hub.js / hub.css` | The main page (computer grid, phone landscape columns, phone portrait cards) |
| `settings.html / settings.js` | Settings, selector editor, Test site |
| `runner.js` | Opening tabs, sending, waiting for answers, all-at-once vs one-at-a-time, the combine and fact-check prompts |
| `content.js` | Helper put into the chat tabs: types, sends, reads the newest answer |
| `sites.js` | **All per-site selectors** and default settings |
| `icons/icon.svg` | Icon (used by the Firefox build) |
| `tools/build-firefox.sh` | Builds `dist/firefox/` and an unsigned `.xpi` for Mozilla to sign |
| `dev-test/` | Developer-only automated tests with fake versions of the sites. Not needed for normal use. |

### Why two manifests

Chrome only accepts Manifest V3 with a service worker; Firefox has no service workers for extensions, and Mozilla recommends **Manifest V2** for extensions that target Firefox for Android (fuller Android support, host permissions granted at install, and a persistent background page that can't be put to sleep halfway through a round). Firefox keeps supporting MV2 and has promised at least 12 months' notice before any change. Everything except the manifest is shared, and `compat.js` papers over the differences.

---

## For the maintainer: publishing the Firefox version

Firefox (release) only installs add-ons that **Mozilla has signed**. Signing is free. There are two ways:

| | **A. Listed on addons.mozilla.org (recommended)** | B. Unlisted, self-distributed |
|---|---|---|
| Who can find it | Anyone, on addons.mozilla.org | Only people you send the file to |
| Install on Android | Open the link, tap **Add to Firefox** | Download the `.xpi`, then Settings → About Firefox → tap the logo 5 times → back to Settings → **Install extension from file** (Android 10+ only) |
| Updates | Automatic | Manual (unless you host an update manifest) |
| Review | Automatic checks, then usually live within minutes to a few days; Mozilla may review the code later | Automatic checks only, signed in minutes |

**Recommendation: A (listed).** It's the only way that's a one-tap install on a phone, it updates itself, and it's what you want for a free public extension.

### Steps (about 20 minutes, once)

1. Get the unsigned file `ask-all.xpi` (Grok Bot built it; or run `bash tools/build-firefox.sh` on a Mac/Linux machine with Node, which writes `dist/ask-all-firefox-<version>.xpi`).
2. Go to **https://addons.mozilla.org/developers/** and **Log in / Register** (a free Mozilla account; an email and password).
3. When asked, turn on **two-step authentication** (required for add-on developers). Use an authenticator app (Google Authenticator, Authy, 1Password, …) and **save the recovery codes**.
4. Accept the **Firefox Add-on Distribution Agreement** if asked, and set a display name for your developer profile.
5. Click **Submit a New Add-on** → **On this site** → upload `ask-all.xpi`.
   - Compatible platforms: tick **Firefox** and **Firefox for Android**.
   - "Do you need to submit source code?" → **No** (nothing is minified or generated).
6. Fill in the listing (copy from [AMO listing text](#amo-listing-text) below): name, summary, description, category (e.g. *Search Tools* or *Other*), license **MIT**, a support email or the GitHub link. No privacy policy is needed because it collects nothing.
7. In **Notes to reviewer**, paste the reviewer note below, then **Submit Version**.
8. When it's live, open the add-on's page on the phone in Firefox and tap **Add to Firefox**.

**Later updates:** bump `"version"` in `firefox/manifest.json` (and `manifest.json` for Chrome), rebuild (`bash tools/build-firefox.sh`), then on the add-on's page in the Developer Hub choose **Upload New Version**.

**Command-line alternative** (for B, or for updates): create API keys at https://addons.mozilla.org/developers/addon/api/key/ and run
`npx web-ext sign --source-dir dist/firefox --channel unlisted --api-key <JWT issuer> --api-secret <JWT secret>`
(`--channel listed` for the public listing). Keep the keys secret; never commit them.

### Why this repository is public

AMO doesn't need the repo (the `.xpi` contains the readable source), but it is public on purpose: the listing's homepage link (`homepage_url`) points here, anyone can check that the extension really collects nothing, and others can send selector fixes when a site changes. There are no secrets in it.

### AMO listing text

**Name:** Ask All – one question, every AI

**Summary (max 250 characters):** Ask Grok, ChatGPT, Claude and Gemini (plus Meta AI and DeepSeek) the same question in your own logged-in tabs, see the answers side by side, and have one AI combine them. Free, no ads, no tracking, no account.

**Description:**
> Type one question; Ask All types it into your own logged-in tabs of Grok, ChatGPT, Claude and Gemini (optionally Meta AI and DeepSeek), waits for each answer, and shows them side by side. Press Combine and one AI of your choice writes a combined answer from the anonymised answers (Answer A, B, C…): where they agree, where they disagree, what may be wrong, and what may be out of date. Fact-check mode asks each AI to mark every claim True / False / Outdated / Unclear with dates and sources.
>
> • Works on Firefox for Android (landscape columns or portrait cards) and desktop Firefox
> • No API keys and no new accounts: it uses the sites you're already logged in to
> • Free forever, no ads, no analytics, no data collection. Your question only goes to the AI sites you pick, in your own tabs, exactly as if you'd typed it
> • History of your last 50 rounds stays on your device
> • When a site changes its layout, fix it yourself in Settings (CSS selectors, with a "Test site" button)
>
> On Android, Firefox pauses tabs that aren't on screen, so Ask All asks the sites one at a time there: each site's tab comes to the front while it answers, then you're brought back to the results.
>
> Please use it at a normal personal pace; each AI site's own terms and limits still apply.

**Notes to reviewer:**
> Ask All automates the user's own logged-in tabs of grok.com, chatgpt.com, claude.ai, gemini.google.com (optional: meta.ai, chat.deepseek.com): it injects content.js with scripting.executeScript only while sending/reading a question, types the question, clicks send, and reads the newest reply back into the Hub page (hub.html). No remote code, no network requests of its own, no data collection. To test: log in to any of those sites with a free account, click the toolbar button (Android: Extensions → Ask All), type a question, press "Send to all". The repository also has an automated end-to-end test against local mock pages (dev-test/test-firefox.js). Source: plain unminified JS, no build step besides copying files (tools/build-firefox.sh).

### Known limits on Android

- Tested in desktop Firefox against mock sites only. Firefox for Android itself still needs a first try on a real phone.
- One at a time is slower than a computer (answers come one after another).
- Firefox must stay in the foreground with the screen on while it works. If you switch apps or the screen locks, Android pauses Firefox and the round pauses or fails; press **Retry** on the sites that didn't finish.
- The sites' phone layouts may differ from the desktop ones the selectors were made for. If a site fails, try **Desktop site** in that tab's menu and Retry, or fix its selectors.
- Firefox for Android sometimes doesn't report every open tab to extensions, so Ask All may open a second tab for a site; it remembers the tabs it opened.
- When a site's tab comes to the front, the phone's keyboard may pop up for a moment.

---

## Developer tests (optional)

`dev-test/` holds end-to-end tests. They point grok.com, chatgpt.com and the others at **local fake pages** with a self-signed certificate. Each fake page copies a site's message box, send and stop buttons, and streaming answer. The extension code isn't changed for the tests.

```
cd dev-test
npm install
npx playwright install chromium
npm test                 # Chrome: loads the extension into Playwright's Chromium
npm run test:firefox     # Firefox: builds dist/firefox, installs it as a temporary add-on via geckodriver
```

`npm run test:firefox` needs desktop Firefox and geckodriver (Selenium Manager downloads them if they're missing, or set `FIREFOX_BIN` and `GECKODRIVER`). It routes the site domains to the fake pages through a small local proxy.

They check parallel sending, answers that pause while streaming, a logged-out site and a timed-out site that don't break the others, the anonymised combine prompt, Retry, history, the Settings page and, in Firefox, the background runner, **one-at-a-time mode** (each site gets the question only after the previous one finished, with its tab in front, and the Hub comes back at the end), Stop, a round finishing after the Hub tab is closed, and the phone layouts (add `?phone=1` to the Hub's address to preview the phone layout on a computer). **They only prove the logic against the fake pages. The real sites' current layouts can only be confirmed by using it while logged in, and Firefox for Android needs a real phone.**

To try it on a phone during development without signing: connect it with USB debugging and run `npx web-ext run -t firefox-android --adb-device <id> --firefox-apk org.mozilla.firefox --source-dir dist/firefox` (temporary install, gone after Firefox restarts).

## License

MIT, see [LICENSE](LICENSE).
