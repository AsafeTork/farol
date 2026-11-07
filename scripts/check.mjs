import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function walk(path) {
  let result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'paginas-farol'].includes(entry.name)) continue;
    const full = resolve(path, entry.name);
    result.push(...(entry.isDirectory() ? await walk(full) : [full]));
  }
  return result;
}
const files = await walk(root);
let count = 0;
for (const path of files.filter(path => /\.(?:mjs|js)$/.test(path))) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding:'utf8' });
  if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
  count++;
}
const manifest = JSON.parse(await readFile(resolve(root, 'extension/manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3 || manifest.host_permissions?.length || manifest.permissions.some(p => !['activeTab','scripting','storage'].includes(p))) {
  throw new Error('A extensão deve usar MV3 e permissões mínimas.');
}
console.log(`${count} arquivos JavaScript verificados; manifesto com permissões mínimas.`);
