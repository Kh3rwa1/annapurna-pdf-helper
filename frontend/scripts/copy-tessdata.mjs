import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(root, '..');
const publicTessdata = join(frontendRoot, 'public', 'tessdata');
const publicTesseract = join(frontendRoot, 'public', 'tesseract');
const publicCore = join(frontendRoot, 'public', 'tesseract-core');
const nodeModules = join(frontendRoot, '..', 'node_modules');

mkdirSync(publicTessdata, { recursive: true });
mkdirSync(publicTesseract, { recursive: true });

for (const lang of ['eng', 'ben']) {
  const source = findFile(join(nodeModules, '@tesseract.js-data', lang), `${lang}.traineddata.gz`);
  if (!source) {
    console.warn(`Could not find ${lang}.traineddata.gz. Run npm install before building.`);
    continue;
  }

  cpSync(source, join(publicTessdata, `${lang}.traineddata.gz`));
}

const workerSource = join(nodeModules, 'tesseract.js', 'dist', 'worker.min.js');
if (existsSync(workerSource)) {
  cpSync(workerSource, join(publicTesseract, 'worker.min.js'));
} else {
  console.warn('Could not find tesseract.js worker.min.js. Run npm install before building.');
}

const coreSource = join(nodeModules, 'tesseract.js-core');
if (existsSync(coreSource)) {
  rmSync(publicCore, { recursive: true, force: true });
  cpSync(coreSource, publicCore, { recursive: true });
} else {
  console.warn('Could not find tesseract.js-core. Run npm install before building.');
}

function findFile(start, filename) {
  if (!existsSync(start)) return '';

  const entries = readdirSync(start);
  for (const entry of entries) {
    const fullPath = join(start, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      const found = findFile(fullPath, filename);
      if (found) return found;
    } else if (entry === filename) {
      return fullPath;
    }
  }

  return '';
}
