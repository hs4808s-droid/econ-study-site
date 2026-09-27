import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const SOURCE_DIR = 'C:\\Users\\KMI\\OneDrive\\Desktop\\경제 공부';
export const CONTENT_DIR = path.join(ROOT, 'content');
export const DIST_DIR = path.join(ROOT, 'dist');
export const LOG_DIR = path.join(ROOT, 'logs');

export function isIgnoredEntry(name) {
  if (name.startsWith('~$')) return true;
  if (name.startsWith('.')) return true;
  if (name.toLowerCase().endsWith('.tmp')) return true;
  if (name.toLowerCase() === 'thumbs.db') return true;
  if (name.toLowerCase() === 'desktop.ini') return true;
  return false;
}
