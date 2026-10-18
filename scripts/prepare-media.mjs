#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// macOS only. Derivative media is reproducible; original Anis files are never edited.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'Anis');
const outputRoot = path.join(root, 'media');
const temporary = mkdtempSync(path.join(tmpdir(), 'anahi-media-'));
const helper = path.join(temporary, 'media-tool');
const slug = (name) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

mkdirSync(outputRoot, { recursive: true });
run('/usr/bin/swiftc', ['-parse-as-library', path.join(root, 'scripts/media-tool.swift'), '-o', helper, '-module-cache-path', path.join(temporary, 'module-cache')]);
const sources = [];
const slugs = new Set();
for (const folder of readdirSync(sourceRoot).sort()) {
  const directory = path.join(sourceRoot, folder);
  if (!statSync(directory).isDirectory()) continue;
  const name = slug(folder);
  if (!name || slugs.has(name)) throw new Error(`Duplicate or empty folder slug: ${name}`);
  slugs.add(name);
  const files = readdirSync(directory).filter((file) => /\.(png|jpe?g|mp4)$/i.test(file)).sort();
  for (const [index, file] of files.entries()) {
    const source = path.join(directory, file);
    const type = /\.mp4$/i.test(file) ? 'video' : 'image';
    const basename = `${name}-${index + 1}`;
    sources.push({ source, type, basename, bytes: statSync(source).size, hash: hash(source) });
  }
}
const videos = sources.filter((item) => item.type === 'video');
const sourceVideoMetadata = JSON.parse(run(helper, ['inspect', ...videos.map((item) => item.source)]));
const manifest = {};
for (const item of sources) {
  const output = `media/${item.basename}.${item.type === 'video' ? 'mp4' : 'jpg'}`;
  const target = path.join(root, output);
  let metadata;
  if (item.type === 'image') {
    metadata = JSON.parse(run(helper, ['image', item.source, target]));
    metadata.codec = 'jpeg';
  } else {
    run('/usr/bin/avconvert', ['--source', item.source, '--preset', 'Preset1280x720', '--output', target, '--replace']);
    metadata = JSON.parse(run(helper, ['inspect', target]))[target];
    const original = sourceVideoMetadata[item.source];
    if (metadata.codec !== 'avc1') throw new Error(`Expected H.264: ${output}`);
    if (metadata.audioTracks && metadata.audioCodec.trim() !== 'aac') throw new Error(`Expected AAC: ${output}`);
    if (Math.abs(metadata.duration - original.duration) > 0.2) throw new Error(`Duration changed: ${output}`);
    const poster = `media/${item.basename}-poster.jpg`;
    const posterMetadata = JSON.parse(run(helper, ['poster', target, path.join(root, poster)]));
    metadata.poster = poster;
    metadata.posterWidth = posterMetadata.width;
    metadata.posterHeight = posterMetadata.height;
    metadata.posterBytes = statSync(path.join(root, poster)).size;
    metadata.sourceCodec = original.codec;
    metadata.sourceAudioCodec = original.audioCodec ?? null;
  }
  manifest[output] = { type: item.type, ...metadata, bytes: statSync(target).size };
  console.log(`${Object.keys(manifest).length}/${sources.length} ${output}`);
}

for (const item of sources) {
  if (statSync(item.source).size !== item.bytes || hash(item.source) !== item.hash) {
    throw new Error('An original media file changed during preparation.');
  }
}
writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const sourceBytes = sources.reduce((sum, item) => sum + item.bytes, 0);
const outputBytes = Object.values(manifest).reduce((sum, item) => sum + item.bytes + (item.posterBytes ?? 0), 0);
console.log(JSON.stringify({ sourceFiles: sources.length, sourceFolders: slugs.size, sourceBytes, outputBytes, images: sources.length - videos.length, videos: videos.length, posters: videos.length, originalHashesVerified: true }, null, 2));
