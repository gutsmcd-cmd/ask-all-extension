# Ask All (PC)

A small Chrome extension for Windows (or any desktop Chrome) that asks **one question to several AI chat sites at once**, using the tabs you are already logged in to, and then has one of them write a **combined answer**.

- Sites: **Grok**, **ChatGPT**, **Claude**, **Gemini**, plus optional **Meta AI** (Llama) and **DeepSeek**. Each one can be switched on or off.
- No API keys, no accounts with anyone new, no server. It uses your normal logged-in browser tabs.
- **Combine** sends all answers to one AI (Grok by default, you choose) as *Answer A, B, C…*, so it doesn't know which AI wrote which. You get: the combined best answer, strongest agreement, disagreements (by letter), points only one answer made, likely errors / things to double-check, and what may have been true earlier but is outdated now. Only you see which letter is which AI.
- **Fact-check mode** asks every AI to list the claims in your text and mark each **True / False / Outdated / Unclear**, with dates and source links.
- Keeps the **last 50 rounds** on your PC (Chrome's local extension storage). Nothing is sent anywhere else: no analytics, no remote code.

It only works in desktop Chrome (or Edge/Brave), not on phones.

---

## Install (about 2 minutes)

1. Download the ZIP: **https://github.com/gutsmcd-cmd/ask-all-extension/archive/refs/heads/main.zip**
   The repository is private, so be logged in to GitHub in that browser, or use the green **Code → Download ZIP** button on the repo page.
2. Unzip it (right-click → *Extract All…*). You get a folder called `ask-all-extension-main`. Put it somewhere it can stay, e.g. `Documents\ask-all-extension-main`. Don't delete it later: Chrome runs the extension from that folder.
3. In Chrome, go to **`chrome://extensions`**.
4. Turn on **Developer mode** (switch at the top right).
5. Click **Load unpacked** and pick the `ask-all-extension-main` folder (the one that contains `manifest.json`).
6. Click the puzzle-piece icon in the toolbar and **pin** "Ask All (PC)". It shows as a letter "A" for now.

Chrome may show a "developer mode extensions" notice on start-up. That's normal for extensions you load yourself; just close it.

**Updating later:** download the ZIP again, replace the folder's files, then press the ↻ reload button on the extension's card in `chrome://extensions`. Your history and settings are kept.

## Before the first use: log in to each site

In normal Chrome tabs, open and log in to each site you want to use:

- https://grok.com
- https://chatgpt.com
- https://claude.ai
- https://gemini.google.com
- (optional) https://www.meta.ai
- (optional) https://chat.deepseek.com

Stay logged in. Close any welcome pop-ups or cookie banners once, because they can cover the message box.

## Using it

1. Click the **Ask All** button in the toolbar. The Hub page opens.
2. Type your question. Tick the sites you want, and tick **Fact-check mode** if you're checking a claim.
3. Press **Send to all** (or Ctrl+Enter).
   For each site, Ask All finds that site's tab, or opens it **pinned in the background**. It starts a new chat, types your question and sends it. Then it waits until the answer has finished: the Stop button has gone and the text has stopped changing for about 2 seconds (3 minutes at most).
4. Each answer appears in its own panel with a status: *opening tab → typing → waiting for answer → done* (or an error). Each panel has **Copy**, **Retry** and **Go to tab**.
5. Choose who writes the combined answer ("Written by") and press **Combine**. It always uses a **new chat**.
6. Click any round in **History** to see it again, or to Combine it later.

Tips:
- Leave the Hub tab open while it works. Closing it stops the round (the questions already sent stay in each site).
- If an answer looks cut off or stuck, click **Go to tab**. Chrome sometimes slows down pages in background tabs, and looking at the tab wakes it up. Then press **Retry** if needed.
- Ask All never re-sends a question by itself. Only **Retry** sends it again, to that one site.
- "New chat each round" is on by default. If you turn it off, follow-up questions go into the same chat on each site.

### Status / error messages

| Message | What to do |
|---|---|
| **Not logged in** | Click *Go to tab*, log in, press *Retry*. |
| **Could not find the message box** | The page didn't finish loading, a pop-up is covering it, or the site changed its layout. Look at the tab first. If it keeps happening, see "When a site breaks" below. |
| **Typed the question but it did not send** | The send button has probably changed. Check the tab and fix the `send` selectors. |
| **Timed out** | Very long answers (e.g. "deep research") can take longer. Raise the time limit in Settings. Any partial answer is still shown. |

## When a site breaks (it will, now and then)

These sites change their page layout every few weeks. Ask All finds things on the page with **CSS selectors**, and all of them are in one place, so a fix is usually one line.

1. Open **Settings** (link at the top of the Hub, or right-click the toolbar button → *Options*).
2. Pick the site and press **Test site**. This opens the site, or uses its tab if already open, and checks it can find the message box. It doesn't type anything.
3. If something isn't found, go to the site's tab, right-click the part that's broken (the message box, the send button, an answer) → **Inspect**, and look for a stable attribute such as `data-testid="…"`, `aria-label="…"` or `id="…"`.
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

No one can see these sites' code from outside, so the built-in selectors were put together on **2026-10-09**. They come from recent open-source projects that automate the same sites:

| Tag in `sites.js` | Project | Date checked |
|---|---|---|
| [T] | [mvanhorn/agent-tincan](https://github.com/mvanhorn/agent-tincan) `extension/send.js` | last push 2026-10-08 |
| [M] | [teddashh/multi-ai-chat-desktop](https://github.com/teddashh/multi-ai-chat-desktop) `adapters/*.json` | adapters updated 2026-09-21 to 09-30 |
| [V] | [Milvago-AI/milvago-agent](https://github.com/Milvago-AI/milvago-agent) `extension/adapters.js` | Gemini measured 2026-09-14, last push 2026-10-06 |
| [O] | [MaxITService/OneClickPrompts](https://github.com/MaxITService/OneClickPrompts) `utils.js` | DeepSeek notes 2026-09, last push 2026-10-05 |
| [C] | [jackwener/OpenCLI](https://github.com/jackwener/OpenCLI) `clis/deepseek/utils.js` | checked 2026-10-09 |
| [A] | [martin-pok/agentree](https://github.com/martin-pok/agentree) `extension/sites.js` | last push 2026-10-08 |

Every list ends with more general fallbacks. Meta AI and DeepSeek have the fewest sources, so they're the most likely to need a fix.

## Fair use

This is a personal tool. It does what you'd do by hand (type, press send, read the answer), in your own logged-in tabs. Automating a website's interface can still go against that site's terms of service, so:

- use it at a **normal personal pace**, one question at a time, and no loops or scripts that hammer the sites;
- don't use it to get around usage limits or to resell answers;
- each site's own limits and rules still apply to your account.

Free tiers may use your chats for training, so keep private things out.

## Privacy and permissions

- `tabs`: find and open the chat sites' tabs, and the *Go to tab* button
- `scripting`: put the small helper (`content.js`) into those tabs only while a question is being sent or read
- `storage`: your settings, selector edits and the last 50 rounds, saved on this PC only
- Host access only for: grok.com, chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, meta.ai, chat.deepseek.com

No background polling (nothing runs when you're not asking), no analytics, no remote code. All the code is in this folder.

## Files

| File | What it is |
|---|---|
| `manifest.json` | Extension manifest (Manifest V3) |
| `background.js` | Opens the Hub when you click the toolbar button |
| `hub.html / hub.js / hub.css` | The main page |
| `settings.html / settings.js` | Settings, selector editor, Test site |
| `runner.js` | Opening tabs, sending, waiting for answers, the combine and fact-check prompts |
| `content.js` | Helper put into the chat tabs: types, sends, reads the newest answer |
| `sites.js` | **All per-site selectors** |
| `dev-test/` | Developer-only automated test with fake versions of the sites. Not needed for normal use. |

## Developer test (optional)

`dev-test/` holds an end-to-end test. It loads the real extension into Playwright's Chromium and points grok.com, chatgpt.com and the others at **local fake pages**, using Chromium's `--host-resolver-rules` and a self-signed certificate. Each fake page copies a site's message box, send and stop buttons, and streaming answer. The extension code isn't changed for the test.

```
cd dev-test
npm install
npx playwright install chromium
npm test
```

It checks parallel sending, answers that pause while streaming, a logged-out site and a timed-out site that don't break the others, the anonymised combine prompt, Retry, history surviving a browser restart, and the Settings page. **It only proves the logic against the fake pages. The real sites' current layouts can only be confirmed by using it while logged in.**

## License

MIT, see [LICENSE](LICENSE).
