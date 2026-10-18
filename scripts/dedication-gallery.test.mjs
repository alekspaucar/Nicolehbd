import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const DedicationStore = require('../dedication-store.js');
const SongDedication = require('../dedication.js');
const source = await readFile(new URL('../dedication-gallery.js', import.meta.url), 'utf8');
const video = 'https://youtube.com/watch?v=wAPCSnAhhC8';
const spotify = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';

class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.value = '';
    this.textContent = '';
    this.disabled = false;
    this.hidden = false;
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  querySelector(selector) {
    assert.match(selector, /^button(?:\[type="submit"\])?$/);
    return this.button;
  }
  focus() {}
  submit() { return this.listeners.get('submit')({ preventDefault() {} }); }
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function record(overrides = {}) {
  return {
    id: 'song-1', createdAt: '2026-10-18T12:00:00.000Z',
    url: video, message: 'Primera canción', direction: 'to-anis',
    ...overrides,
  };
}

async function gallery(initial = []) {
  const elements = Object.fromEntries([
    'dedication-form', 'dedication-url', 'dedication-message', 'dedication-direction',
    'dedication-status', 'saved-dedications', 'dedications-empty',
    'dedication-storage-note', 'dedication-access', 'dedication-access-key',
  ].map(id => [id, new Element()]));
  const form = elements['dedication-form'];
  form.button = new Element('button');
  elements['dedication-access'].button = new Element('button');
  const pending = deferred();
  const started = deferred();
  let posts = 0;
  const document = {
    documentElement: { classList: { contains: name => name === 'unlocked' } },
    getElementById: id => elements[id],
    createElement: tag => new Element(tag),
    dispatchEvent() {},
  };
  const window = {
    DedicationStore, SongDedication,
    DEDICATIONS_CONFIG: {
      mode: 'api', endpoint: '/api/dedications',
      fetch: async (_endpoint, options) => {
        if (options.method === 'GET') return { ok: true, json: async () => ({ dedications: initial }) };
        assert.equal(options.method, 'POST');
        posts += 1;
        started.resolve();
        return pending.promise;
      },
    },
    sessionStorage: { getItem: () => 'a'.repeat(32), setItem() {} },
    addEventListener() {},
  };
  runInNewContext(source, { window, document });
  window.DedicationGallery.mount();
  await new Promise(setImmediate);
  assert.equal(form.button.disabled, false, 'The collection must finish loading before a save');
  const url = elements['dedication-url'];
  const message = elements['dedication-message'];
  const direction = elements['dedication-direction'];
  url.value = ' https://youtu.be/wAPCSnAhhC8?si=tracking ';
  message.value = ' Primera canción ';
  direction.value = 'to-anis';
  return {
    form, url, message, direction, elements, started: started.promise,
    posts: () => posts,
    succeed: (saved = record()) => pending.resolve({ ok: true, json: async () => ({ dedication: saved }) }),
    fail: () => pending.resolve({ ok: false, status: 503 }),
    notes: () => elements['saved-dedications'].children.map(card => card.children.find(child => child.className === 'saved-dedication-message')?.textContent),
  };
}

test('a successful save clears the unchanged submitted draft', async () => {
  const view = await gallery();
  const saving = view.form.submit();
  await view.started;
  assert.equal(view.form.button.disabled, true);
  view.succeed();
  await saving;
  assert.equal(view.url.value, '');
  assert.equal(view.message.value, '');
  assert.equal(view.direction.value, 'to-anis');
  assert.equal(view.form.button.disabled, false);
  assert.deepEqual(view.notes(), ['Primera canción']);
});

for (const [field, value] of [['url', spotify], ['message', 'La siguiente canción'], ['direction', 'to-alexander']]) {
  test(`a successful save preserves the draft when its ${field} changes while awaiting the response`, async () => {
    const view = await gallery();
    const saving = view.form.submit();
    await view.started;
    view[field].value = value;
    const nextDraft = [view.url.value, view.message.value, view.direction.value];
    view.succeed();
    await saving;
    assert.deepEqual([view.url.value, view.message.value, view.direction.value], nextDraft);
    assert.deepEqual(view.notes(), ['Primera canción']);
  });
}

test('a failed save preserves the draft and reports that it was not saved', async () => {
  const view = await gallery();
  const draft = [view.url.value, view.message.value, view.direction.value];
  const saving = view.form.submit();
  await view.started;
  view.fail();
  await saving;
  assert.deepEqual([view.url.value, view.message.value, view.direction.value], draft);
  assert.equal(view.form.button.disabled, false);
  assert.match(view.elements['dedication-status'].textContent, /no pudo completar/i);
  assert.deepEqual(view.notes(), []);
});

test('another submit while saving does not create a second dedication', async () => {
  const view = await gallery();
  const saving = view.form.submit();
  await view.started;
  await view.form.submit();
  view.succeed();
  await saving;
  assert.equal(view.posts(), 1);
  assert.deepEqual(view.notes(), ['Primera canción']);
});

test('saving an existing dedication keeps the collection in creation-date order without duplicating it', async () => {
  const older = record();
  const newer = record({ id: 'song-2', createdAt: '2026-10-18T13:00:00.000Z', message: 'Más reciente', url: spotify });
  const view = await gallery([newer, older]);
  assert.deepEqual(view.notes(), ['Más reciente', 'Primera canción']);
  const saving = view.form.submit();
  await view.started;
  view.succeed(older);
  await saving;
  assert.deepEqual(view.notes(), ['Más reciente', 'Primera canción']);
});
