// Ask All (PC) - page helper. Injected into a chat site's tab only while a
// question is being sent or read (via chrome.scripting). It never sends data
// anywhere except back to the Hub page, and it never re-sends a question.
// The selectors come from sites.js (or your edits in Settings) as `cfg`.

(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function qsa(sel, root) {
    try { return Array.from((root || document).querySelectorAll(sel)); } catch (e) { return []; }
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  function isUsable(el) {
    return isVisible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' &&
      !el.closest('[inert]') && !el.readOnly;
  }

  // First selector (in order) that has a usable element.
  function findFirst(list, test) {
    for (const sel of list || []) {
      const el = qsa(sel).find(test || isUsable);
      if (el) return { el, selector: sel };
    }
    return { el: null, selector: null };
  }

  // All elements of the first selector that matches anything (outermost only).
  function findAnswers(list) {
    for (const sel of list || []) {
      let els = qsa(sel);
      if (!els.length) continue;
      els = els.filter((el) => !els.some((o) => o !== el && o.contains(el)));
      return { els, selector: sel };
    }
    return { els: [], selector: null };
  }

  const isField = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
  const composerText = (el) => (isField(el) ? el.value || '' : el.innerText || el.textContent || '');
  const squash = (t) => String(t || '').replace(/\s+/g, '');

  function looksInserted(el, text) {
    const got = squash(composerText(el));
    const want = squash(text);
    if (!want) return true;
    return got.length >= want.length * 0.9 && got.includes(want.slice(0, 60)) && got.includes(want.slice(-30));
  }

  function selectAll(el) {
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function clearEditable(el) {
    selectAll(el);
    try { document.execCommand('delete', false); } catch (e) { /* ignore */ }
    if (squash(composerText(el))) {
      el.textContent = '';
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    }
  }

  // Type the question in a way rich editors (ProseMirror/Tiptap, Quill, Lexical, React) notice.
  async function insertText(el, text, mode) {
    el.focus();
    if (isField(el)) {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return looksInserted(el, text) ? 'value' : null;
    }
    const strategies = mode === 'insertText' ? ['insertText', 'paste', 'raw'] : ['paste', 'insertText', 'raw'];
    for (const how of strategies) {
      if (squash(composerText(el))) clearEditable(el);
      selectAll(el);
      try {
        if (how === 'paste') {
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        } else if (how === 'insertText') {
          document.execCommand('insertText', false, text);
        } else {
          el.textContent = text;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        }
      } catch (e) { /* try next */ }
      await sleep(300);
      if (looksInserted(el, text)) return how;
    }
    return null;
  }

  function pressEnter(el) {
    el.focus();
    const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', init));
    el.dispatchEvent(new KeyboardEvent('keypress', init));
    el.dispatchEvent(new KeyboardEvent('keyup', init));
  }

  function isGenerating(cfg) {
    if (findFirst(cfg.stop, isVisible).el) return true;
    for (const sel of cfg.busy || []) if (qsa(sel).length) return true;
    return false;
  }

  // ---- HTML -> simple Markdown/text ----
  function toMarkdown(root, exclude) {
    const skip = (el) => {
      const tag = el.tagName;
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG|BUTTON|TEXTAREA|INPUT|SELECT|IMG|VIDEO|AUDIO|CANVAS)$/i.test(tag)) return true;
      for (const sel of exclude || []) { try { if (el.matches(sel)) return true; } catch (e) { /* bad selector */ } }
      return false;
    };
    const walk = (node, ctx) => {
      if (node.nodeType === 3) return ctx.pre ? node.nodeValue : node.nodeValue.replace(/\s+/g, ' ');
      if (node.nodeType !== 1 || skip(node)) return '';
      const tag = node.tagName.toLowerCase();
      const kids = (c) => Array.from(node.childNodes).map((n) => walk(n, c || ctx)).join('');
      switch (tag) {
        case 'br': return '\n';
        case 'hr': return '\n\n---\n\n';
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
          return '\n\n' + '#'.repeat(+tag[1]) + ' ' + kids().trim() + '\n\n';
        case 'p': return '\n\n' + kids() + '\n\n';
        case 'pre': {
          const code = node.querySelector('code') || node;
          const lang = ((code.className || '').match(/language-([\w+-]+)/) || [])[1] || '';
          return '\n\n```' + lang + '\n' + (code.textContent || '').replace(/\n+$/, '') + '\n```\n\n';
        }
        case 'code': return ctx.pre ? kids() : '`' + (node.textContent || '') + '`';
        case 'strong': case 'b': { const t = kids(); return t.trim() ? '**' + t.trim() + '** ' : t; }
        case 'em': case 'i': { const t = kids(); return t.trim() ? '*' + t.trim() + '* ' : t; }
        case 'a': {
          const t = kids().trim();
          const href = node.getAttribute('href') || '';
          if (/^https?:/i.test(href)) return t && t !== href ? '[' + t + '](' + href + ')' : href;
          return t;
        }
        case 'ul': case 'ol': {
          const depth = ctx.depth || 0;
          let n = 0;
          const items = Array.from(node.children).filter((c) => c.tagName === 'LI').map((li) => {
            n++;
            const bullet = tag === 'ol' ? n + '. ' : '- ';
            const inner = Array.from(li.childNodes).map((c) => walk(c, Object.assign({}, ctx, { depth: depth + 1 }))).join('')
              .replace(/\n{2,}/g, '\n').trim();
            return '  '.repeat(depth) + bullet + inner;
          });
          return '\n' + items.join('\n') + '\n\n';
        }
        case 'blockquote': return '\n\n' + kids().trim().split('\n').map((l) => '> ' + l).join('\n') + '\n\n';
        case 'table': {
          const rows = Array.from(node.querySelectorAll('tr')).map((tr) =>
            '| ' + Array.from(tr.children).map((td) => walk(td, ctx).replace(/\s+/g, ' ').trim()).join(' | ') + ' |');
          if (rows.length > 1) {
            const cols = (rows[0].match(/\|/g) || []).length - 1;
            rows.splice(1, 0, '|' + ' --- |'.repeat(Math.max(cols, 1)));
          }
          return '\n\n' + rows.join('\n') + '\n\n';
        }
        case 'div': case 'section': case 'article': case 'li': case 'header': case 'footer':
          return '\n' + kids() + '\n';
        default: return kids();
      }
    };
    return walk(root, { depth: 0 })
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+(?![-*\d])/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function readAnswer(cfg) {
    const { els, selector } = findAnswers(cfg.answer);
    const last = els[els.length - 1];
    return {
      count: els.length,
      selector,
      text: last ? toMarkdown(last, cfg.answerExclude) : ''
    };
  }

  function loggedOutSign(cfg) {
    const hit = findFirst(cfg.loggedOut, () => true);
    return hit.el ? hit.selector : null;
  }

  // ---- actions called by the Hub ----
  const api = {
    // Look around without typing anything (Settings > Test site).
    probe(cfg) {
      const c = findFirst(cfg.composer);
      const s = findFirst(cfg.send);
      const a = readAnswer(cfg);
      return {
        url: location.href,
        composer: c.selector,
        send: s.selector,
        generating: isGenerating(cfg),
        answers: a.count,
        answerSelector: a.selector,
        loggedOut: loggedOutSign(cfg)
      };
    },

    // Type and submit once. Returns baseline info so the Hub can spot the new reply.
    async send(cfg, text) {
      let comp = { el: null };
      const t0 = Date.now();
      while (Date.now() - t0 < (cfg.composerWaitMs || 20000)) {
        comp = findFirst(cfg.composer);
        if (comp.el) break;
        await sleep(400);
      }
      if (!comp.el) {
        const lo = loggedOutSign(cfg);
        return { ok: false, error: lo ? 'not_logged_in' : 'composer_not_found', detail: lo ? 'Found: ' + lo : location.href };
      }
      if (isGenerating(cfg)) return { ok: false, error: 'busy', detail: 'The site is still answering something else.' };

      const before = readAnswer(cfg);
      const urlBefore = location.href;
      const how = await insertText(comp.el, text, cfg.inputMode);
      if (!how) return { ok: false, error: 'type_failed', detail: 'Could not type into ' + comp.selector };
      await sleep(400);

      let submitted = null;
      const s0 = Date.now();
      while (Date.now() - s0 < 6000) {
        const btn = findFirst(cfg.send).el;
        if (btn) { btn.click(); submitted = 'click'; break; }
        await sleep(250);
      }
      if (!submitted) { pressEnter(comp.el); submitted = 'enter'; }

      // Check that it went: composer cleared, stop button, new reply, or URL change.
      const sent = () => {
        const c = findFirst(cfg.composer).el || comp.el;
        return !squash(composerText(c)) || isGenerating(cfg) || readAnswer(cfg).count > before.count || location.href !== urlBefore;
      };
      const v0 = Date.now();
      let enterTried = submitted === 'enter';
      while (Date.now() - v0 < 10000) {
        if (sent()) return { ok: true, how, submitted, baseCount: before.count, baseText: before.text, composer: comp.selector };
        if (!enterTried && Date.now() - v0 > 3000) {
          // The click did nothing and our text is still in the box: try Enter once (cannot double-send).
          const c = findFirst(cfg.composer).el || comp.el;
          if (looksInserted(c, text)) { pressEnter(c); submitted += '+enter'; }
          enterTried = true;
        }
        await sleep(300);
      }
      return { ok: false, error: 'send_failed', detail: 'Typed the question but it did not send (' + submitted + ').' };
    },

    // Snapshot of the newest reply. The Hub calls this about once a second while waiting.
    read(cfg) {
      const a = readAnswer(cfg);
      return { count: a.count, text: a.text, selector: a.selector, generating: isGenerating(cfg), url: location.href };
    }
  };

  window.__askAll = api;
})();
