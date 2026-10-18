#!/usr/bin/env node

import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = path.join(root, 'Anis');
const requireMedia = process.argv.includes('--require-media');
const allowedArguments = new Set(['--require-media']);
const unknownArguments = process.argv.slice(2).filter((value) => !allowedArguments.has(value));
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);
const videoExtensions = new Set(['.mp4', '.mov', '.m4v']);
const sections = new Set(['Antes de todo', 'Los primeros recuerdos', 'Volver a encontrarnos', 'Lo cotidiano contigo']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function slugify(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function encodePath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

function mediaType(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (imageExtensions.has(extension)) return 'image';
  if (videoExtensions.has(extension)) return 'video';
  return null;
}

async function readJson(filename) {
  return JSON.parse(await readFile(path.join(root, filename), 'utf8'));
}

async function fileExists(filename) {
  try {
    return (await stat(path.join(root, filename))).isFile();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function validateMetadata(folder, metadata, expectedOrder) {
  assert(metadata && typeof metadata === 'object' && !Array.isArray(metadata), `Invalid metadata for ${JSON.stringify(folder)}`);
  assert(metadata.order === expectedOrder, `Orders must be unique and consecutive; expected ${expectedOrder} for ${JSON.stringify(folder)}`);
  assert(typeof metadata.title === 'string' && metadata.title.trim(), `Missing title for ${JSON.stringify(folder)}`);
  assert(sections.has(metadata.section), `Unknown section for ${JSON.stringify(folder)}`);
  assert(metadata.year === null || (Number.isInteger(metadata.year) && metadata.year >= 1900 && metadata.year <= 2100), `Invalid year for ${JSON.stringify(folder)}`);
  assert(metadata.date === null || (typeof metadata.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(metadata.date)), `Invalid date for ${JSON.stringify(folder)}`);
  if (metadata.date !== null) {
    const parsed = new Date(`${metadata.date}T12:00:00Z`);
    assert(!Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === metadata.date, `Impossible date for ${JSON.stringify(folder)}`);
    assert(Number(metadata.date.slice(0, 4)) === metadata.year, `Date and year disagree for ${JSON.stringify(folder)}`);
    assert(['original-text', 'source-media'].includes(metadata.dateSource), `Missing date provenance for ${JSON.stringify(folder)}`);
  }
}

async function main() {
  assert(unknownArguments.length === 0, `Unknown arguments: ${unknownArguments.join(', ')}`);
  const order = await readJson('data/memory-order.json');
  let manifest = {};
  try {
    manifest = await readJson('media/manifest.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    assert(!requireMedia, 'media/manifest.json is required for --require-media');
  }

  const rootEntries = (await readdir(sourceRoot, { withFileTypes: true })).filter((entry) => entry.name !== '.DS_Store');
  assert(rootEntries.every((entry) => entry.isDirectory()), 'Anis contains an unexpected top-level file or symbolic link');
  const folders = rootEntries.map((entry) => entry.name).sort();
  const metadataFolders = Object.keys(order).sort();
  assert(JSON.stringify(folders) === JSON.stringify(metadataFolders), 'Source folders and data/memory-order.json keys differ');

  const orderedFolders = folders.sort((left, right) => order[left].order - order[right].order);
  const ids = new Set();
  const assetPaths = new Set();
  const memories = [];
  let imageCount = 0;
  let videoCount = 0;
  let missingDimensions = 0;
  let previousKnownDate = null;

  for (const [position, folder] of orderedFolders.entries()) {
    const metadata = order[folder];
    validateMetadata(folder, metadata, position + 1);
    if (metadata.date !== null) {
      assert(previousKnownDate === null || metadata.date >= previousKnownDate, `Known dates are out of chronological order at ${JSON.stringify(folder)}`);
      previousKnownDate = metadata.date;
    }
    const id = slugify(folder);
    assert(id && !ids.has(id), `Empty or duplicate slug for ${JSON.stringify(folder)}`);
    ids.add(id);

    const entries = (await readdir(path.join(sourceRoot, folder), { withFileTypes: true })).filter((entry) => entry.name !== '.DS_Store');
    assert(entries.every((entry) => entry.isFile()), `Unexpected directory or symbolic link in ${JSON.stringify(folder)}`);
    const files = entries.map((entry) => entry.name).sort();
    const textFiles = files.filter((filename) => path.extname(filename) === '');
    const mediaFiles = files.filter((filename) => mediaType(filename));
    const unexpected = files.filter((filename) => !textFiles.includes(filename) && !mediaFiles.includes(filename));
    assert(unexpected.length === 0, `Unexpected files in ${JSON.stringify(folder)}: ${unexpected.map(JSON.stringify).join(', ')}`);
    assert(textFiles.length === 1, `Expected exactly one original text in ${JSON.stringify(folder)}, found ${textFiles.length}`);
    assert(mediaFiles.length > 0, `No media in ${JSON.stringify(folder)}`);

    const text = (await readFile(path.join(sourceRoot, folder, textFiles[0]), 'utf8')).trim();
    const media = [];
    for (const [index, filename] of mediaFiles.entries()) {
      const type = mediaType(filename);
      const src = `media/${id}-${index + 1}.${type === 'video' ? 'mp4' : 'jpg'}`;
      assert(!assetPaths.has(src), `Duplicate output media path: ${src}`);
      assetPaths.add(src);
      const dimensions = manifest[src];
      const width = Number.isInteger(dimensions?.width) && dimensions.width > 0 ? dimensions.width : null;
      const height = Number.isInteger(dimensions?.height) && dimensions.height > 0 ? dimensions.height : null;
      const entry = { src, originalSrc: encodePath(`Anis/${folder}/${filename}`), type, width, height };
      if (type === 'video' && typeof dimensions?.poster === 'string') {
        assert(/^media\/[a-z0-9-]+-poster\.jpg$/.test(dimensions.poster), `Unsafe poster path for ${src}`);
        entry.poster = dimensions.poster;
      }
      if (width === null || height === null) missingDimensions++;
      if (requireMedia) {
        assert(dimensions?.type === type, `Missing or mismatched manifest entry for ${src}`);
        assert(width !== null && height !== null, `Missing dimensions for ${src}`);
        assert(await fileExists(src), `Missing optimized asset: ${src}`);
        if (type === 'video') {
          assert(entry.poster && await fileExists(entry.poster), `Missing video poster for ${src}`);
        }
      }
      media.push(entry);
      if (type === 'image') imageCount++;
      else videoCount++;
    }

    memories.push({
      id,
      title: metadata.title,
      text,
      year: metadata.year,
      date: metadata.date,
      dateSource: metadata.dateSource ?? null,
      section: metadata.section,
      media,
    });
  }

  const generated = `// Generated by scripts/build-memories.mjs. Original copy comes from Anis/.\n// Edit data/memory-order.json to adjust titles, documented dates, and narrative order.\nwindow.MEMORIES = ${JSON.stringify(memories, null, 2)};\n`;
  await writeFile(path.join(root, 'memories.js'), generated);
  console.log(`Generated ${memories.length} memories with ${imageCount + videoCount} media (${imageCount} images, ${videoCount} videos).`);
  if (missingDimensions) console.log(`${missingDimensions} assets await a media manifest with dimensions.`);
  if (requireMedia) console.log('Verified all optimized media, dimensions, and video posters.');
}

main().catch((error) => {
  console.error(`Memory catalog build failed: ${error.message}`);
  process.exitCode = 1;
});
