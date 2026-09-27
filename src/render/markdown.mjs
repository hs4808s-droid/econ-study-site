import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import cjkFriendly from 'markdown-it-cjk-friendly';

const ROMAN_PREFIX = /^[Ⅰ-ↈ]+\.\s*/;
const CIRCLED_NUM = /[①-⑳]/; // ① ~ ⑳
const MEMO_TITLE = /암기|핵심\s*\d+\s*문장/;
const CHECKLIST_TITLE = /체크리스트/;
const MULTI_SELECT_LABEL = /이유/;
const BLANK_RUN = /_{3,}/;
const BLANK_RUN_G = /_{3,}/g;

function stripArrowMarkup(text) {
  return text.replace(/\*\*/g, '').replace(/[*_]/g, '').trim();
}

function makeMarkdownIt() {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: false });
  md.use(cjkFriendly);

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

  // blockquote -> key point card (id is assigned by collect_keyboxes so the
  // summary/memo panels can link back to this exact spot in the body)
  md.renderer.rules.blockquote_open = (tokens, idx) => {
    const id = tokens[idx].attrGet('id');
    return `<div class="key-box"${id ? ` id="${id}"` : ''}><div class="key-box-label">KEY POINT</div>`;
  };
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

  md.core.ruler.push('section_restructure', sectionRestructureRule(md));
  md.use(anchor, { slugify: (s) => encodeURIComponent(s.trim().replace(/\s+/g, '-')) });
  md.core.ruler.push('collect_keyboxes', collectKeyBoxesRule(md));
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

/** Demote the doc's non-first H1s to H2 section headings, strip roman-numeral
 *  prefixes, drop the very first H1 (rendered separately as the page title),
 *  and merge an H1 that immediately follows another H1 with no content
 *  between them into a single section (two-line titles in the source). */
function sectionRestructureRule(md) {
  return (state) => {
    const tokens = state.tokens;
    let seenFirstH1 = false;
    let sectionCount = 0;
    let lastInline = null;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== 'heading_open' || t.tag !== 'h1') continue;

      if (!seenFirstH1) {
        seenFirstH1 = true;
        tokens.splice(i, 3);
        i -= 1;
        continue;
      }

      const inline = tokens[i + 1];
      const closeTok = tokens[i + 2];
      const rawTitle = inline.content.replace(ROMAN_PREFIX, '').trim();

      const immediatelyAdjacent = i > 0 && tokens[i - 1].type === 'heading_close' && tokens[i - 1].tag === 'h2';
      if (immediatelyAdjacent && lastInline) {
        lastInline.content = `${lastInline.content} ${rawTitle}`;
        const newChildren = [];
        md.inline.parse(lastInline.content, md, state.env, newChildren);
        lastInline.children = newChildren;
        tokens.splice(i, 3);
        i -= 1;
        continue;
      }

      sectionCount += 1;
      inline.content = rawTitle;
      const newChildren = [];
      md.inline.parse(rawTitle, md, state.env, newChildren);
      inline.children = newChildren;
      t.tag = 'h2';
      closeTok.tag = 'h2';
      t.attrSet('data-section-number', String(sectionCount));
      lastInline = inline;
    }
  };
}

function isPromotedSectionHeading(t) {
  return t.type === 'heading_open' && t.tag === 'h2' && t.attrGet('data-section-number') !== null;
}

/** Assign a stable id to every blockquote, then render each one's HTML (and
 *  note whether it is a fully-bold "core" quote vs. a dialogue/hypothetical
 *  fragment) plus the section it lives in, for the "핵심 요약" panel. */
function collectKeyBoxesRule(md) {
  return (state) => {
    const tokens = state.tokens;
    const boxes = [];
    let currentSection = null;
    let boxIndex = 0;

    for (let i = 0; i < tokens.length; i++) {
      if (isPromotedSectionHeading(tokens[i])) {
        currentSection = {
          id: tokens[i].attrGet('id') || `section-${tokens[i].attrGet('data-section-number')}`,
          title: tokens[i + 1]?.content || '',
        };
        continue;
      }

      if (tokens[i].type !== 'blockquote_open') continue;
      let depth = 1;
      let j = i + 1;
      let rawText = '';
      for (; j < tokens.length && depth > 0; j++) {
        if (tokens[j].type === 'blockquote_open') depth++;
        if (tokens[j].type === 'blockquote_close') depth--;
        if (tokens[j].type === 'inline') rawText += `${tokens[j].content}\n`;
      }
      rawText = rawText.trim();
      const isBold = /^\*\*[\s\S]+\*\*$/.test(rawText);

      boxIndex += 1;
      const id = `kb-${boxIndex}`;
      tokens[i].attrSet('id', id);
      const html = md.renderer.render(tokens.slice(i, j), md.options, state.env);

      boxes.push({
        id,
        html,
        isBold,
        sectionId: currentSection?.id || null,
        sectionTitle: currentSection?.title || '개요',
      });
      i = j - 1;
    }
    state.env.keyBoxes = boxes;
  };
}

