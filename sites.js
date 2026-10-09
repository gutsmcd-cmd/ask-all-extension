// Ask All (PC) - per-site settings. ALL page selectors live in this one file.
//
// These chat sites change their page layout often. When one breaks, you don't
// need to edit this file: open the extension's Settings page, pick the site,
// edit its JSON there and press Save (Reset puts these defaults back).
//
// Every list is tried in order; the first selector that matches wins.
//   composer      - the box you type into (textarea or contenteditable editor)
//   send          - the send button (if none is found, Enter is pressed instead)
//   stop          - the "stop generating" button (while visible = still answering)
//   busy          - other "still answering" signs (e.g. data-is-streaming="true")
//   answer        - one element per assistant reply; the LAST one is read
//   answerExclude - parts inside a reply to leave out (thinking boxes, buttons...)
//   loggedOut     - signs you are logged out (only checked if no composer is found)
//   newChatUrl    - page that starts a fresh chat
//   stableMs      - reply must stop changing for this long to count as finished
//
// Selector sources (all checked October 2026, see README "Where the selectors come from"):
//   [T] github.com/mvanhorn/agent-tincan extension/send.js          (pushed 2026-10-08)
//   [M] github.com/teddashh/multi-ai-chat-desktop adapters/*.json    (adapters changed 2026-09-21..30)
//   [V] github.com/Milvago-AI/milvago-agent extension/adapters.js    (Gemini measured 2026-09-14, pushed 2026-10-06)
//   [O] github.com/MaxITService/OneClickPrompts utils.js             (DeepSeek notes 2026-09, pushed 2026-10-05)
//   [C] github.com/jackwener/OpenCLI clis/deepseek/utils.js
//   [A] github.com/martin-pok/agentree extension/sites.js            (pushed 2026-10-08)
// Generic fallbacks are at the end of each list.

const ASK_ALL_SELECTORS_DATE = '2026-10-09';

