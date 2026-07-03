const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist', 'web');

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function rimraf(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function copyRecursive(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    ensureDir(target);
    fs.readdirSync(source).forEach((entry) => {
      copyRecursive(path.join(source, entry), path.join(target, entry));
    });
    return;
  }
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function runCatalogBuild() {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'generate-data.js')], {
    cwd: ROOT,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error('No se pudieron generar los catalogos de datos.');
  }
}

function main() {
  runCatalogBuild();
  rimraf(DIST_DIR);
  ensureDir(DIST_DIR);

  const rootEntries = ['index.html', 'src'];
  rootEntries.forEach((entry) => {
    const source = path.join(ROOT, entry);
    if (fs.existsSync(source)) {
      copyRecursive(source, path.join(DIST_DIR, entry));
    }
  });

  const publicEntries = ['assets', 'data', 'routes'];
  publicEntries.forEach((entry) => {
    const source = path.join(PUBLIC_DIR, entry);
    if (fs.existsSync(source)) {
      copyRecursive(source, path.join(DIST_DIR, entry));
    }
  });

  console.log(`Build web listo en ${DIST_DIR}`);
}

main();
