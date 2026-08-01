import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, '.firebase-public');
const manifest = JSON.parse(readFileSync(join(ROOT, 'hosting-public-files.json'), 'utf8'));
const publicFiles = manifest.files;

if (!Array.isArray(publicFiles) || publicFiles.length === 0) {
  throw new Error('hosting-public-files.json の files は空でない配列にしてください。');
}
if (new Set(publicFiles).size !== publicFiles.length) {
  throw new Error('hosting-public-files.json に重複したパスがあります。');
}

rmSync(OUTPUT, { recursive: true, force: true });

for (const relativePath of publicFiles) {
  if (typeof relativePath !== 'string' || isAbsolute(relativePath)) {
    throw new Error(`公開パスが不正です: ${String(relativePath)}`);
  }

  const source = resolve(ROOT, relativePath);
  const destination = resolve(OUTPUT, relativePath);
  if (!source.startsWith(`${ROOT}${sep}`) || !destination.startsWith(`${OUTPUT}${sep}`)) {
    throw new Error(`公開パスがプロジェクト外を参照しています: ${relativePath}`);
  }
  if (!statSync(source).isFile()) {
    throw new Error(`公開対象がファイルではありません: ${relativePath}`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

console.log(`Firebase Hosting用に${publicFiles.length}ファイルを準備しました。`);
