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
};

const REVIEW_AFTER_DAYS = 14;

function initTheme() {
  const saved = storage.get('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current =
      document.documentElement.getAttribute('data-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    storage.set('theme', next);
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

function initSearchShortcut() {
  const openers = document.querySelectorAll('[data-open-search]');
  openers.forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const input = document.getElementById('pagefindInput');
      if (input) {
        input.focus();
      } else {
        window.location.href = '/index.html#search';
      }
    })
  );
}

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
    return pct;
  };
  document.addEventListener('scroll', () => {
    const pct = update();
    if (pct >= 85) markRead(body.dataset.docSlug);
  }, { passive: true });
  update();
}

function markRead(slug) {
  if (!slug) return;
  const key = `read:${slug}`;
  const existing = storage.getJSON(key);
  if (existing && Date.now() - existing.at < 1000 * 60 * 60) return; // avoid rewriting repeatedly
  storage.setJSON(key, { at: Date.now() });
}

function readStatus(slug) {
  const rec = storage.getJSON(`read:${slug}`);
  if (!rec) return 'unread';
  const days = (Date.now() - rec.at) / (1000 * 60 * 60 * 24);
  return days > REVIEW_AFTER_DAYS ? 'review' : 'read';
}

function initDocStatusBadges() {
  const rows = document.querySelectorAll('[data-doc-status]');
  let reviewCount = 0;
  rows.forEach((el) => {
    const slug = el.dataset.docStatus;
    const status = readStatus(slug);
    if (status === 'unread') return;
    el.hidden = false;
    el.textContent = status === 'review' ? '복습 필요' : '읽음';
    el.style.color = status === 'review' ? 'var(--accent)' : 'var(--down)';
    if (status === 'review') reviewCount += 1;
  });
  const reviewValue = document.getElementById('reviewCountValue');
  if (reviewValue) reviewValue.textContent = String(reviewCount);
  return reviewCount;
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
      const matchReview = !reviewOnly || readStatus(row.dataset.slug) === 'review';
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

function initMemoToggle() {
  document.querySelectorAll('.memo-section').forEach((section) => {
    section.classList.add('memo-collapsed');
  });
  document.querySelectorAll('[data-memo-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.memo-section');
      section.classList.toggle('memo-collapsed');
      btn.textContent = section.classList.contains('memo-collapsed') ? '암기 카드로 보기' : '접기';
    });
  });
}

function initChecklist() {
  const slug = document.querySelector('.doc-body')?.dataset.docSlug;
  document.querySelectorAll('[data-checklist-group]').forEach((item) => {
    const groupId = item.dataset.checklistGroup;
    const key = `checklist:${slug}:${groupId}`;
    const saved = storage.get(key);
    const buttons = item.querySelectorAll('.choice-btn');
    buttons.forEach((btn) => {
      if (btn.dataset.value === saved) btn.classList.add('selected');
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        storage.set(key, btn.dataset.value);
      });
    });
  });
}

function initDocTabs() {
  const bar = document.querySelector('[data-doc-tabs]');
  const body = document.querySelector('.doc-body');
  if (!bar || !body) return;
  bar.querySelectorAll('[data-tab-btn]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      bar.querySelectorAll('[data-tab-btn]').forEach((b) => b.classList.toggle('active', b === btn));
      body.dataset.tab = btn.dataset.tabBtn;
    });
  });
}

function initTocScrollSpy() {
  const links = document.querySelectorAll('[data-toc-link]');
  if (!links.length) return;
  const sections = [...links]
    .map((l) => document.getElementById(l.dataset.target))
    .filter(Boolean);

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
}

function snippetAround(text, term, radius = 40) {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + term.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

function renderRow(item) {
  return `<a class="doc-row" href="${item.url}"><div class="doc-row-icon"></div><div class="doc-row-main"><div class="doc-row-title">${item.title}</div><div class="doc-row-summary">${item.excerpt}</div></div></a>`;
}

// Pagefind has no stemming for Korean, and its Unicode word-boundary tokenizer
// treats an unspaced noun+particle run (e.g. "금리가") as one distinct word from
// "금리" itself, so a bare-noun query can miss particle-suffixed hits. We keep
// Pagefind (built per spec, and it scales better as content grows) but merge in
// a plain substring match over a small full-text index to guarantee that
// "금리" also finds "금리가" / "금리를".
async function initPagefindSearch() {
  const input = document.getElementById('pagefindInput');
  const resultsBox = document.getElementById('pagefind-results');
  const docList = document.getElementById('docList');
  if (!input || !resultsBox) return;

  let pagefind = null;
  try {
    pagefind = await import('/pagefind/pagefind.js');
  } catch {
    /* search index not built yet; substring fallback still works */
  }

  let plainIndex = null;
  try {
    const res = await fetch('/search-index.json');
    plainIndex = await res.json();
  } catch {
    plainIndex = [];
  }

  input.addEventListener('input', async () => {
    const term = input.value.trim();
    if (!term) {
      resultsBox.innerHTML = '';
      if (docList) docList.style.display = '';
      return;
    }
    if (docList) docList.style.display = 'none';

    const seen = new Set();
    const merged = [];

    for (const doc of plainIndex) {
      if (doc.title.toLowerCase().includes(term.toLowerCase()) || doc.text.toLowerCase().includes(term.toLowerCase())) {
        merged.push({ url: doc.url, title: doc.title, excerpt: snippetAround(doc.text, term) });
        seen.add(doc.url);
      }
    }

    if (pagefind) {
      const search = await pagefind.search(term);
      const items = await Promise.all(search.results.slice(0, 20).map((r) => r.data()));
      for (const item of items) {
        if (seen.has(item.url)) continue;
        merged.push({ url: item.url, title: item.meta?.title || item.url, excerpt: item.excerpt });
        seen.add(item.url);
      }
    }

    resultsBox.innerHTML = merged.length
      ? merged.map(renderRow).join('')
      : '<p style="color:var(--text-muted);font-size:13px;padding:12px 0;">검색 결과가 없습니다.</p>';
  });
}

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

initTheme();
initFontSize();
initSettingsPanel();
initSearchShortcut();
initBackToTop();
initTopProgress();
initReadingProgressDonut();
initDocStatusBadges();
initCategoryFilter();
initMemoToggle();
initChecklist();
initDocTabs();
initTocScrollSpy();
initTocSheet();
initPagefindSearch();
initServiceWorker();