/** Within a "체크리스트" section: turn "**① 라벨:**\n선택지1 / 선택지2" paragraphs
 *  into persisted choice buttons (multi-select when the label mentions "이유"),
 *  turn a "___" fill-in-the-blank blockquote into text inputs, and add a
 *  session bar (date + save/reset) at the top of the section. */
function checklistTransformRule(md) {
  return (state) => {
    const tokens = state.tokens;
    let inChecklist = false;
    let itemIndex = 0;
    let sessionBarInserted = false;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];

      if (isPromotedSectionHeading(t)) {
        const title = tokens[i + 1]?.content || '';
        inChecklist = CHECKLIST_TITLE.test(title);
        itemIndex = 0;
        sessionBarInserted = false;
        if (inChecklist) {
          tokens.splice(i + 3, 0, htmlToken(state, sessionBarHtml()));
        }
        continue;
      }

      if (!inChecklist) continue;

      if (t.type === 'blockquote_open') {
        let depth = 1;
        let j = i + 1;
        let rawText = '';
        for (; j < tokens.length && depth > 0; j++) {
          if (tokens[j].type === 'blockquote_open') depth++;
          if (tokens[j].type === 'blockquote_close') depth--;
          if (tokens[j].type === 'inline') rawText += `${tokens[j].content}\n`;
        }
        rawText = rawText.trim();
        if (BLANK_RUN.test(rawText)) {
          const html = renderBlankSentence(md, rawText);
          tokens.splice(i, j - i, htmlToken(state, html));
        } else {
          i = j - 1;
        }
        continue;
      }

      if (t.type !== 'paragraph_open') continue;

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
      const allowMulti = MULTI_SELECT_LABEL.test(lines[0]);
      const html = renderChecklistItem(md, itemIndex, label, options, allowMulti);
      tokens.splice(i, 3, htmlToken(state, html));
    }
  };
}

function sessionBarHtml() {
  return `<div class="checklist-session-bar" data-checklist-session>
  <input type="date" class="checklist-date-input" data-checklist-date>
  <button type="button" class="choice-btn" data-checklist-save-session>이번 회차 저장</button>
  <button type="button" class="choice-btn checklist-reset-btn" data-checklist-reset>초기화</button>
</div>
<div class="checklist-session-log" data-checklist-log></div>`;
}

function renderBlankSentence(md, rawText) {
  // Replace blanks with placeholders first so bold/emphasis spanning the
  // whole sentence still parses correctly, then swap placeholders for real
  // <input> elements in the rendered HTML.
  let blankIndex = 0;
  const withPlaceholders = rawText.replace(BLANK_RUN_G, () => `@@BLANK${blankIndex++}@@`);
  let html = md.renderInline(withPlaceholders);
  for (let i = 0; i < blankIndex; i++) {
    html = html.replace(
      `@@BLANK${i}@@`,
      `<input type="text" class="blank-input" data-blank-index="${i}" placeholder="___">`
    );
  }
  return `<div class="key-box checklist-summary-sentence"><div class="key-box-label">KEY POINT</div><p>${html}</p></div>`;
}

