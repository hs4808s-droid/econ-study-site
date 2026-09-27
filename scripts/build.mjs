import fs from 'node:fs/promises';
import path from 'node:path';
import { DIST_DIR, ROOT, CONTENT_DIR } from './paths.mjs';
import { listMarkdownFiles, listAssetFiles, loadDocument, toPlainText } from './content-meta.mjs';
import { renderDocumentBody } from '../src/render/markdown.mjs';
import { renderPage } from '../src/render/layout.mjs';
import { renderDocPage } from '../src/pages/doc.mjs';
import { renderHomePage } from '../src/pages/home.mjs';

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function copyDir(srcDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await copyFile(s, d);
  }
}

function readingMinutesFor(body) {
  return Math.max(1, Math.round(body.length / 500));
}

function htmlToPlainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });

  const files = await listMarkdownFiles();
  if (files.length === 0) {
    console.warn('content/ 에 마크다운 파일이 없습니다. 빈 사이트를 생성합니다.');
  }

  const docs = [];
  for (const file of files) {
    const meta = await loadDocument(file);
    const rendered = renderDocumentBody(meta.body, { assetBase: meta.assetBase });
    docs.push({
      ...meta,
      html: rendered.html,
      sections: rendered.sections,
      keyBoxes: rendered.keyBoxes,
    });
  }

  docs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title)));

  const categories = [...new Set(docs.map((d) => d.category))].sort();

  // ---- doc pages ----
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const prevDoc = docs[i - 1] || null;
    const nextDoc = docs[i + 1] || null;
    const { bodyHtml, active } = renderDocPage(doc, {
      prevDoc,
      nextDoc,
      readingMinutes: readingMinutesFor(doc.body),
    });
    const html = renderPage({
      active,
      title: `${doc.title} | 경제 공부`,
      description: doc.excerpt || doc.title,
      bodyHtml,
    });
    await fs.mkdir(path.join(DIST_DIR, 'docs'), { recursive: true });
    await fs.writeFile(path.join(DIST_DIR, 'docs', `${doc.slug}.html`), html, 'utf8');
  }

  // ---- home page ----
  {
    const { bodyHtml, active } = renderHomePage(docs, categories);
    const html = renderPage({
      active,
      title: '경제 공부 | 홈',
      description: '경제 공부 자료 모음 사이트',
      bodyHtml,
    });
    await fs.writeFile(path.join(DIST_DIR, 'index.html'), html, 'utf8');
  }

  // ---- static assets ----
  await copyDir(path.join(ROOT, 'src', 'styles'), path.join(DIST_DIR, 'styles'));
  await copyDir(path.join(ROOT, 'src', 'client'), path.join(DIST_DIR, 'client'));
  await copyDir(path.join(ROOT, 'public'), DIST_DIR);

  const swTemplate = await fs.readFile(path.join(ROOT, 'pwa', 'sw.js'), 'utf8');
  const cacheVersion = String(Date.now());
  await fs.writeFile(
    path.join(DIST_DIR, 'sw.js'),
    swTemplate.replace('__CACHE_VERSION__', cacheVersion),
    'utf8'
  );
  await copyFile(path.join(ROOT, 'pwa', 'manifest.json'), path.join(DIST_DIR, 'manifest.json'));

  // ---- plain-text search index (substring fallback; Pagefind's ko tokenizer
  // treats "금리가/금리를" as whole words distinct from "금리", see README).
  // Indexed per section so a result can jump straight to the matching spot. ----
  const searchIndex = [];
  for (const d of docs) {
    const sectionTitleById = new Map(d.sections.map((s) => [s.id, s.title]));
    const sectionRe = /<section[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g;
    let m;
    let matchedAny = false;
    while ((m = sectionRe.exec(d.html))) {
      matchedAny = true;
      const [, sectionId, innerHtml] = m;
      const text = htmlToPlainText(innerHtml);
      if (!text) continue;
      searchIndex.push({
        slug: d.slug,
        title: d.title,
        url: `/docs/${d.slug}.html#${sectionId}`,
        sectionTitle: sectionTitleById.get(sectionId) || d.title,
        text,
      });
    }
    if (!matchedAny) {
      searchIndex.push({
        slug: d.slug,
        title: d.title,
        url: `/docs/${d.slug}.html`,
        sectionTitle: d.title,
        text: toPlainText(d.body),
      });
    }
  }
  await fs.writeFile(path.join(DIST_DIR, 'search-index.json'), JSON.stringify(searchIndex), 'utf8');

  // ---- content assets referenced by markdown (images etc.) ----
  const assets = await listAssetFiles();
  for (const asset of assets) {
    const rel = path.relative(CONTENT_DIR, asset);
    await copyFile(asset, path.join(DIST_DIR, 'content', rel));
  }

  console.log(`빌드 완료: 문서 ${docs.length}개, 카테고리 ${categories.length}개 -> dist/`);
}

await main();
