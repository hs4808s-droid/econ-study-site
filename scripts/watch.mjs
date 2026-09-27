import chokidar from 'chokidar';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, SOURCE_DIR, LOG_DIR, isIgnoredEntry } from './paths.mjs';
import { syncOnce } from './sync-content.mjs';

const DEBOUNCE_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 15_000;

let debounceTimer = null;
let running = false;
let rerunRequested = false;

async function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.appendFile(path.join(LOG_DIR, 'watch.log'), stamped + '\n', 'utf8');
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pushWithRetry() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      git('push');
      await log('git push 성공');
      return true;
    } catch (err) {
      await log(`git push 실패 (시도 ${attempt}/${MAX_RETRIES}): ${err.message.split('\n')[0]}`);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }
  await log('git push 최종 실패. 다음 변경 시 다시 시도합니다.');
  return false;
}

async function runSync(reason) {
  if (running) {
    rerunRequested = true;
    return;
  }
  running = true;
  try {
    await log(`동기화 시작 (${reason})`);
    const result = await syncOnce();
    const changedFiles = [...result.added, ...result.updated, ...result.removed];
    if (changedFiles.length === 0) {
      await log('변경 없음');
      return;
    }
    await log(
      `변경 감지: 추가 ${result.added.length}, 수정 ${result.updated.length}, 삭제 ${result.removed.length}`
    );

    git('add', '-A', 'content');
    const status = git('status', '--porcelain', '--', 'content');
    if (!status.trim()) {
      await log('git에 반영할 변경 없음 (내용 동일)');
      return;
    }

    const summary = changedFiles.slice(0, 3).join(', ') + (changedFiles.length > 3 ? ' 외' : '');
    git('commit', '-m', `docs: ${summary} 자동 반영`);
    await log(`git commit 완료: ${summary}`);
    await pushWithRetry();
  } catch (err) {
    await log(`오류: ${err.stack || err.message}`);
  } finally {
    running = false;
    if (rerunRequested) {
      rerunRequested = false;
      await runSync('재실행');
    }
  }
}

function scheduleSync(reason) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runSync(reason), DEBOUNCE_MS);
}

async function main() {
  await log('watch.mjs 시작');
  await runSync('시작 시 전체 동기화');

  const watcher = chokidar.watch(SOURCE_DIR, {
    ignored: (filePath) => isIgnoredEntry(path.basename(filePath)),
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 500 },
  });

  watcher
    .on('add', (p) => scheduleSync(`추가: ${path.basename(p)}`))
    .on('change', (p) => scheduleSync(`수정: ${path.basename(p)}`))
    .on('unlink', (p) => scheduleSync(`삭제: ${path.basename(p)}`))
    .on('addDir', (p) => scheduleSync(`폴더 추가: ${path.basename(p)}`))
    .on('unlinkDir', (p) => scheduleSync(`폴더 삭제: ${path.basename(p)}`))
    .on('error', (err) => log(`watcher 오류: ${err.message}`));

  await log(`감시 중: ${SOURCE_DIR}`);
}

await main();