function renderChecklistItem(md, index, labelHtml, options, allowMulti) {
  const groupId = `checklist-item-${index}`;
  const buttons = options
    .map((opt) => {
      const v = md.utils.escapeHtml(opt);
      const tone = opt.includes('↑') ? ' tone-up' : opt.includes('↓') ? ' tone-down' : '';
      return `<button type="button" class="choice-btn${tone}" data-group="${groupId}" data-value="${v}">${v}</button>`;
    })
    .join('');
  return `<div class="checklist-item" data-checklist-group="${groupId}" data-multi="${allowMulti ? '1' : '0'}">
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

  for (const p of run) {
    const raw = p.inline.content;
    if (CONNECTOR_ONLY(raw)) continue;
    let text = raw;
    if (STARTS_WITH_ARROW(raw)) text = raw.replace(/^→\s*/, '');
    steps.push(md.renderInline(text));
  }

  const parts = ['<div class="flow-diagram">'];
  steps.forEach((html, idx) => {
    parts.push(`<div class="flow-step">${html}</div>`);
    if (idx < steps.length - 1) {
      parts.push(
        '<div class="flow-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 4v13m0 0l-5-5m5 5l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
      );
    }
  });
  parts.push('</div>');
  return parts.join('\n');
}

const CARD_BOUNDARY = (t) =>
  t.type === 'heading_open' &&
  (t.tag === 'h3' || t.tag === 'h4' || (t.tag === 'h2' && t.attrGet('data-section-number') === null));

/** Inside a memo section, split its content into flip-cards at each
 *  sub-heading (h2/h3/h4 that isn't itself a promoted section). Any content
 *  before the first sub-heading becomes a ".memo-intro" (hidden in the memo
 *  tab, shown normally elsewhere). Returns the number of tokens inserted. */
function wrapMemoCards(md, state, tokens, contentStart, contentEnd, fallbackTitle) {
  const heads = [];
  for (let k = contentStart; k < contentEnd; k++) {
    if (CARD_BOUNDARY(tokens[k])) heads.push(k);
  }
  const hasIntro = heads.length > 0 && heads[0] > contentStart;

  // Multiple HTML fragments can land on the same token index (e.g. closing
  // the intro and opening card 0 both sit at heads[0]) — collect them per
  // position and splice once per position, in push order, so nesting stays
  // correct regardless of how many fragments share a spot.
  const byPos = new Map();
  const add = (pos, html) => {
    if (!byPos.has(pos)) byPos.set(pos, []);
    byPos.get(pos).push(html);
  };

  const knowBar =
    '<div class="memo-know-bar"><button type="button" class="know-btn" data-memo-know="known">알아요</button><button type="button" class="know-btn" data-memo-know="review">다시 보기</button></div>';

  add(contentStart, '<div class="memo-cards" data-memo-cards>');
  if (hasIntro) add(contentStart, '<div class="memo-intro">');

  if (heads.length === 0) {
    add(
      contentStart,
      `<div class="memo-card" data-memo-card="0"><button type="button" class="memo-card-front" data-memo-flip><span class="memo-card-fronttext">${md.utils.escapeHtml(
        fallbackTitle
      )}</span></button><div class="memo-card-back">`
    );
    add(contentEnd, `${knowBar}</div></div></div>`);
  } else {
    heads.forEach((headPos, hi) => {
      if (hi === 0 && hasIntro) add(headPos, '</div>'); // close memo-intro
      if (hi > 0) add(headPos, `${knowBar}</div></div>`); // close previous card
      add(headPos, `<div class="memo-card" data-memo-card="${hi}"><button type="button" class="memo-card-front" data-memo-flip>`);
      add(headPos + 3, '</button><div class="memo-card-back">');
    });
    add(contentEnd, `${knowBar}</div></div></div>`);
  }

  const positions = [...byPos.keys()].sort((a, b) => b - a);
  for (const pos of positions) {
    tokens.splice(pos, 0, htmlToken(state, byPos.get(pos).join('')));
  }
  return positions.length;
}

/** Wrap each top-level H2 section (and the intro content before the first
 *  one) in a <section> with numbering + memo/checklist affordances. */
function wrapSectionsRule(md) {
  return (state) => {
    const tokens = state.tokens;
    const boundaries = [];
    tokens.forEach((t, idx) => {
      if (t.level === 0 && isPromotedSectionHeading(t)) boundaries.push(idx);
    });

    for (let b = boundaries.length - 1; b >= 0; b--) {
      const start = boundaries[b];
      let end = b + 1 < boundaries.length ? boundaries[b + 1] : tokens.length;
      const heading = tokens[start];
      const title = tokens[start + 1].content;
      const number = heading.attrGet('data-section-number');
      const isMemo = MEMO_TITLE.test(title);
      const isChecklist = CHECKLIST_TITLE.test(title);
      const slugId = heading.attrGet('id') || `section-${number}`;

      if (isMemo) {
        const inserted = wrapMemoCards(md, state, tokens, start + 3, end, title);
        end += inserted;
      }

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
        const headingCloseIdx = start + 1 + 2; // openHtml, heading_open, inline, heading_close
        const controlsHtml = `<a class="memo-toggle" data-memo-jump="${slugId}" href="#${slugId}">암기 카드로 보기</a>
<div class="memo-controls" data-memo-controls="${slugId}">
  <button type="button" class="choice-btn" data-memo-hide-all>전체 가리기</button>
  <button type="button" class="choice-btn" data-memo-show-all>전체 보기</button>
  <button type="button" class="choice-btn" data-memo-shuffle>카드 순서 섞기</button>
  <button type="button" class="choice-btn" data-memo-filter-review>다시 보기만</button>
  <span class="memo-progress" data-memo-progress>0/0</span>
</div>`;
        tokens.splice(headingCloseIdx + 1, 0, htmlToken(state, controlsHtml));
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
