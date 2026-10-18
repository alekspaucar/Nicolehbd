import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const modulePath = new URL('../dedication-store.js', import.meta.url);
const DedicationStore = existsSync(modulePath) ? require('../dedication-store.js') : null;
const key = 'anis-dedications-v1';
const video = 'https://youtube.com/watch?v=wAPCSnAhhC8';
const spotify = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';

function create(options = {}) {
  assert.equal(typeof DedicationStore?.create, 'function', 'The dedication store must expose create');
  return DedicationStore.create(options);
}

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem(name) {
      assert.equal(name, key);
      return value;
    },
    setItem(name, next) {
      assert.equal(name, key);
      value = next;
    },
    value: () => value,
  };
}

function savedRecord(overrides = {}) {
  return {
    id: 'dedication-1',
    createdAt: '2026-10-18T12:00:00.000Z',
    url: video,
    provider: 'youtube',
    embedUrl: 'https://www.youtube.com/embed/wAPCSnAhhC8',
    message: 'Para ti 💛',
    direction: 'to-alexander',
    title: 'Una canción para ti',
    ...overrides,
  };
}

test('browser saves survive a new instance and cannot retain an untrusted player URL', async () => {
  const storage = memoryStorage();
  const store = create({ storage, now: () => new Date('2026-10-18T12:00:00.000Z'), makeId: () => 'dedication-1' });
  assert.equal(store.mode, 'browser');
  assert.deepEqual(await store.list(), []);
  const result = await store.save({ url: ' https://youtu.be/wAPCSnAhhC8?si=tracking ', message: ' Para ti 💛 ', direction: 'to-alexander', embedUrl: 'javascript:alert(1)' });
  assert.equal(result.id, 'dedication-1');
  assert.equal(result.createdAt, '2026-10-18T12:00:00.000Z');
  assert.equal(result.url, video);
  assert.equal(result.message, 'Para ti 💛');
  assert.equal(result.provider, 'youtube');
  assert.equal(result.embedUrl, 'https://www.youtube.com/embed/wAPCSnAhhC8');
  assert.deepEqual(await create({ storage }).list(), [result]);
  assert.deepEqual(JSON.parse(storage.value()), [result]);
});

test('equivalent canonical dedications return the existing record without another write', async () => {
  const storage = memoryStorage();
  const store = create({ storage });
  const original = await store.save({ url: 'https://youtu.be/wAPCSnAhhC8', message: ' Mi canción ', direction: 'to-anis' });
  storage.setItem = () => assert.fail('A duplicate must not perform another write');
  const duplicate = await store.save({ url: `${video}&utm_source=copy`, message: 'Mi canción', direction: 'to-anis' });
  assert.deepEqual(duplicate, original);
  assert.equal((await store.list()).length, 1);
});

test('different directions and messages remain distinct and list newest first', async () => {
  const dates = ['2026-10-18T12:00:00.000Z', '2026-10-18T12:01:00.000Z', '2026-10-18T12:02:00.000Z'];
  let sequence = 0;
  const storage = memoryStorage();
  const store = create({ storage, now: () => new Date(dates[sequence - 1]), makeId: () => `song-${++sequence}` });
  const first = await store.save({ url: video, message: 'Primera', direction: 'to-anis' });
  const second = await store.save({ url: video, message: 'Primera', direction: 'to-alexander' });
  const third = await store.save({ url: video, message: 'Otra', direction: 'to-anis' });
  assert.deepEqual((await store.list()).map(record => record.id), [third.id, second.id, first.id]);
});

test('a failed write rejects the save and keeps the previously persisted dedications', async () => {
  const storage = memoryStorage();
  const store = create({ storage });
  const first = await store.save({ url: video });
  const previous = storage.value();
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  await assert.rejects(store.save({ url: spotify }), /guardar|espacio|almacenamiento/i);
  assert.equal(storage.value(), previous);
  assert.deepEqual(await store.list(), [first]);
});

test('corrupt saved JSON or records stop saving without overwriting recoverable data', async () => {
  for (const initial of ['{broken', '{}', 'null', '[null]', JSON.stringify([savedRecord({ id: '' })]), JSON.stringify([savedRecord({ createdAt: 'yesterday' })]), JSON.stringify([savedRecord({ createdAt: '2026-02-30T12:00:00.000Z' })]), JSON.stringify([savedRecord({ message: undefined })]), JSON.stringify([savedRecord({ direction: undefined })]), JSON.stringify([savedRecord({ url: 'https://evil.example/song' })])]) {
    const storage = memoryStorage(initial);
    const store = create({ storage });
    await assert.rejects(store.list(), /guardad|datos|leer/i);
    await assert.rejects(store.save({ url: spotify }), /guardad|datos|leer/i);
    assert.equal(storage.value(), initial);
  }
});

