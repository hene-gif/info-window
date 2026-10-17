/* Compact GFM-ish renderer for the research docs. No external library. */
(function (root) {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ESC[ch]);
  }

  function inline(text, imgBase) {
    let src = String(text ?? '');
    const parts = [];
    const re = /(`+)([^`]+?)\1|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_/g;
    let last = 0;
    let match;
    while ((match = re.exec(src))) {
      parts.push(esc(src.slice(last, match.index)));
      if (match[2] != null && match[1]) {
        parts.push(`<code>${esc(match[2])}</code>`);
      } else if (match[4] != null) {
        const href = resolve(match[4], imgBase);
        parts.push(`<img alt="${esc(match[3])}" src="${esc(href)}">`);
      } else if (match[6] != null) {
        const href = resolve(match[6], imgBase);
        const extra = /^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
        parts.push(`<a href="${esc(href)}"${extra}>${inline(match[5], imgBase)}</a>`);
      } else if (match[7] != null) {
        parts.push(`<strong>${inline(match[7], imgBase)}</strong>`);
      } else if (match[8] != null) {
        parts.push(`<strong>${inline(match[8], imgBase)}</strong>`);
      } else if (match[9] != null) {
        parts.push(`<em>${inline(match[9], imgBase)}</em>`);
      } else if (match[10] != null) {
        parts.push(`<em>${inline(match[10], imgBase)}</em>`);
      }
      last = match.index + match[0].length;
    }
    parts.push(esc(src.slice(last)));
    return parts.join('');
  }

  function resolve(href, imgBase) {
    const raw = String(href || '').trim();
    if (/^https?:\/\//i.test(raw) || raw.startsWith('#') || raw.startsWith('/') || raw.startsWith('data:')) return raw;
    if (!imgBase) return raw;
    return imgBase.replace(/\/?$/, '/') + raw.replace(/^\.\//, '');
  }

  function isTableSep(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  }

  function splitRow(line) {
    let body = line.trim();
    if (body.startsWith('|')) body = body.slice(1);
    if (body.endsWith('|')) body = body.slice(0, -1);
    return body.split('|').map((cell) => cell.trim());
  }

  function renderTable(headerLine, rows, imgBase) {
    const heads = splitRow(headerLine);
    const thead = `<thead><tr>${heads.map((cell) => `<th>${inline(cell, imgBase)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows
      .map((row) => {
        const cells = splitRow(row);
        while (cells.length < heads.length) cells.push('');
        return `<tr>${cells.slice(0, heads.length).map((cell) => `<td>${inline(cell, imgBase)}</td>`).join('')}</tr>`;
      })
      .join('')}</tbody>`;
    return `<div class="md-table"><table>${thead}${tbody}</table></div>`;
  }

  function closeList(stack) {
    let html = '';
    while (stack.length) {
      const item = stack.pop();
      html += `</li></${item.tag}>`;
    }
    return html;
  }

  function render(markdown, options = {}) {
    const imgBase = options.imgBase || '';
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;
    let inCode = false;
    let codeLang = '';
    let code = [];
    let para = [];
    let quote = [];
    const listStack = [];

    const flushPara = () => {
      if (!para.length) return;
      out.push(`<p>${inline(para.join('\n'), imgBase)}</p>`);
      para = [];
    };
    const flushQuote = () => {
      if (!quote.length) return;
      out.push(`<blockquote>${render(quote.join('\n'), options)}</blockquote>`);
      quote = [];
    };
    const flushList = () => {
      if (listStack.length) out.push(closeList(listStack));
    };

    while (i < lines.length) {
      const line = lines[i];

      if (inCode) {
        if (/^```/.test(line)) {
          out.push(`<pre><code${codeLang ? ` class="lang-${esc(codeLang)}"` : ''}>${esc(code.join('\n'))}</code></pre>`);
          inCode = false;
          codeLang = '';
          code = [];
        } else {
          code.push(line);
        }
        i += 1;
        continue;
      }

      const fence = line.match(/^```([\w-]*)\s*$/);
      if (fence) {
        flushPara();
        flushQuote();
        flushList();
        inCode = true;
        codeLang = fence[1] || '';
        i += 1;
        continue;
      }

      if (/^\s*\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        flushPara();
        flushQuote();
        flushList();
        const rows = [];
        i += 2;
        while (i < lines.length && /^\s*\|/.test(lines[i]) && lines[i].trim()) {
          rows.push(lines[i]);
          i += 1;
        }
        out.push(renderTable(line, rows, imgBase));
        continue;
      }

      if (/^\s*---+\s*$/.test(line) || /^\s*\*\*\*+\s*$/.test(line)) {
        flushPara();
        flushQuote();
        flushList();
        out.push('<hr>');
        i += 1;
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushPara();
        flushQuote();
        flushList();
        const level = heading[1].length;
        const raw = heading[2].replace(/\s+#+\s*$/, '');
        const id = slug(raw);
        out.push(`<h${level} id="${esc(id)}">${inline(raw, imgBase)}</h${level}>`);
        i += 1;
        continue;
      }

      const q = line.match(/^>\s?(.*)$/);
      if (q) {
        flushPara();
        flushList();
        quote.push(q[1]);
        i += 1;
        continue;
      }
      if (quote.length) flushQuote();

      const ul = line.match(/^(\s*)([-*])\s+(.+)$/);
      const ol = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
      const li = ul || ol;
      if (li) {
        flushPara();
        const indent = li[1].replace(/\t/g, '  ').length;
        const tag = ul ? 'ul' : 'ol';
        const text = li[3];
        while (listStack.length && (listStack[listStack.length - 1].indent > indent || (listStack[listStack.length - 1].indent === indent && listStack[listStack.length - 1].tag !== tag))) {
          const ended = listStack.pop();
          out.push(`</li></${ended.tag}>`);
        }
        if (!listStack.length || listStack[listStack.length - 1].indent < indent) {
          out.push(`<${tag}><li>`);
          listStack.push({ tag, indent });
        } else {
          out.push('</li><li>');
        }
        out.push(inline(text, imgBase));
        i += 1;
        continue;
      }
      if (listStack.length && line.trim() === '') {
        flushList();
        i += 1;
        continue;
      }
      if (listStack.length && /^\s+\S/.test(line)) {
        out.push(` ${inline(line.trim(), imgBase)}`);
        i += 1;
        continue;
      }
      if (listStack.length) flushList();

      if (!line.trim()) {
        flushPara();
        i += 1;
        continue;
      }

      para.push(line);
      i += 1;
    }

    if (inCode) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
    flushPara();
    flushQuote();
    flushList();
    return out.join('\n');
  }

  function slug(value) {
    return String(value || '')
      .replace(/[`*_\[\]]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80);
  }

  root.renderMarkdown = render;
})(window);
