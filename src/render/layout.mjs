import { icon } from './icons.mjs';

function navItems(active) {
  const items = [
    { key: 'home', href: '/index.html', label: '홈', icon: 'home' },
    { key: 'search', href: '#', label: '검색', icon: 'search', attr: 'data-open-search' },
    { key: 'review', href: '/index.html?filter=review', label: '복습', icon: 'review' },
    { key: 'settings', href: '#', label: '설정', icon: 'settings', attr: 'data-open-settings' },
  ];
  return items
    .map(
      (it) =>
        `<a class="nav-item${it.key === active ? ' active' : ''}" href="${it.href}" ${
          it.attr || ''
        } title="${it.label}">${icon(it.icon)}</a>`
    )
    .join('');
}

export function renderPage({
  active = 'home',
  title,
  description = '경제 공부 자료 모음',
  bodyHtml,
  bodyClass = '',
  extraHead = '',
  extraScripts = '',
}) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta name="theme-color" content="#0f1b2d">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/icon.svg">
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
<link rel="stylesheet" href="/styles/main.css">
${extraHead}
</head>
<body class="${bodyClass}">
<div class="top-progress"><div class="top-progress-bar" id="topProgressBar"></div></div>
<div class="app-shell">
  <aside class="sidebar">
    <div class="sidebar-logo">경</div>
    <nav class="sidebar-nav">${navItems(active)}</nav>
  </aside>
  <nav class="bottom-tabbar">${navItems(active)}</nav>
  <div class="main-area">
    ${bodyHtml}
  </div>
</div>
<button class="back-to-top" id="backToTop" title="맨 위로">${icon('arrowUp')}</button>
<div class="settings-panel" id="settingsPanel">
  <div class="settings-row">
    <span>다크 모드</span>
    <button type="button" class="theme-toggle-btn" id="themeToggle">
      ${icon('moon', { size: 14 })}
      <span id="themeToggleLabel">꺼짐</span>
    </button>
  </div>
  <div class="settings-row">
    <span>글자 크기</span>
    <div class="font-size-group" id="fontSizeGroup">
      <button type="button" data-size="sm">가</button>
      <button type="button" data-size="md">가</button>
      <button type="button" data-size="lg">가</button>
    </div>
  </div>
</div>
<div class="toc-sheet-backdrop" id="tocBackdrop"></div>
<div class="search-overlay-backdrop" id="searchOverlayBackdrop">
  <div class="search-overlay" role="dialog" aria-modal="true" aria-label="문서 검색">
    <div class="search-overlay-input-row">
      ${icon('search', { size: 16 })}
      <input type="search" id="searchOverlayInput" class="search-input" placeholder="문서 검색 (예: 금리)">
      <button type="button" id="searchOverlayClose" aria-label="닫기">${icon('x', { size: 18 })}</button>
    </div>
    <div id="searchOverlayResults" class="search-overlay-results"></div>
  </div>
</div>
<script src="/client/app.js" type="module"></script>
${extraScripts}
</body>
</html>`;
}
