import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_DIR, CONTENT_DIR, isIgnoredEntry } from './paths.mjs';

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (isIgnoredEntry(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function syncOnce() {
  const changed = { added: [], updated: [], removed: [] };

  if (!(await fileExists(SOURCE_DIR))) {
    throw new Error(`원본 폴더를 찾을 수 없습니다: ${SOURCE_DIR}`);
  }
  await fs.mkdir(CONTENT_DIR, { recursive: true });

  const sourceFiles = await walk(SOURCE_DIR);
  const sourceRelSet = new Set();

  for (const srcFile of sourceFiles) {
    const rel = path.relative(SOURCE_DIR, srcFile);
    sourceRelSet.add(rel);
    const destFile = path.join(CONTENT_DIR, rel);

    const srcBuf = await fs.readFile(srcFile);
    let existed = false;
    let same = false;
    try {
      const destBuf = await fs.readFile(destFile);
      existed = true;
      same = destBuf.equals(srcBuf);
    } catch {
      existed = false;
    }

    if (!same) {
      await fs.mkdir(path.dirname(destFile), { recursive: true });
      await fs.writeFile(destFile, srcBuf);
      changed[existed ? 'updated' : 'added'].push(rel);
    }
  }

  // mirror deletions/renames: remove anything in content/ not present in source/
  const destFiles = await walk(CONTENT_DIR).catch(() => []);
  for (const destFile of destFiles) {
    const rel = path.relative(CONTENT_DIR, destFile);
    if (!sourceRelSet.has(rel)) {
      await fs.rm(destFile, { force: true });
      changed.removed.push(rel);
    }
  }

  // clean up now-empty directories left behind by removals
  await removeEmptyDirs(CONTENT_DIR);

  return changed;
}

async function removeEmptyDirs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const full = path.join(dir, entry.name);
      await removeEmptyDirs(full);
      const remaining = await fs.readdir(full).catch(() => null);
      if (remaining && remaining.length === 0) await fs.rmdir(full).catch(() => {});
    }
  }
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  const result = await syncOnce();
  console.log(JSON.stringify(result, null, 2));
}
