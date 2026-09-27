import { icon } from '../render/icons.mjs';

function docRow(doc) {
  return `<a class="doc-row" href="/docs/${doc.slug}.html" data-doc-row data-slug="${doc.slug}" data-category="${doc.category}">
    <div class="doc-row-icon">${icon('doc', { size: 18 })}</div>
    <div class="doc-row-main">
      <div class="doc-row-title">${doc.title}</div>
      <div class="doc-row-summary">${doc.excerpt || ''}</div>
      <div class="doc-row-badges">
        <span class="badge badge-category">${doc.category}</span>
        ${(doc.tags || []).map((t) => `<span class="badge badge-tag">#${t}</span>`).join('')}
        <span class="doc-row-status" data-doc-status="${doc.slug}" hidden></span>
      </div>
    </div>
    <div class="doc-row-date">${doc.date}</div>
  </a>`;
}

function timelineItem(doc) {
  const d = new Date(doc.updatedAt);
  const label = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  return `<li><div class="timeline-date">${label}</div><a class="timeline-title" href="/docs/${doc.slug}.html">${doc.title}</a></li>`;
}

export function renderHomePage(docs, categories) {
  const sortedByUpdate = [...docs].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const lastUpdated = sortedByUpdate[0]?.updatedAt?.slice(0, 10) || '-';

  const bodyHtml = `
<div class="page-container">
  <div class="home-top">
    <div class="search-input-wrap">
      ${icon('search', { size: 16 })}
      <input class="search-input" id="pagefindInput" type="search" placeholder="문서 검색 (예: 금리)">
    </div>
  </div>
  <div class="filter-chips" id="categoryChips" style="margin-bottom:20px;">
    <button type="button" class="chip active" data-category-chip="__all__">전체</button>
    ${categories.map((c) => `<button type="button" class="chip" data-category-chip="${c}">${c}</button>`).join('')}
  </div>

  <div class="summary-cards">
    <div class="card summary-card"><div class="value">${docs.length}</div><div class="label">전체 문서 수</div></div>
    <div class="card summary-card"><div class="value" id="reviewCountValue">-</div><div class="label">복습 필요 문서</div></div>
    <div class="card summary-card"><div class="value">${lastUpdated}</div><div class="label">최근 업데이트일</div></div>
  </div>

  <div class="content-grid">
    <div class="card">
      <div class="card-title">문서 목록</div>
      <div id="pagefind-results"></div>
      <div class="doc-list" id="docList">
        ${docs.map(docRow).join('')}
      </div>
    </div>
    <aside class="right-panel">
      <div class="card">
        <div class="card-title">최근 추가·수정</div>
        <ul class="timeline">${sortedByUpdate.slice(0, 6).map(timelineItem).join('')}</ul>
      </div>
    </aside>
  </div>
</div>
`;

  return { bodyHtml, active: 'home' };
}
