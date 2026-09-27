const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore (private mode / storage disabled) */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  getJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  keysWithPrefix(prefix) {
    try {
      return Object.keys(localStorage).filter((k) => k.startsWith(prefix));
    } catch {
      return [];
    }
  },
};

function currentSlug() {
  return document.querySelector('.doc-body')?.dataset.docSlug || null;
}

// ---------------------------------------------------------------------------
// Theme / font size / settings panel
// ---------------------------------------------------------------------------

function isDarkActive() {
  return (
    document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches)
  );
}

function initTheme() {
  const saved = storage.get('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('themeToggle');
  const label = document.getElementById('themeToggleLabel');
  const updateLabel = () => {
    if (label) label.textContent = isDarkActive() ? '켜짐' : '꺼짐';
  };
  updateLabel();
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = isDarkActive() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    storage.set('theme', next);
    updateLabel();
  });
}

function initFontSize() {
  const saved = storage.get('fontSize') || 'md';
  document.documentElement.setAttribute('data-font-size', saved);
  const group = document.getElementById('fontSizeGroup');
  if (!group) return;
  [...group.querySelectorAll('button')].forEach((b) => {
    b.classList.toggle('active', b.dataset.size === saved);
    b.addEventListener('click', () => {
      document.documentElement.setAttribute('data-font-size', b.dataset.size);
      storage.set('fontSize', b.dataset.size);
      [...group.querySelectorAll('button')].forEach((x) => x.classList.toggle('active', x === b));
    });
  });
}

function initSettingsPanel() {
  const panel = document.getElementById('settingsPanel');
  const openers = document.querySelectorAll('[data-open-settings]');
  if (!panel) return;
  openers.forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault();
      panel.classList.toggle('open');
    })
  );
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && ![...openers].some((o) => o.contains(e.target))) {
      panel.classList.remove('open');
    }
  });
}

// ---------------------------------------------------------------------------
// Progress bar / back-to-top / reading donut (display only, no auto "읽음")
// ---------------------------------------------------------------------------

function initBackToTop() {
  const btn = document.getElementById('backToTop');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 500);
  });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function initTopProgress() {
  const bar = document.getElementById('topProgressBar');
  if (!bar) return;
  const update = () => {
    const h = document.documentElement;
    const scrollable = h.scrollHeight - h.clientHeight;
    const pct = scrollable > 0 ? (h.scrollTop / scrollable) * 100 : 0;
    bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  };
  document.addEventListener('scroll', update, { passive: true });
  update();
}

function initReadingProgressDonut() {
  const circle = document.getElementById('readProgress');
  const label = document.getElementById('readProgressLabel');
  const body = document.querySelector('.doc-body');
  if (!circle || !body) return;
  const r = 26;
  const c = 2 * Math.PI * r;
  const update = () => {
    const rect = body.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
    const pct = total > 0 ? Math.round((scrolled / total) * 100) : 100;
    circle.setAttribute('stroke-dashoffset', String(c * (1 - pct / 100)));
    if (label) label.textContent = `${pct}%`;
  };
  document.addEventListener('scroll', update, { passive: true });
  update();
}

// ---------------------------------------------------------------------------
// Manual 읽음 / 복습 필요 status (fix #10: no auto-read-on-scroll, no 14-day rule)
// ---------------------------------------------------------------------------

function getDocStatus(slug) {
  return storage.get(`status:${slug}`); // null | 'read' | 'review'
}

function setDocStatus(slug, status) {
  if (status) storage.set(`status:${slug}`, status);
  else storage.remove(`status:${slug}`);
}

function initDocStatusButtons() {
  const slug = currentSlug();
  const readBtn = document.querySelector('[data-mark-read]');
  const reviewBtn = document.querySelector('[data-mark-review]');
  if (!slug || !readBtn || !reviewBtn) return;

  const refresh = () => {
    const status = getDocStatus(slug);
    readBtn.classList.toggle('active', status === 'read');
    reviewBtn.classList.toggle('active', status === 'review');
  };
  refresh();

  readBtn.addEventListener('click', () => {
    setDocStatus(slug, getDocStatus(slug) === 'read' ? null : 'read');
    refresh();
  });
  reviewBtn.addEventListener('click', () => {
    setDocStatus(slug, getDocStatus(slug) === 'review' ? null : 'review');
    refresh();
  });
}

