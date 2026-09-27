import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';

const ROMAN_PREFIX = /^[Ⅰ-ↈ]+\.\s*/;
const CIRCLED_NUM = /[①-⑳]/; // ① ~ ⑳
const MEMO_TITLE = /암기|핵심\s*\d+\s*문장/;
const CHECKLIST_TITLE = /체크리스트/;

function stripArrowMarkup(text) {
  return text.replace(/\*\*/g, '').replace(/[*_]/g, '').trim();
}

function makeMarkdownIt() {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

  // strip tracking query params from links
  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const hrefIdx = token.attrIndex('href');
    if (hrefIdx >= 0) {
      try {
        const url = new URL(token.attrs[hrefIdx][1]);
        [...url.searchParams.keys()]
          .filter((k) => /^utm_/.test(k) || k === 'ref' || k === 'fbclid' || k === 'gclid')
          .forEach((k) => url.searchParams.delete(k));
        token.attrs[hrefIdx][1] = url.toString();
      } catch {
        // not an absolute URL, leave as-is
      }
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  // inline ↑ / ↓ badges
  md.renderer.rules.text = (tokens, idx) => {
    return md.utils
      .escapeHtml(tokens[idx].content)
      .replace(/↑/g, '<span class="arrow-badge arrow-up">↑</span>')
      .replace(/↓/g, '<span class="arrow-badge arrow-down">↓</span>');
  };

  // blockquote -> key point card
  md.renderer.rules.blockquote_open = () =>
    '<div class="key-box"><div class="key-box-label">KEY POINT</div>';
  md.renderer.rules.blockquote_close = () => '</div>';

  // table -> scroll wrapper with sticky header/first column
  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>';
  md.renderer.rules.table_close = () => '</table></div>';

  // rewrite relative image paths so they resolve from /content/<doc-dir>/...
  const defaultImage =
    md.renderer.rules.image ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const srcIdx = token.attrIndex('src');
    if (srcIdx >= 0 && env.assetBase !== undefined) {
      const src = token.attrs[srcIdx][1];
      if (!/^(https?:)?\/\//.test(src) && !src.startsWith('/') && !src.startsWith('data:')) {
        token.attrs[srcIdx][1] = `/content/${env.assetBase}/${src}`.replace(/\/{2,}/g, '/');
      }
    }
    return defaultImage(tokens, idx, options, env, self);
  };

  md.core.ruler.push('collect_keyboxes', collectKeyBoxesRule(md));
  md.core.ruler.push('section_restructure', sectionRestructureRule(md));
  md.use(anchor, { slugify: (s) => encodeURIComponent(s.trim().replace(/\s+/g, '-')) });
  md.core.ruler.push('checklist_transform', checklistTransformRule(md));
  md.core.ruler.push('flow_diagram', flowDiagramRule(md));
  md.core.ruler.push('wrap_sections', wrapSectionsRule(md));

  return md;
}

function htmlToken(state, content) {
  const t = new state.Token('html_block', '', 0);
  t.content = content;
  t.block = true;
  return t;
}

/** Render every blockquote's HTML once more into env.keyBoxes, for the
 *  "핵심 박스 모음" / "핵심 요약" panels, without touching the main token stream. */
function collectKeyBoxesRule(md) {
  return (state) => {
    const tokens = state.tokens;
    const boxes = [];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue;
      let depth = 1;
      let j = i + 1;
      while (j < tokens.length && depth > 0) {
        if (tokens[j].type === 'blockquote_open') depth++;
        if (tokens[j].type === 'blockquote_close') depth--;
        j++;
      }
      boxes.push(md.renderer.render(tokens.slice(i, j), md.options, state.env));
      i = j - 1;
    }
    state.env.keyBoxes = boxes;
  };
}

/** Demote the doc's non-first H1s to H2 section headings, strip roman-numeral
 *  prefixes, and drop the very first H1 (rendered separately as the page title). */
