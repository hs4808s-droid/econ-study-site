# 경제 공부 사이트

`C:\Users\KMI\OneDrive\Desktop\경제 공부` 폴더의 마크다운 자료를 정적 HTML 학습 사이트로 변환합니다.
원본 폴더는 읽기 전용으로만 사용하며, `watch.mjs`가 변경을 감지해 `content/`로 미러링하고 자동으로 git commit/push 합니다. 배포는 Vercel이 push마다 `npm run build`를 실행해 처리합니다.

## 폴더 구조

- `content/` — 원본 폴더 미러(자동 생성, 직접 수정하지 말 것)
- `scripts/` — 빌드/동기화/감시 스크립트
- `src/render/` — markdown-it 커스텀 렌더링, 페이지 레이아웃, 아이콘
- `src/pages/` — 홈/문서 페이지 템플릿
- `src/client/app.js` — 다크모드, 글자 크기, TOC, 체크리스트/암기카드, 검색, PWA 등록
- `src/styles/main.css` — 전체 스타일
- `pwa/` — manifest, service worker
- `dist/` — 빌드 결과물 (git에 커밋하지 않음, Vercel이 빌드)

## 명령어

```bash
npm run sync   # 원본 폴더 -> content/ 즉시 동기화 (1회)
npm run build  # content/ -> dist/ 빌드 + Pagefind 인덱스 생성
npm run dev    # 빌드 후 로컬 미리보기 서버 (http://localhost:4321)
npm run watch  # 원본 폴더 감시 + 자동 content 동기화 + git commit/push (포그라운드 실행)
```

## 새 문서 작성법

`경제 공부` 폴더에 `.md` 파일을 추가/수정/삭제하기만 하면 됩니다. 사람이 따로 할 일은 없습니다 (자동 시작 등록 시).

### Frontmatter (선택)

frontmatter가 없으면 아래 규칙으로 자동 추출됩니다.

```markdown
---
title: 문서 제목
date: 2026-09-27
category: 통화정책
tags: [금리, QT]
---

# 문서 제목

본문...
```

- `title` 없으면 첫 번째 `# H1` 사용
- `date` 없으면 본문의 "기준 시점: 2026년 9월 27일" → 파일명의 "2026년 9월판" → 파일 수정일 순으로 추출
- `category` 없으면 "미분류"

### 문서 구조 규칙

- 첫 번째 H1 = 문서 제목 (사이트 헤더에 표시, 본문에는 다시 나오지 않음)
- 이후 H1들 = 섹션 제목 (H2로 낮춰지고 로마숫자 제거 후 01, 02... 자동 번호)
- 인용문(`>`) = 핵심 박스 카드
- 단독 줄 "↓" 또는 2줄 이상 연속된 "→ ..." = 세로 흐름도로 자동 변환
- 제목에 "체크리스트"가 포함된 섹션 안의 "① ..." 항목만 선택 버튼으로 변환 (다른 곳은 그대로 텍스트)
- 제목에 "암기" 또는 "핵심 N문장"이 포함된 섹션 = 접이식 암기 카드

## 자동 시작 (Windows 로그인 시 watch.mjs 실행)

```powershell
# 등록 (관리자 권한 불필요 — 사용자 시작프로그램 폴더 사용)
powershell -ExecutionPolicy Bypass -File setup-autostart.ps1

# 해제
powershell -ExecutionPolicy Bypass -File remove-autostart.ps1
```

콘솔 창 없이 백그라운드로 실행됩니다 (`scripts/run-watch-hidden.vbs`).

## 로그

- `logs/watch.log` — 동기화/커밋/푸시 기록과 오류

## 검색 (Pagefind)

Pagefind는 한국어 어간 처리(형태소 분석)를 지원하지 않아 "금리"로 검색했을 때 "금리가"/"금리를"처럼 조사가 붙은 형태를 놓칠 수 있습니다. 이를 보완하기 위해 빌드 시 `dist/search-index.json`(문서 평문 텍스트)을 추가로 생성하고, 검색창 입력 시 Pagefind 결과와 부분 문자열 검색 결과를 합쳐서 보여줍니다.

## 배포 (Vercel)

1. GitHub 저장소를 만들고 이 프로젝트를 push합니다 (아래 안내 참고).
2. [vercel.com](https://vercel.com)에서 "Add New Project" → 방금 만든 GitHub 저장소 선택.
3. Framework Preset: **Other**
4. Build Command: `npm run build` (자동으로 `vercel.json`에서 읽힘)
5. Output Directory: `dist`
6. Deploy.

이후 GitHub에 push될 때마다 Vercel이 자동으로 재배포합니다.