test('stored content is reparsed while its valid identity and creation date remain intact', async () => {
  const storage = memoryStorage(JSON.stringify([savedRecord({ provider: 'evil', embedUrl: 'https://evil.example/frame', title: '<script>alert(1)</script>' })]));
  const [record] = await create({ storage }).list();
  assert.equal(record.id, 'dedication-1');
  assert.equal(record.createdAt, '2026-10-18T12:00:00.000Z');
  assert.equal(record.provider, 'youtube');
  assert.equal(record.embedUrl, 'https://www.youtube.com/embed/wAPCSnAhhC8');
  assert.notEqual(record.title, '<script>alert(1)</script>');
});

test('the record limit rejects a new dedication without dropping existing entries', async () => {
  const records = Array.from({ length: 500 }, (_, index) => savedRecord({ id: `song-${index}`, message: `Nota ${index}` }));
  const initial = JSON.stringify(records);
  const storage = memoryStorage(initial);
  const store = create({ storage });
  assert.equal((await store.list()).length, 500);
  await assert.rejects(store.save({ url: spotify }), /500|límite/i);
  assert.equal(storage.value(), initial);
  assert.equal((await store.save({ url: video, message: 'Nota 0', direction: 'to-alexander' })).id, 'song-0');
});

test('an oversized browser collection is preserved and blocks further writes', async () => {
  const records = Array.from({ length: 501 }, (_, index) => savedRecord({ id: `song-${index}`, message: `Nota ${index}` }));
  const initial = JSON.stringify(records);
  const storage = memoryStorage(initial);
  const store = create({ storage });
  await assert.rejects(store.list(), /guardad|datos|leer/i);
  await assert.rejects(store.save({ url: spotify }), /guardad|datos|leer/i);
  assert.equal(storage.value(), initial);
});

test('loading the browser module and constructing the store defer storage and network access', async () => {
  if (!existsSync(modulePath)) assert.fail('The dedication store browser module must exist');
  const source = await readFile(modulePath, 'utf8');
  const window = {
    get localStorage() { throw new Error('blocked'); },
    fetch: () => assert.fail('Loading a store must not request data'),
    open: () => assert.fail('A store must not open a sharing window'),
    navigator: { share: () => assert.fail('A store must not share') },
  };
  runInNewContext(source, { window, URL, Date });
  const store = window.DedicationStore.create();
  await assert.rejects(store.list(), /almacenamiento|navegador/i);
  await assert.rejects(store.save({ url: video }), /almacenamiento|navegador/i);
});

test('API mode sends canonical input and validates the saved response without local persistence', async () => {
  const requests = [];
  const store = create({
    mode: 'api', endpoint: '/api/dedications',
    storage: { getItem: () => assert.fail('API mode must not read browser storage'), setItem: () => assert.fail('API mode must not write browser storage') },
    fetch: async (endpoint, options) => {
      requests.push({ endpoint, options });
      return { ok: true, json: async () => options.method === 'POST' ? { dedication: savedRecord() } : { dedications: [savedRecord()] } };
    },
  });
  assert.equal(store.mode, 'api');
  assert.equal(requests.length, 0);
  const record = await store.save({ url: 'https://youtu.be/wAPCSnAhhC8?si=tracking', message: ' Para ti 💛 ', direction: 'to-alexander', embedUrl: 'javascript:alert(1)' });
  assert.equal(record.url, video);
  assert.deepEqual(await store.list(), [record]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].endpoint, '/api/dedications');
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].options.body), { url: video, message: 'Para ti 💛', direction: 'to-alexander' });
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.equal(requests[1].options.method, 'GET');
  for (const { options } of requests) {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
  }
});