function sectionRestructureRule(md) {
  return (state) => {
    const tokens = state.tokens;
    let seenFirstH1 = false;
    let sectionCount = 0;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== 'heading_open' || t.tag !== 'h1') continue;

      if (!seenFirstH1) {
        seenFirstH1 = true;
        // remove title heading (open, inline, close) from body
        tokens.splice(i, 3);
        i -= 1;
        continue;
      }

      sectionCount += 1;
      const inline = tokens[i + 1];
      const closeTok = tokens[i + 2];
      const rawTitle = inline.content.replace(ROMAN_PREFIX, '').trim();
      inline.content = rawTitle;
      const newChildren = [];
      md.inline.parse(rawTitle, md, state.env, newChildren);
      inline.children = newChildren;
      t.tag = 'h2';
      closeTok.tag = 'h2';
      t.attrSet('data-section-number', String(sectionCount));
    }
  };
}

/** Within a "체크리스트" section, turn "**① 라벨:**\n선택지1 / 선택지2" paragraphs
 *  into persisted choice buttons. */
function checklistTransformRule(md) {
  return (state) => {
    const tokens = state.tokens;
    let inChecklist = false;
    let itemIndex = 0;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];

      if (t.type === 'heading_open' && t.tag === 'h2' && t.attrGet('data-section-number') !== null) {
        const title = tokens[i + 1]?.content || '';
        inChecklist = CHECKLIST_TITLE.test(title);
        itemIndex = 0;
        continue;
      }

      if (!inChecklist || t.type !== 'paragraph_open') continue;

      const inline = tokens[i + 1];
      const raw = inline.content;
      const lines = raw.split('\n').map((l) => l.trim());
      const first = stripArrowMarkup(lines[0] || '');
      if (!CIRCLED_NUM.test(first)) continue;

      const label = md.renderInline(lines[0]);
      const optionsLine = lines.slice(1).join(' ').trim();
      const options = optionsLine
        ? optionsLine.split('/').map((s) => s.trim()).filter(Boolean)
        : [];

      itemIndex += 1;
      const html = renderChecklistItem(md, itemIndex, label, options);
      tokens.splice(i, 3, htmlToken(state, html));
    }
  };
}

function renderChecklistItem(md, index, labelHtml, options) {
  const groupId = `checklist-item-${index}`;
  const buttons = options
    .map(
      (opt, i) =>
        `<button type="button" class="choice-btn" data-group="${groupId}" data-value="${md.utils.escapeHtml(
          opt
        )}">${md.utils.escapeHtml(opt)}</button>`
    )
    .join('');
  return `<div class="checklist-item" data-checklist-group="${groupId}">
  <div class="checklist-label">${labelHtml}</div>
  <div class="choice-group" role="group">${buttons}</div>
</div>`;
}

const CONNECTOR_ONLY = (raw) => {
  const stripped = stripArrowMarkup(raw);
  return stripped === '↓' || stripped === '→' || stripped === '↑';
};
const STARTS_WITH_ARROW = (raw) => raw.trim().startsWith('→');

/** Convert runs of paragraphs connected by standalone arrow lines, or by 2+
 *  consecutive "→ ..." lines, into a vertical flow-diagram component. */
function flowDiagramRule(md) {
  return (state) => {
    const tokens = state.tokens;
    let i = 0;
    while (i < tokens.length) {
      if (tokens[i].type !== 'paragraph_open' || tokens[i].level !== 0) {
        i++;
        continue;
      }

      // collect a maximal run of adjacent top-level paragraphs
      const run = [];
      let j = i;
      while (
        j < tokens.length &&
        tokens[j].type === 'paragraph_open' &&
        tokens[j].level === 0
      ) {
        run.push({ start: j, inline: tokens[j + 1] });
        j += 3;
      }

      const connectorCount = run.filter((p) => CONNECTOR_ONLY(p.inline.content)).length;
      const arrowStartCount = run.filter(
        (p) => !CONNECTOR_ONLY(p.inline.content) && STARTS_WITH_ARROW(p.inline.content)
      ).length;

      if (run.length >= 2 && (connectorCount >= 1 || arrowStartCount >= 2)) {
        const html = buildFlowHtml(md, run);
        tokens.splice(i, j - i, htmlToken(state, html));
        i += 1;
      } else {
        i = j;
      }
    }
  };
}

