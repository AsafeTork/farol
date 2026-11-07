import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// An explicit allowlist prevents internal documents from reaching Pages.
export const publicFiles = Object.freeze([
  '.nojekyll', 'index.html', 'farol-sessao-viva.html', 'pratica.html',
  'assets/farol.css', 'assets/farol.js', 'assets/farol-icon.svg',
  'assets/pratica.css', 'assets/pratica.mjs',
  'src/core/privacy.mjs', 'src/core/planner.mjs',
  'src/ui/assistant.mjs', 'src/ui/styles.mjs',
]);

async function copyFile(path, destination) {
  await mkdir(dirname(resolve(destination, path)), { recursive: true });
  await cp(resolve(root, path), resolve(destination, path));
}

export async function build() {
  const site = resolve(root, 'paginas-farol');
  const extension = resolve(root, 'dist/extension');
  await rm(site, { recursive: true, force: true });
  await rm(extension, { recursive: true, force: true });
  await mkdir(site, { recursive: true });
  await mkdir(extension, { recursive: true });
  for (const file of publicFiles) await copyFile(file, site);
  // Only frontend source belongs to the extension. No docs, backend or tokens.
  for (const entry of await readdir(resolve(root, 'extension'))) {
    await cp(resolve(root, 'extension', entry), resolve(extension, entry), { recursive: true });
  }
  await cp(resolve(root, 'src'), resolve(extension, 'src'), { recursive: true });
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(resolve(root, 'dist/build-manifest.json'), JSON.stringify({ version: 1, publicFiles }, null, 2) + '\n');
  return { site, extension };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await build();
  console.log(`Site: ${output.site}\nExtensão: ${output.extension}`);
}
