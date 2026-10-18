import { mkdir, readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../dedication.js', import.meta.url), 'utf8');
const target = new URL('../supabase/functions/dedications/song-parser.mjs', import.meta.url);
const generated = '// Generated from dedication.js by scripts/build-dedication-backend.mjs. Do not edit.\n'
  + 'const module = { exports: {} };\n'
  + source
  + '\nexport const prepare = module.exports.prepare;\n';

if (process.argv.includes('--check')) {
  let existing;
  try { existing = await readFile(target, 'utf8'); } catch { /* Report a missing generated file as stale. */ }
  if (existing !== generated) {
    process.stderr.write('El parser del backend necesita regenerarse: node scripts/build-dedication-backend.mjs\n');
    process.exitCode = 1;
  }
} else {
  await mkdir(new URL('.', target), { recursive: true });
  await writeFile(target, generated);
  process.stdout.write('Parser compartido de dedicatorias preparado.\n');
}
