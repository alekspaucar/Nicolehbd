import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const html = await readFile(join(root, 'index.html'), 'utf8');
const gateScript = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const birthday = new Date(2026, 9, 21, 0, 0, 0).getTime();

function runGate(initialTime) {
  let now = initialTime;
  const classes = new Set();
  const timers = [];
  const events = [];
  class ControlledDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  runInNewContext(gateScript, {
    Date: ControlledDate,
    Event,
    document: { documentElement: { classList: { add: value => classes.add(value) } } },
    window: {
      setTimeout: (callback, delay) => timers.push({ callback, delay }),
      dispatchEvent: event => events.push(event.type),
    },
  });
  return { classes, timers, events, setTime: time => { now = time; } };
}

test('the birthday page stays closed immediately before midnight', () => {
  const gate = runGate(birthday - 1);
  assert.equal(gate.classes.has('unlocked'), false);
  assert.deepEqual(gate.events, []);
  assert.equal(gate.timers[0].delay, 1);
});

test('the birthday page opens at midnight and remains open afterwards', () => {
  for (const time of [birthday, birthday + 86400000]) {
    const gate = runGate(time);
    assert.equal(gate.classes.has('unlocked'), true);
    assert.deepEqual(gate.events, ['birthday-unlocked']);
    assert.equal(gate.timers.length, 0);
  }
});

test('an already open waiting page unlocks without reloading', () => {
  const gate = runGate(birthday - 120000);
  assert.equal(gate.timers[0].delay, 60000);
  gate.setTime(birthday);
  gate.timers[0].callback();
  assert.equal(gate.classes.has('unlocked'), true);
  assert.deepEqual(gate.events, ['birthday-unlocked']);
});

test('every original memory, text and media reaches the album exactly once', async () => {
  const context = { window: {} };
  runInNewContext(await readFile(join(root, 'memories.js'), 'utf8'), context);
  const memories = JSON.parse(JSON.stringify(context.window.MEMORIES));
  const folders = (await readdir(join(root, 'Anis'), { withFileTypes: true })).filter(entry => entry.isDirectory());
  const expected = new Map();
  for (const folder of folders) {
    const files = (await readdir(join(root, 'Anis', folder.name))).filter(file => file !== '.DS_Store');
    const textFiles = files.filter(file => /\.tx?$/i.test(file) || !file.includes('.'));
    assert.equal(textFiles.length, 1);
    const text = (await readFile(join(root, 'Anis', folder.name, textFiles[0]), 'utf8')).trim();
    const sources = files.filter(file => /\.(jpg|jpeg|png|webp|heic|mp4|mov|m4v)$/i.test(file)).map(file => ['Anis', folder.name, file].map(encodeURIComponent).join('/')).sort();
    expected.set(folder.name, { text, sources });
  }
  const expectedSourceCount = [...expected.values()].reduce((count, memory) => count + memory.sources.length, 0);
  assert.equal(memories.length, folders.length);
  assert.equal(expected.size, memories.length);
  const observedSources = new Set();
  let previousKnownDate = '';
  for (const memory of memories) {
    const sourceFolder = decodeURIComponent(memory.media[0].originalSrc.split('/')[1]);
    assert.ok(expected.has(sourceFolder), 'Unknown or duplicated memory');
    const original = expected.get(sourceFolder);
    expected.delete(sourceFolder);
    assert.equal(memory.text, original.text, 'Original text was lost or altered');
    assert.deepEqual(memory.media.map(item => item.originalSrc).sort(), original.sources);
    if (memory.date) {
      assert.ok(memory.date >= previousKnownDate, 'Known dates are out of order');
      previousKnownDate = memory.date;
    }
    for (const media of memory.media) {
      assert.equal(observedSources.has(media.originalSrc), false, 'Duplicated media');
      observedSources.add(media.originalSrc);
      assert.ok((await stat(join(root, media.src))).size > 0);
      assert.ok(media.width > 0 && media.height > 0);
      if (media.type === 'video') assert.ok((await stat(join(root, media.poster))).size > 0);
    }
  }
  assert.equal(expected.size, 0);
  assert.equal(observedSources.size, expectedSourceCount);
});