test('API failures and malformed responses reject without falling back to local storage', async () => {
  for (const fetch of [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false, status: 503, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => { throw new Error('bad JSON'); } }),
    async () => ({ ok: true, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => ({ dedications: [savedRecord({ id: '' })], dedication: savedRecord({ createdAt: 'bad' }) }) }),
  ]) {
    const store = create({ mode: 'api', endpoint: 'https://dedications.example/api', fetch, storage: { getItem: () => assert.fail('No browser fallback'), setItem: () => assert.fail('No browser fallback') } });
    await assert.rejects(store.list(), /conexión|servicio|respuesta|dedicatoria/i);
    await assert.rejects(store.save({ url: video }), /conexión|servicio|respuesta|dedicatoria/i);
  }
});

test('API collections can exceed the browser record cap and retain every canonical song newest first', async () => {
  const records = Array.from({ length: 1001 }, (_, index) => savedRecord({
    id: `song-${index}`,
    message: `Nota ${index}`,
    createdAt: new Date(Date.UTC(2026, 9, 18, 12, 0, index)).toISOString(),
    embedUrl: 'https://evil.example/frame',
  }));
  const store = create({ mode: 'api', endpoint: '/api/dedications', fetch: async () => ({ ok: true, json: async () => ({ dedications: records }) }) });
  const listed = await store.list();
  assert.equal(listed.length, 1001);
  assert.equal(listed[0].id, 'song-1000');
  assert.equal(listed.at(-1).id, 'song-0');
  assert.equal(new Set(listed.map(record => record.id)).size, 1001);
  assert.ok(listed.every(record => record.embedUrl === 'https://www.youtube.com/embed/wAPCSnAhhC8'));
});

test('API configuration rejects unsafe endpoint forms before any request', () => {
  for (const endpoint of [undefined, '', 'api/dedications', '//evil.example/api', '/\\evil.example/api', 'http://example.com/api', 'javascript:alert(1)', 'https://user:password@example.com/api', 'https://example.com/api#fragment', '/api\n/dedications']) {
    assert.throws(() => create({ mode: 'api', endpoint }), /dirección|HTTPS|servicio|ruta/i, String(endpoint));
  }
  assert.throws(() => create({ mode: 'unknown' }), /modo/i);
});

test('API headers resolve only when requested and use the latest in-memory collection key', async () => {
  let collectionKey = 'first-key';
  let headerReads = 0;
  const requests = [];
  const store = create({
    mode: 'api', endpoint: '/api/dedications',
    headers: () => { headerReads += 1; return { 'x-collection-key': collectionKey, 'content-type': 'text/plain' }; },
    fetch: async (_endpoint, options) => {
      requests.push(options);
      return { ok: true, json: async () => options.method === 'POST' ? { dedication: savedRecord({ message: '' }) } : { dedications: [] } };
    },
  });
  assert.equal(headerReads, 0);
  await store.list();
  collectionKey = 'updated-key';
  await store.save({ url: video });
  assert.equal(headerReads, 2);
  assert.equal(requests[0].headers['x-collection-key'], 'first-key');
  assert.equal(requests[1].headers['x-collection-key'], 'updated-key');
  assert.equal(requests[1].headers['Content-Type'], 'application/json');
  assert.equal(requests[1].headers['content-type'], undefined);
  assert.equal(requests[1].body.includes('updated-key'), false);
});

test('API accepts header objects and rejects injection before issuing a request', async () => {
  const store = create({ mode: 'api', endpoint: '/api/dedications', headers: { 'x-collection-key': 'shared-key' }, fetch: async (_endpoint, options) => {
    assert.equal(options.headers['x-collection-key'], 'shared-key');
    return { ok: true, json: async () => ({ dedications: [] }) };
  } });
  assert.deepEqual(await store.list(), []);
  for (const headers of [{ 'x-collection-key': 'secret\r\nx-other: injected' }, { 'bad\nname': 'value' }, ['not', 'headers'], () => null]) {
    const unsafe = create({ mode: 'api', endpoint: '/api/dedications', headers, fetch: () => assert.fail('Invalid headers must not be sent') });
    await assert.rejects(unsafe.list(), /cabecera|acceso|configur/i);
  }
});

test('API authentication failures request a collection key without reporting a saved dedication', async () => {
  for (const status of [401, 403]) {
    const store = create({ mode: 'api', endpoint: '/api/dedications', fetch: async () => ({ ok: false, status }) });
    for (const action of [() => store.list(), () => store.save({ url: video })]) {
      await assert.rejects(action(), error => error.code === 'AUTH_REQUIRED' && error.message === 'Introduce la clave de nuestra colección para ver y guardar las canciones.');
    }
  }
});
