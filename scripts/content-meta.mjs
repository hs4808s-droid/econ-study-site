import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { CONTENT_DIR } from './paths.mjs';

const DATE_IN_BODY = /기준\s*시점\s*[:：]\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/;
const DATE_IN_FILENAME = /(\d{4})\s*년\s*(\d{1,2})\s*월판/;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

export async function listMarkdownFiles() {
  const all = await walk(CONTENT_DIR);
  return all.filter((f) => f.toLowerCase().endsWith('.md'));
}

export async function listAssetFiles() {
  const all = await walk(CONTENT_DIR);
  return all.filter((f) => !f.toLowerCase().endsWith('.md'));
}

function extractTitle(frontmatter, body) {
  if (frontmatter.title) return frontmatter.title;
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '제목 없음';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function slugify(name) {
  return name
    .trim()
    .replace(/[\s·—–]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function extractDate(frontmatter, body, filePath) {
  if (frontmatter.date) return String(frontmatter.date);

  const bodyMatch = body.match(DATE_IN_BODY);
  if (bodyMatch) {
    const [, y, m, d] = bodyMatch;
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  const nameMatch = path.basename(filePath).match(DATE_IN_FILENAME);
  if (nameMatch) {
    const [, y, m] = nameMatch;
    return `${y}-${pad(m)}-01`;
  }

  const stat = await fs.stat(filePath);
  return stat.mtime.toISOString().slice(0, 10);
}

function clip(text) {
  const plain = text.replace(/[*_`>#]/g, '').trim();
  return plain.length > 90 ? `${plain.slice(0, 90)}...` : plain;
}

function extractExcerpt(body) {
  const withoutFirstH1 = body.replace(/^#\s+.+$/m, '');
  const lines = withoutFirstH1.split('\n');

  // prefer the subtitle line (### ...) that immediately follows the title
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^###\s+/.test(trimmed)) return clip(trimmed.replace(/^###\s+/, ''));
    if (/^#{1,6}\s/.test(trimmed)) break; // hit a section heading before any subtitle
    if (trimmed.startsWith('>')) continue;
    if (trimmed === '---') continue;
    break; // first real content line wasn't a subtitle; fall through to paragraph scan
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s/.test(trimmed)) continue;
    if (trimmed.startsWith('>')) continue;
    if (trimmed === '---') continue;
    if (/^기준\s*시점\s*[:：]/.test(trimmed.replace(/[*_]/g, ''))) continue;
    const plain = clip(trimmed);
    if (plain) return plain;
  }
  return '';
}

export function toPlainText(body) {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_`>#|]/g, ' ')
    .replace(/^-{3,}$/gm, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function loadDocument(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const { data: frontmatter, content: body } = matter(raw);
  const stat = await fs.stat(filePath);
  const relDir = path.dirname(path.relative(CONTENT_DIR, filePath)).replace(/\\/g, '/');

  return {
    filePath,
    assetBase: relDir === '.' ? '' : relDir,
    slug: slugify(path.basename(filePath, '.md')),
    title: extractTitle(frontmatter, body),
    date: await extractDate(frontmatter, body, filePath),
    category: frontmatter.category || '미분류',
    tags: frontmatter.tags || [],
    excerpt: extractExcerpt(body),
    updatedAt: stat.mtime.toISOString(),
    body,
  };
}