function initDocStatusBadges() {
  const rows = document.querySelectorAll('[data-doc-status]');
  let reviewCount = 0;
  rows.forEach((el) => {
    const status = getDocStatus(el.dataset.docStatus);
    if (!status) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = status === 'review' ? '복습 필요' : '읽음';
    el.style.color = status === 'review' ? 'var(--accent)' : 'var(--down)';
    if (status === 'review') reviewCount += 1;
  });
  const reviewValue = document.getElementById('reviewCountValue');
  if (reviewValue) reviewValue.textContent = String(reviewCount);
}

function initCategoryFilter() {
  const chips = document.querySelectorAll('[data-category-chip]');
  const rows = document.querySelectorAll('[data-doc-row]');
  if (!chips.length) return;

  const params = new URLSearchParams(window.location.search);
  const reviewOnly = params.get('filter') === 'review';

  function apply(activeCategory) {
    rows.forEach((row) => {
      const matchCategory = activeCategory === '__all__' || row.dataset.category === activeCategory;
      const matchReview = !reviewOnly || getDocStatus(row.dataset.slug) === 'review';
      row.style.display = matchCategory && matchReview ? '' : 'none';
    });
  }

  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.toggle('active', c === chip));
      apply(chip.dataset.categoryChip);
    })
  );

  apply('__all__');
}

// ---------------------------------------------------------------------------
// Doc tabs (본문 / 핵심 요약 / 암기 카드 / 체크리스트)
// ---------------------------------------------------------------------------

function setActiveTab(tab) {
  const bar = document.querySelector('[data-doc-tabs]');
  const body = document.querySelector('.doc-body');
  if (!bar || !body) return;
  body.dataset.tab = tab;
  bar.querySelectorAll('[data-tab-btn]').forEach((b) => b.classList.toggle('active', b.dataset.tabBtn === tab));
}

function initDocTabs() {
  const bar = document.querySelector('[data-doc-tabs]');
  if (!bar) return;
  bar.querySelectorAll('[data-tab-btn]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setActiveTab(btn.dataset.tabBtn);
    });
  });
}

// ---------------------------------------------------------------------------
// TOC scrollspy + bottom sheet + jump-back-to-body links
// ---------------------------------------------------------------------------

function initTocScrollSpy() {
  const links = document.querySelectorAll('[data-toc-link]');
  if (!links.length) return;
  const sections = [...links].map((l) => document.getElementById(l.dataset.target)).filter(Boolean);

  const onScroll = () => {
    let activeId = null;
    for (const sec of sections) {
      if (sec.getBoundingClientRect().top < 140) activeId = sec.id;
    }
    links.forEach((l) => l.classList.toggle('active', l.dataset.target === activeId));
  };
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function initTocSheet() {
  const trigger = document.getElementById('tocSheetTrigger');
  const sheet = document.getElementById('tocSheet');
  const backdrop = document.getElementById('tocBackdrop');
  if (!trigger || !sheet) return;
  const open = () => {
    sheet.classList.add('open');
    backdrop.classList.add('open');
  };
  const close = () => {
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
  };
  trigger.addEventListener('click', open);
  backdrop.addEventListener('click', close);
  sheet.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

function flashHighlight(el) {
  el.classList.remove('highlight-flash');
  // force reflow so the animation can restart
  void el.offsetWidth;
  el.classList.add('highlight-flash');
  setTimeout(() => el.classList.remove('highlight-flash'), 1700);
}

function initKeyBoxJump() {
  document.querySelectorAll('[data-jump-body]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      setActiveTab('body');
      const target = document.getElementById(link.dataset.jumpBody);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flashHighlight(target);
    });
  });
}