function buildFlowHtml(md, run) {
  const steps = [];
  let pendingGlyph = null;

  for (const p of run) {
    const raw = p.inline.content;
    if (CONNECTOR_ONLY(raw)) {
      pendingGlyph = true;
      continue;
    }
    let text = raw;
    if (STARTS_WITH_ARROW(raw)) {
      text = raw.replace(/^→\s*/, '');
      pendingGlyph = true;
    }
    if (steps.length > 0) {
      steps[steps.length - 1].hasNext = true;
    }
    steps.push({ html: md.renderInline(text), hasNext: false });
    pendingGlyph = null;
  }

  const parts = ['<div class="flow-diagram">'];
  steps.forEach((s, idx) => {
    parts.push(`<div class="flow-step">${s.html}</div>`);
    if (idx < steps.length - 1) {
      parts.push(
        '<div class="flow-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 4v13m0 0l-5-5m5 5l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
      );
    }
  });
  parts.push('</div>');
  return parts.join('\n');
}

/** Wrap each top-level H2 section (and the intro content before the first
 *  one) in a <section> with numbering + memo/checklist affordances. */
function wrapSectionsRule(md) {
  return (state) => {
    const tokens = state.tokens;
    const boundaries = [];
    tokens.forEach((t, idx) => {
      if (
        t.type === 'heading_open' &&
        t.tag === 'h2' &&
        t.level === 0 &&
        t.attrGet('data-section-number') !== null
      ) {
        boundaries.push(idx);
      }
    });

    // insert closing markers first (from the end) so earlier indexes stay valid
    for (let b = boundaries.length - 1; b >= 0; b--) {
      const start = boundaries[b];
      const end = b + 1 < boundaries.length ? boundaries[b + 1] : tokens.length;
      const heading = tokens[start];
      const title = tokens[start + 1].content;
      const number = heading.attrGet('data-section-number');
      const isMemo = MEMO_TITLE.test(title);
      const isChecklist = CHECKLIST_TITLE.test(title);
      const slugId = heading.attrGet('id') || `section-${number}`;

      const classes = ['doc-section'];
      if (isMemo) classes.push('memo-section');
      if (isChecklist) classes.push('checklist-section');

      const openHtml = `<section class="${classes.join(
        ' '
      )}" id="${slugId}" data-toc-title="${md.utils.escapeHtml(title)}">
<div class="section-label">SECTION ${String(number).padStart(2, '0')}</div>`;

      tokens.splice(end, 0, htmlToken(state, '</section>'));
      tokens.splice(start, 0, htmlToken(state, openHtml));

      state.env.sections = state.env.sections || [];
      state.env.sections.unshift({ id: slugId, title, number: Number(number) });

      if (isMemo) {
        // toggle button right after the heading (which is now 2 tokens later)
        const headingCloseIdx = start + 1 + 2; // openHtml, heading_open, inline, heading_close
        const toggleHtml =
          '<button type="button" class="memo-toggle" data-memo-toggle>암기 카드로 보기</button>';
        tokens.splice(headingCloseIdx + 1, 0, htmlToken(state, toggleHtml));
      }
    }

    if (boundaries.length > 0 && boundaries[0] > 0) {
      tokens.splice(boundaries[0], 0, htmlToken(state, '</div>'));
      tokens.splice(0, 0, htmlToken(state, '<div class="doc-intro">'));
    }
  };
}

export function renderDocumentBody(markdownSource, { assetBase = '' } = {}) {
  const md = makeMarkdownIt();
  const env = { assetBase };
  const html = md.render(markdownSource, env);
  return { html, sections: env.sections || [], keyBoxes: env.keyBoxes || [] };
}
