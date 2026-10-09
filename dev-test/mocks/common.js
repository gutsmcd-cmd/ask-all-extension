// Shared helpers for the mock chat sites (TEST ONLY).
window.Mock = {
  site: location.hostname,
  log(ev, data) {
    return fetch('/__log', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ site: location.hostname, ev, data, t: Date.now() }) });
  },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  // Stream an answer into `root` block by block, word by word.
  async stream(root, fruit, q, opt) {
    opt = opt || {};
    const wordMs = opt.wordMs || 60;
    const blocks = [
      ['h3', 'Fruit ' + fruit + ' reporting'],
      ['p', 'This mock reply answers: ' + q.replace(/\s+/g, ' ').slice(0, 50)],
      ['li', 'First point from ' + fruit.toLowerCase() + ' with some words to stream slowly'],
      ['li', 'Second point, also streamed word by word'],
      ['link', 'https://example.org/' + fruit.toLowerCase() + '-source'],
      ['p', 'END-' + fruit]
    ];
    let ul = null;
    let n = 0;
    for (const [tag, text] of blocks) {
      if (tag === 'link') {
        const p = document.createElement('p');
        p.innerHTML = 'Source: <a href="' + text + '">' + fruit + ' source</a> <button>copy</button>';
        root.appendChild(p);
        continue;
      }
      let el;
      if (tag === 'li') {
        if (!ul) { ul = document.createElement('ul'); root.appendChild(ul); }
        el = document.createElement('li'); ul.appendChild(el);
      } else { el = document.createElement(tag); root.appendChild(el); }
      for (const w of text.split(' ')) {
        el.textContent += (el.textContent ? ' ' : '') + w;
        n++;
        if (opt.pauseAfter && n === opt.pauseAfter) await this.sleep(opt.pauseMs || 1200);
        else await this.sleep(wordMs);
      }
    }
    if (opt.forever) {
      const p = document.createElement('p'); root.appendChild(p);
      // never finishes (for the timeout test)
      for (;;) { p.textContent += ' more'; await this.sleep(400); }
    }
  }
};