function initMemoJumpLinks() {
  document.querySelectorAll('[data-memo-jump]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      setActiveTab('memo');
      const target = document.getElementById(link.dataset.memoJump);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// ---------------------------------------------------------------------------
// Memo flip-cards (fix #4)
// ---------------------------------------------------------------------------

function initMemoCards() {
  const slug = currentSlug();
  document.querySelectorAll('[data-memo-cards]').forEach((container, containerIndex) => {
    const section = container.closest('.memo-section');
    const sectionId = section?.id || `memo-${containerIndex}`;
    const cards = [...container.querySelectorAll(':scope > .memo-card')];

    const knowKey = (cardIndex) => `memo:${slug}:${sectionId}:${cardIndex}`;

    const updateProgress = () => {
      const progressEl = section?.querySelector('[data-memo-progress]');
      if (!progressEl) return;
      const decided = cards.filter((c) => storage.get(knowKey(c.dataset.memoCard))).length;
      progressEl.textContent = `${decided}/${cards.length}`;
    };

    cards.forEach((card) => {
      const idx = card.dataset.memoCard;
      const front = card.querySelector(':scope > .memo-card-front');
      front?.addEventListener('click', () => card.classList.toggle('flipped'));

      const saved = storage.get(knowKey(idx));
      if (saved) card.classList.add(saved === 'known' ? 'known' : 'review-again');

      card.querySelectorAll('[data-memo-know]').forEach((btn) => {
        if (btn.dataset.memoKnow === saved) btn.classList.add('active');
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = btn.dataset.memoKnow;
          storage.set(knowKey(idx), value);
          card.classList.remove('known', 'review-again');
          card.classList.add(value === 'known' ? 'known' : 'review-again');
          card.querySelectorAll('[data-memo-know]').forEach((b) => b.classList.toggle('active', b === btn));
          updateProgress();
        });
      });
    });
    updateProgress();

    section?.querySelector('[data-memo-hide-all]')?.addEventListener('click', () => {
      cards.forEach((c) => c.classList.remove('flipped'));
    });
    section?.querySelector('[data-memo-show-all]')?.addEventListener('click', () => {
      cards.forEach((c) => c.classList.add('flipped'));
    });
    section?.querySelector('[data-memo-shuffle]')?.addEventListener('click', () => {
      const shuffled = [...cards];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      shuffled.forEach((c) => container.appendChild(c));
    });
    const filterBtn = section?.querySelector('[data-memo-filter-review]');
    let filtering = false;
    filterBtn?.addEventListener('click', () => {
      filtering = !filtering;
      filterBtn.classList.toggle('active', filtering);
      cards.forEach((c) => {
        const isReview = storage.get(knowKey(c.dataset.memoCard)) === 'review';
        c.classList.toggle('filtered-out', filtering && !isReview);
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Checklist: multi-select, blanks, session log, reset (fix #9)
// ---------------------------------------------------------------------------

function initChecklist() {
  const slug = currentSlug();

  document.querySelectorAll('[data-checklist-group]').forEach((item) => {
    const groupId = item.dataset.checklistGroup;
    const multi = item.dataset.multi === '1';
    const key = `checklist:${slug}:${groupId}`;
    const buttons = [...item.querySelectorAll('.choice-btn')];

    const savedRaw = storage.getJSON(key);
    const saved = Array.isArray(savedRaw) ? savedRaw : savedRaw ? [savedRaw] : [];
    buttons.forEach((btn) => {
      if (saved.includes(btn.dataset.value)) btn.classList.add('selected');
    });

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (multi) {
          btn.classList.toggle('selected');
        } else {
          buttons.forEach((b) => b.classList.toggle('selected', b === btn));
        }
        const values = buttons.filter((b) => b.classList.contains('selected')).map((b) => b.dataset.value);
        storage.setJSON(key, values);
      });
    });
  });

  document.querySelectorAll('.blank-input').forEach((input) => {
    const key = `blank:${slug}:${input.dataset.blankIndex}`;
    const saved = storage.get(key);
    if (saved) input.value = saved;
    input.addEventListener('input', () => storage.set(key, input.value));
  });

  document.querySelectorAll('[data-checklist-session]').forEach((bar) => {
    const section = bar.closest('.checklist-section');
    const dateInput = bar.querySelector('[data-checklist-date]');
    const logEl = section?.querySelector('[data-checklist-log]');
    const logKey = `checklist-log:${slug}`;

    function renderLog() {
      const entries = storage.getJSON(logKey) || [];
      if (!logEl) return;
      logEl.innerHTML = entries
        .map(
          (entry, i) => `<div class="checklist-log-entry" data-log-index="${i}">
  <strong>${entry.date}</strong> 회차 기록
  <div class="checklist-log-detail">${entry.groups
    .map((g) => `${g.groupId}: ${g.selected.join(', ') || '(선택 없음)'}`)
    .join('\n')}${entry.blanks.length ? `\n요약: ${entry.blanks.join(' / ')}` : ''}</div>
</div>`
        )
        .join('') || '<p style="color:var(--text-muted);font-size:13px;">저장된 회차 기록이 없습니다.</p>';

      logEl.querySelectorAll('.checklist-log-entry').forEach((row) => {
        row.addEventListener('click', () => row.classList.toggle('open'));
      });
    }
    renderLog();

    bar.querySelector('[data-checklist-save-session]')?.addEventListener('click', () => {
      if (!section) return;
      const groups = [...section.querySelectorAll('[data-checklist-group]')].map((item) => ({
        groupId: item.dataset.checklistGroup,
        selected: [...item.querySelectorAll('.choice-btn.selected')].map((b) => b.dataset.value),
      }));
      const blanks = [...section.querySelectorAll('.blank-input')].map((i) => i.value).filter(Boolean);
      const date = dateInput?.value || new Date().toISOString().slice(0, 10);
      const entries = storage.getJSON(logKey) || [];
      entries.unshift({ date, groups, blanks });
      storage.setJSON(logKey, entries);
      renderLog();
    });

    bar.querySelector('[data-checklist-reset]')?.addEventListener('click', () => {
      if (!section) return;
      storage.keysWithPrefix(`checklist:${slug}:`).forEach((k) => storage.remove(k));
      storage.keysWithPrefix(`blank:${slug}:`).forEach((k) => storage.remove(k));
      section.querySelectorAll('.choice-btn.selected').forEach((b) => b.classList.remove('selected'));
      section.querySelectorAll('.blank-input').forEach((i) => (i.value = ''));
    });
  });
}

// ---------------------------------------------------------------------------
// Search: shared lookup (Pagefind + substring fallback), overlay + inline UI,
// click-through jumps to the matching section and highlights the term.
// ---------------------------------------------------------------------------

let plainIndexPromise = null;
function loadPlainIndex() {
  if (!plainIndexPromise) {
    plainIndexPromise = fetch('/search-index.json')
      .then((r) => r.json())
      .catch(() => []);
  }
  return plainIndexPromise;
}

let pagefindPromise = null;
function loadPagefind() {
  if (!pagefindPromise) {
    pagefindPromise = import('/pagefind/pagefind.js').catch(() => null);
  }
  return pagefindPromise;
}

function snippetAround(text, term, radius = 40) {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + term.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

// Pagefind has no stemming for Korean, and its Unicode word-boundary tokenizer
// treats an unspaced noun+particle run (e.g. "금리가") as one distinct word from
// "금리" itself, so a bare-noun query can miss particle-suffixed hits. We keep
// Pagefind (built per spec, and it scales better as content grows) but merge in
// a plain substring match over a per-section full-text index so "금리" also
// finds "금리가" / "금리를", and so results can link straight to the section.
async function runSearch(term) {
  const seen = new Set();
  const merged = [];

  const plainIndex = await loadPlainIndex();
  for (const doc of plainIndex) {
    if (doc.title.toLowerCase().includes(term.toLowerCase()) || doc.text.toLowerCase().includes(term.toLowerCase())) {
      if (seen.has(doc.url)) continue;
      const [base, hash] = doc.url.split('#');
      const url = `${base}?q=${encodeURIComponent(term)}${hash ? `#${hash}` : ''}`;
      merged.push({
        url,
        title: doc.title,
        sectionTitle: doc.sectionTitle,
        excerpt: snippetAround(doc.text, term),
      });
      seen.add(doc.url);
    }
  }

  const pagefind = await loadPagefind();
  if (pagefind) {
    const search = await pagefind.search(term);
    const items = await Promise.all(search.results.slice(0, 20).map((r) => r.data()));
    for (const item of items) {
      if (seen.has(item.url)) continue;
      merged.push({ url: item.url, title: item.meta?.title || item.url, sectionTitle: '', excerpt: item.excerpt });
      seen.add(item.url);
    }
  }

  return merged;
}

function renderSearchRow(item) {
  return `<a class="doc-row" href="${item.url}"><div class="doc-row-icon"></div><div class="doc-row-main"><div class="doc-row-title">${item.title}${
    item.sectionTitle ? ` · ${item.sectionTitle}` : ''
  }</div><div class="doc-row-summary">${item.excerpt}</div></div></a>`;
}

function wireSearchInput(input, resultsBox, { onEmpty } = {}) {
  input.addEventListener('input', async () => {
    const term = input.value.trim();
    if (!term) {
      resultsBox.innerHTML = '';
      onEmpty?.();
      return;
    }
    onEmpty?.(true);
    const results = await runSearch(term);
    resultsBox.innerHTML = results.length
      ? results.map(renderSearchRow).join('')
      : '<p style="color:var(--text-muted);font-size:13px;padding:12px 0;">검색 결과가 없습니다.</p>';
  });
}

function initHomeSearch() {
  const input = document.getElementById('pagefindInput');
  const resultsBox = document.getElementById('pagefind-results');
  const docList = document.getElementById('docList');
  if (!input || !resultsBox) return;
  wireSearchInput(input, resultsBox, {
    onEmpty: (searching) => {
      if (docList) docList.style.display = searching ? 'none' : '';
    },
  });
}

function initSearchOverlay() {
  const backdrop = document.getElementById('searchOverlayBackdrop');
  const input = document.getElementById('searchOverlayInput');
  const resultsBox = document.getElementById('searchOverlayResults');
  const closeBtn = document.getElementById('searchOverlayClose');
  if (!backdrop || !input || !resultsBox) return;

  wireSearchInput(input, resultsBox);

  const open = () => {
    backdrop.classList.add('open');
    input.value = '';
    resultsBox.innerHTML = '';
    setTimeout(() => input.focus(), 0);
  };
  const close = () => backdrop.classList.remove('open');

  closeBtn?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  document.querySelectorAll('[data-open-search]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const homeInput = document.getElementById('pagefindInput');
      if (homeInput) homeInput.focus();
      else open();
    });
  });
}

/** If we arrived from a search result (?q=term#sectionId), scroll to the
 *  section and wrap the first match in <mark>. */
function initSearchHighlightFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const term = params.get('q');
  if (!term || !window.location.hash) return;
  // section ids are already percent-encoded (see markdown.mjs's anchor slugify),
  // and so is location.hash, so look it up as-is rather than decoding it.
  const target = document.getElementById(window.location.hash.slice(1));
  if (!target) return;

  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const lowerTerm = term.toLowerCase();
  let node;
  let mark = null;
  while ((node = walker.nextNode())) {
    const idx = node.nodeValue.toLowerCase().indexOf(lowerTerm);
    if (idx === -1) continue;
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + term.length);
    mark = document.createElement('mark');
    mark.className = 'search-hit';
    range.surroundContents(mark);
    break;
  }
  requestAnimationFrame(() => (mark || target).scrollIntoView({ behavior: 'smooth', block: 'center' }));
}

// ---------------------------------------------------------------------------
// PWA
// ---------------------------------------------------------------------------

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

initTheme();
initFontSize();
initSettingsPanel();
initBackToTop();
initTopProgress();
initReadingProgressDonut();
initDocStatusButtons();
initDocStatusBadges();
initCategoryFilter();
initDocTabs();
initTocScrollSpy();
initTocSheet();
initKeyBoxJump();
initMemoJumpLinks();
initMemoCards();
initChecklist();
initHomeSearch();
initSearchOverlay();
initSearchHighlightFromQuery();
initServiceWorker();
