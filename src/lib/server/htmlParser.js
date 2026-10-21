// Minimal HTML parser for the subset used by the memo template.
// Produces a block list: {type:'heading'|'paragraph'|'table', ...}
const BLOCK_TAGS = ['p', 'h1', 'h2', 'h3', 'div', 'table', 'br'];
const INLINE_TAGS = ['strong', 'b', 'em', 'i', 'span', 'br'];

function isWhitespaceOnly(s) {
  return /^\s*$/.test(s);
}

function tagNameOf(html, pos) {
  const m = html.slice(pos).match(/^<\/?([a-zA-Z]+)/);
  return m ? m[1].toLowerCase() : null;
}

export function parseMemoHtml(html) {
  const blocks = [];
  let i = 0;
  const n = html.length;

  function readTextUntil(endTag) {
    const idx = html.indexOf(endTag, i);
    if (idx === -1) return { text: html.slice(i), end: n };
    return { text: html.slice(i, idx), end: idx };
  }

  function parseInline(text) {
    const runs = [];
    let j = 0;
    const len = text.length;
    while (j < len) {
      const open = text.indexOf('<', j);
      if (open === -1) {
        const chunk = text.slice(j);
        if (chunk) runs.push({ text: chunk, bold: false, italic: false });
        break;
      }
      if (open > j) {
        runs.push({ text: text.slice(j, open), bold: false, italic: false });
      }
      const close = text.indexOf('>', open);
      if (close === -1) {
        runs.push({ text: text.slice(open), bold: false, italic: false });
        break;
      }
      const tagBody = text.slice(open + 1, close).trim();
      const isClose = tagBody.startsWith('/');
      const name = tagBody.replace(/^\//, '').split(/\s/)[0].toLowerCase();
      if (isClose) {
        if (name === 'strong' || name === 'b') {
          // close bold handled by tracking below; here we just mark end of current run grouping
        } else if (name === 'em' || name === 'i') {
          // close italic
        }
        j = close + 1;
        continue;
      }
      const attrs = tagBody.slice(name.length).trim();
      const selfClosing = attrs.endsWith('/');
      const bold = name === 'strong' || name === 'b';
      const italic = name === 'em' || name === 'i';
      const br = name === 'br';
      if (br || selfClosing) {
        runs.push({ text: br ? '\n' : '', bold, italic });
        j = close + 1;
        continue;
      }
      // Find closing tag
      const closeTag = `</${name}>`;
      const cIdx = text.indexOf(closeTag, close + 1);
      if (cIdx === -1) {
        runs.push({ text: text.slice(close + 1), bold, italic });
        j = len;
        break;
      }
      const inner = text.slice(close + 1, cIdx);
      // recursively parse inner for nested b/i
      const innerRuns = parseInline(inner).map((r) => ({ ...r, bold: r.bold || bold, italic: r.italic || italic }));
      runs.push(...innerRuns);
      j = cIdx + closeTag.length;
    }
    return runs;
  }

  while (i < n) {
    // skip text outside tags (whitespace between blocks)
    const nextTag = html.indexOf('<', i);
    if (nextTag === -1) {
      const rest = html.slice(i);
      if (!isWhitespaceOnly(rest)) {
        blocks.push({ type: 'paragraph', runs: parseInline(rest) });
      }
      break;
    }
    if (nextTag > i) {
      const between = html.slice(i, nextTag);
      if (!isWhitespaceOnly(between)) {
        blocks.push({ type: 'paragraph', runs: parseInline(between) });
      }
    }
    i = nextTag;

    const close = html.indexOf('>', i);
    if (close === -1) break;
    const tagBody = html.slice(i + 1, close).trim();
    const isCloseTag = tagBody.startsWith('/');
    const name = tagBody.replace(/^\//, '').split(/\s/)[0].toLowerCase();

    if (isCloseTag) {
      i = close + 1;
      continue;
    }

    const selfClosing = tagBody.endsWith('/');
    if (name === 'br') {
      blocks.push({ type: 'paragraph', runs: [{ text: '\n', bold: false, italic: false }] });
      i = close + 1;
      continue;
    }

    if (BLOCK_TAGS.includes(name) && !selfClosing) {
      const closeTag = `</${name}>`;
      const cIdx = html.indexOf(closeTag, close + 1);
      if (cIdx === -1) {
        i = close + 1;
        continue;
      }
      const inner = html.slice(close + 1, cIdx);

      if (name === 'table') {
        const rows = [];
        let trPos = 0;
        while (true) {
          const trOpen = inner.indexOf('<tr', trPos);
          if (trOpen === -1) break;
          const trClose = inner.indexOf('>', trOpen);
          if (trClose === -1) break;
          const trEnd = inner.indexOf('</tr>', trClose);
          if (trEnd === -1) break;
          const trInner = inner.slice(trClose + 1, trEnd);
          const cells = [];
          let tdPos = 0;
          while (true) {
            const tdOpen = trInner.indexOf('<td', tdPos);
            const thOpen = trInner.indexOf('<th', tdPos);
            let cellOpen = -1;
            let cellName = 'td';
            if (tdOpen === -1 && thOpen === -1) break;
            if (thOpen === -1 || (tdOpen !== -1 && tdOpen < thOpen)) {
              cellOpen = tdOpen;
              cellName = 'td';
            } else {
              cellOpen = thOpen;
              cellName = 'th';
            }
            const cellClose = trInner.indexOf('>', cellOpen);
            if (cellClose === -1) break;
            const cellEnd = trInner.indexOf(`</${cellName}>`, cellClose);
            if (cellEnd === -1) break;
            const cellInner = trInner.slice(cellClose + 1, cellEnd);
            cells.push({ type: 'cell', runs: parseInline(cellInner) });
            tdPos = cellEnd + cellName.length + 3;
          }
          if (cells.length) rows.push(cells);
          trPos = trEnd + 5;
        }
        if (rows.length) blocks.push({ type: 'table', rows });
        i = cIdx + closeTag.length;
      } else if (name === 'p' || name === 'div') {
        blocks.push({ type: 'paragraph', runs: parseInline(inner) });
        i = cIdx + closeTag.length;
      } else if (/^h[123]$/.test(name)) {
        blocks.push({ type: 'heading', level: Number(name[1]), runs: parseInline(inner) });
        i = cIdx + closeTag.length;
      } else {
        i = close + 1;
      }
    } else {
      i = close + 1;
    }
  }

  return blocks;
}

function runsToText(runs) {
  return runs.map((r) => r.text).join('');
}

export function extractPlainText(html) {
  return runsToText(parseInline(html)).replace(/\n+/g, ' ').trim();
}