const ASK_ALL_SITES = [
  {
    id: 'grok',
    name: 'Grok',
    defaultOn: true,
    hosts: ['grok.com'],
    match: ['https://grok.com/*'],
    config: {
      newChatUrl: 'https://grok.com/',
      composer: [
        '[data-testid="chat-input"] .ProseMirror[contenteditable="true"]',      // [M]
        'div[contenteditable="true"][aria-label="Ask Grok anything"]',          // [T]
        'form div.ProseMirror[contenteditable="true"]',                         // [T]
        'div.ProseMirror[contenteditable="true"]',
        'textarea[aria-label*="Ask Grok" i]',                                   // [T] older layout
        'form textarea'
      ],
      send: [
        'button[data-testid="chat-submit"]',                                    // [M][V]
        'form button[type="submit"][aria-label="Submit"]',                      // [T]
        'button[aria-label="Submit"]',
        'form button[type="submit"]'
      ],
      stop: [
        'button[data-testid="chat-stop"]',                                      // [M]
        'button[aria-label="Stop model response"]',                             // [T]
        'button[aria-label="Stop model"]',
        'button[aria-label*="Stop" i]'
      ],
      busy: ['[data-streaming="true"]'],                                        // [T][M]
      answer: [
        'div[id^="response-"].items-start .response-content-markdown',          // [T] + [M]
        '[data-testid="assistant-message"] .response-content-markdown',         // [M]
        'div[id^="response-"].items-start',                                     // [T]
        '[data-testid="assistant-message"]',                                    // [M][V]
        '.message-bubble.assistant'                                             // [M]
      ],
      answerExclude: ['.thinking-container', 'button', 'svg'],
      loggedOut: ['a[href^="/sign-in"]', 'a[href*="accounts.x.ai/sign-in"]', '[data-testid="anon-paywall-sign-up-card"]'],
      stableMs: 2000
    }
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    defaultOn: true,
    hosts: ['chatgpt.com', 'chat.openai.com'],
    match: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
    config: {
      newChatUrl: 'https://chatgpt.com/',
      composer: [
        '#prompt-textarea[contenteditable="true"]',                             // [T][M]
        'div.ProseMirror[contenteditable="true"]',                              // [M]
        '#prompt-textarea',
        'form div[contenteditable="true"]',                                     // [T]
        'textarea[name="prompt-textarea"]'                                      // [A]
      ],
      send: [
        'button[data-testid="send-button"]',                                    // [T][M]
        '#composer-submit-button',                                              // [T]
        'button[aria-label="Send prompt"]',                                     // [M]
        'button[aria-label*="Send" i]'
      ],
      stop: [
        'button[data-testid="stop-button"]',                                    // [T][M][A]
        'button[aria-label="Stop streaming"]',                                  // [M]
        'button[aria-label*="Stop" i]'
      ],
      busy: ['.result-streaming'],                                              // [T]
      answer: [
        '[data-message-author-role="assistant"] .markdown',                     // [M]
        '[data-message-author-role="assistant"]'                                // [T][M][A]
      ],
      answerExclude: ['button', 'svg', '.sr-only'],
      loggedOut: ['[data-testid="login-button"]', 'a[href*="/auth/login"]'],  // ChatGPT also works logged out (we warn)
      stableMs: 2000
    }
  },
  {
    id: 'claude',
    name: 'Claude',
    defaultOn: true,
    hosts: ['claude.ai'],
    match: ['https://claude.ai/*'],
    config: {
      newChatUrl: 'https://claude.ai/new',
      composer: [
        'div.ProseMirror[contenteditable="true"]',                              // [T][M][A]
        '[data-testid="chat-input"] [contenteditable="true"]',                  // [A]
        'fieldset div[contenteditable="true"]',                                 // [T][M]
        '[contenteditable="true"][role="textbox"]'                              // [V]
      ],
      send: [
        'button[data-testid="chat-input-send"]',                                // [V]
        'button[aria-label="Send message"]',                                    // [T][M]
        'button[aria-label="Send Message"]',                                    // [M]
        'button[aria-label*="Send" i]',
        'fieldset button[type="submit"]'                                        // [T]
      ],
      stop: [
        'button[aria-label="Stop response"]',                                   // [T][M]
        'button[aria-label="Stop Response"]',                                   // [M]
        'button[data-testid="stop-button"]',
        'button[aria-label*="Stop" i]'
      ],
      busy: ['[data-is-streaming="true"]'],                                     // [T][M][A]
      answer: [
        '[data-is-streaming] .font-claude-response',                            // [M]
        '.font-claude-response',                                                // [T][M]
        '[data-is-streaming]',                                                  // [T][A]
        '.font-claude-message',                                                 // [T][M]
        '[data-testid="assistant-message"]'                                     // [T][V]
      ],
      answerExclude: ['button', 'svg'],
      loggedOut: ['a[href="/login"]', 'input[type="email"]'],                   // [T][M]
      stableMs: 2000
    }
  },
  {
    id: 'gemini',
    name: 'Gemini',
    defaultOn: true,
    hosts: ['gemini.google.com'],
    match: ['https://gemini.google.com/*'],
    config: {
      newChatUrl: 'https://gemini.google.com/app',
      composer: [
        'rich-textarea div.ql-editor[contenteditable="true"]',                  // [T][M][A]
        'div.ql-editor[contenteditable="true"]',                                // [T][M]
        'rich-textarea [contenteditable="true"]',                               // [V][M]
        '.input-area [contenteditable="true"]'                                  // [M]
      ],
      send: [
        '.send-button button',                                                  // [V] measured 2026-09-14
        'button.send-button',                                                   // [T][M]
        'button[aria-label="Send message"]',                                    // [M]
        'button[aria-label*="Send" i]'                                          // [T]
      ],
      stop: [
        'button[aria-label="Stop response"]',                                   // [M]
        'button[aria-label*="Stop" i]'                                          // [T]
      ],
      busy: ['.response-streaming', '[data-test-id="response-loading"]'],     // [M]
      answer: [
        'model-response message-content .markdown',                             // [M]
        'model-response .markdown',                                             // [M]
        '.model-response-text',                                                 // [M]
        'model-response message-content',                                       // [T][M]
        'model-response'                                                        // [T][V]
      ],
      answerExclude: ['button', 'svg', 'mat-icon', '.cdk-visually-hidden'],
      loggedOut: ['a[href*="accounts.google.com/ServiceLogin"]', 'a[href*="accounts.google.com/v3/signin"]'], // [T]
      stableMs: 2500
    }
  },
  {
    id: 'meta',
    name: 'Meta AI',
    defaultOn: false,
    hosts: ['www.meta.ai', 'meta.ai'],
    match: ['https://www.meta.ai/*', 'https://meta.ai/*'],
    config: {
      newChatUrl: 'https://www.meta.ai/',
      composer: [
        'textarea[aria-label="Ask Meta AI"]',                                   // [M]
        '[contenteditable="true"][aria-label="Ask Meta AI"]',                   // [M]
        'textarea[data-ecto-composer-prehydration-input]',                      // [M]
        'input[aria-label="Ask Meta AI"]',                                      // [M]
        '[contenteditable="true"][role="textbox"]',                             // [M]
        'textarea'
      ],
      send: [
        '[data-testid="composer-send-button"]',                                 // [M]
        'button[aria-label="Send"]',                                            // [M]
        'div[role="button"][aria-label="Send"]',
        'button[aria-label*="Send" i]'
      ],
      stop: [
        '[data-testid="composer-stop-button"]',                                 // [M]
        'button[aria-label="Stop"]',                                            // [M]
        '[role="button"][aria-label*="Stop" i]'
      ],
      busy: [],
      answer: [
        '[data-message-item]:not([data-user-message])',                         // [M]
        '[data-testid="assistant-message"]'                                     // [M]
      ],
      answerExclude: ['button', 'svg', '[role="button"]'],
      loggedOut: ['[data-testid="login-button"]', '[inert] textarea[data-ecto-composer-prehydration-input]', '[inert] [aria-label="Ask Meta AI"]'], // [M]
      stableMs: 3000
    }
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    defaultOn: false,
    hosts: ['chat.deepseek.com'],
    match: ['https://chat.deepseek.com/*'],
    config: {
      newChatUrl: 'https://chat.deepseek.com/',
      composer: [
        'textarea[placeholder*="DeepSeek"]',                                    // [C][O]
        '#chat-input',
        'textarea[placeholder*="Message" i]',                                   // [O]
        '[class*="chat-input"] textarea',                                       // [O]
        'textarea'                                                              // [V][O]
      ],
      send: [
        'div[role="button"].ds-button--primary.ds-button--circle:not(.ds-button--disabled)', // [V][O]
        '.ds-button--primary.ds-button--circle:not(.ds-button--disabled)',      // [O]
        'button[aria-label*="Send" i]'
      ],
      stop: [
        'div[role="button"][aria-label*="stop" i]',
        'button[aria-label*="stop" i]',
        '.ds-button--primary.ds-button--circle:has(svg path[d*="4.88"])'        // [O] square "stop" icon, 2026-09
      ],
      busy: [],
      answer: [
        '.ds-message .ds-markdown:not(.ds-markdown--think)',                     // [C]
        '[data-message-role="assistant"]',                                      // [V]
        '.ds-markdown:not(.ds-markdown--think)'                                 // [C]
      ],
      answerExclude: ['.ds-markdown--think', '[class*="think"]', 'button', 'svg', '[role="button"]'],
      loggedOut: ['input[type="password"]', 'a[href*="/sign_in"]'],
      stableMs: 4000
    }
  }
];

// Global defaults (also editable in Settings).
const ASK_ALL_DEFAULT_SETTINGS = {
  enabled: Object.fromEntries(ASK_ALL_SITES.map((s) => [s.id, s.defaultOn])),
  combiner: 'grok',
  factCheck: false,
  newChatEachRound: true,
  pinTabs: true,
  timeoutSec: 180,
  pollMs: 700
};

// Merge a user override (from Settings) over the built-in config of one site.
function askAllSiteConfig(siteId, overrides) {
  const site = ASK_ALL_SITES.find((s) => s.id === siteId);
  if (!site) return null;
  const o = (overrides && overrides[siteId]) || {};
  return Object.assign({}, site.config, o);
}

if (typeof globalThis !== 'undefined') {
  globalThis.ASK_ALL_SITES = ASK_ALL_SITES;
  globalThis.ASK_ALL_DEFAULT_SETTINGS = ASK_ALL_DEFAULT_SETTINGS;
  globalThis.ASK_ALL_SELECTORS_DATE = ASK_ALL_SELECTORS_DATE;
  globalThis.askAllSiteConfig = askAllSiteConfig;
}
