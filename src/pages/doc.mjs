import { icon } from '../render/icons.mjs';

function tocHtml(sections) {
  if (!sections.length) return '<p style="color:var(--text-muted);font-size:13px;">섹션 없음</p>';
  return `<ul class="toc-list">${sections
    .map((s) => `<li><a href="#${s.id}" data-toc-link data-target="${s.id}">${String(s.number).padStart(2, '0')}. ${s.title}</a></li>`)
    .join('')}</ul>`;
}

function progressDonut(id) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return `<div class="progress-donut-wrap">
  <svg width="64" height="64" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--border)" stroke-width="6"/>
    <circle id="${id}" cx="32" cy="32" r="${r}" fill="none" stroke="var(--accent)" stroke-width="6"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}"
      stroke-linecap="round" transform="rotate(-90 32 32)"/>
  </svg>
  <div><div class="progress-donut-label" id="${id}Label">0%</div><div style="font-size:12px;color:var(--text-muted)">읽기 진행률</div></div>
</div>`;
}

export function renderDocPage(doc, { prevDoc, nextDoc, keyBoxesHtml, readingMinutes }) {
  const bodyHtml = `
<div class="page-container">
  <div class="breadcrumb">
    <a href="/index.html">홈</a>
    ${icon('chevronRight')}
    <span>${doc.category}</span>
    ${icon('chevronRight')}
    <span>${doc.title}</span>
  </div>

  <div class="doc-header-title">
    <h1>${doc.title}</h1>
    <span class="badge badge-category">${doc.category}</span>
    ${doc.important ? '<span class="badge badge-important">중요</span>' : ''}
    ${(doc.tags || []).map((t) => `<span class="badge badge-tag">#${t}</span>`).join('')}
  </div>
  <div class="doc-meta">
    <span>기준일 ${doc.date}</span>
    <span>읽기 ${readingMinutes}분</span>
    <span>섹션 ${doc.sections.length}개</span>
  </div>

  <div class="tabbar" data-doc-tabs>
    <a href="#" class="tab-link active" data-tab-btn="body">본문</a>
    <a href="#" class="tab-link" data-tab-btn="summary">핵심 요약</a>
    <a href="#" class="tab-link" data-tab-btn="memo">암기 카드</a>
    <a href="#" class="tab-link" data-tab-btn="checklist">체크리스트</a>
  </div>

  <div class="content-grid">
    <article class="doc-body" data-tab="body" data-doc-slug="${doc.slug}" data-pagefind-body data-pagefind-meta="title:${doc.title}">
      <div class="doc-summary-view doc-section" data-pagefind-ignore>
        <div class="section-label">SUMMARY</div>
        <h2>핵심 요약</h2>
        ${keyBoxesHtml || '<p style="color:var(--text-muted)">이 문서에는 핵심 박스가 없습니다.</p>'}
      </div>
      ${doc.html}
      <div class="doc-nav" data-pagefind-ignore>
        ${prevDoc ? `<a class="prev" href="/docs/${prevDoc.slug}.html"><div class="doc-nav-label">${icon('arrowLeft', { size: 14 })} 이전 문서</div>${prevDoc.title}</a>` : '<span></span>'}
        ${nextDoc ? `<a class="next" href="/docs/${nextDoc.slug}.html"><div class="doc-nav-label">다음 문서 ${icon('arrowRight', { size: 14 })}</div>${nextDoc.title}</a>` : '<span></span>'}
      </div>
    </article>

    <aside class="right-panel">
      <div class="card">
        <div class="card-title">목차</div>
        ${tocHtml(doc.sections)}
      </div>
      <div class="card">
        <div class="card-title">읽기 진행률</div>
        ${progressDonut('readProgress')}
      </div>
      <div class="card">
        <div class="card-title">핵심 박스 모음</div>
        <div style="max-height:260px;overflow-y:auto;">${keyBoxesHtml || '<p style="color:var(--text-muted);font-size:13px;">없음</p>'}</div>
      </div>
    </aside>
  </div>
</div>
<button class="toc-sheet-trigger" id="tocSheetTrigger">${icon('list', { size: 16 })} 목차</button>
<div class="toc-sheet" id="tocSheet">
  <div class="card-title">목차</div>
  ${tocHtml(doc.sections)}
</div>
`;

  return { bodyHtml, active: 'docs' };
}
