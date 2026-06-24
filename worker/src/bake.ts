import { writeFileSync, renameSync } from 'node:fs';
export function writeJsonAtomic(path: string, data: unknown): void {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data), 'utf8');
  renameSync(tmp, path);
}
