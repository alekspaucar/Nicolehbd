import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import DedicationStore from '../dedication-store.js';
import { createHandler } from '../supabase/functions/dedications/handler.mjs';

const collectionKey = 'fixture-private-collection-key-with-more-than-32-bytes';
const origin = 'https://alekspaucar.github.io';
const environment = {
  SUPABASE_URL: 'https://dedications-fixture.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-server-only-service-role',
  DEDICATIONS_KEY_SHA256: createHash('sha256').update(collectionKey).digest('hex'),
  DEDICATIONS_ALLOWED_ORIGINS: `${origin},http://localhost:4173,http://localhost:4174`,
};
const song = {
  url: 'https://music.youtube.com/watch?v=wAPCSnAhhC8&si=shared',
  message: '  Me recuerda a nosotros.  ',
  direction: 'to-anis',
};

function request(method = 'GET', payload, overrides = {}) {
  const headers = new Headers({ origin, 'x-collection-key': collectionKey });
  if (payload !== undefined) headers.set('content-type', 'application/json');
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(name);
    else headers.set(name, value);
  }
  return new Request('https://dedications-fixture.supabase.co/functions/v1/dedications', {
    method,
    headers,
    ...(payload === undefined ? {} : { body: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
  });
}

// This replaces only the remote HTTP storage boundary. Requests, validation,
// canonicalization, hashing, authentication and response generation stay real.
function storage(initial = [], { fail = false, secretKey = environment.SUPABASE_SERVICE_ROLE_KEY, modernKey = false } = {}) {
  const rows = initial.map((row) => ({ ...row }));
  let visits = 0;
  const fetch = async (input, options) => {
    visits += 1;
    const upstream = new Request(input, options);
    const url = new URL(upstream.url);
    const headers = upstream.headers;
    if (fail) return Response.json({ message: 'private database detail', key: secretKey }, { status: 500 });
    if (url.origin !== environment.SUPABASE_URL || url.pathname !== '/rest/v1/song_dedications'
      || headers.get('apikey') !== secretKey
      || (!modernKey && headers.get('authorization') !== `Bearer ${secretKey}`)
      || (modernKey && headers.has('authorization'))
      || url.searchParams.get('select') !== 'id::text,created_at,url,message,direction') {
      return Response.json({ message: 'incorrect storage request' }, { status: 400 });
    }
    if (upstream.method === 'GET') {
      const fingerprint = url.searchParams.get('fingerprint');
      let found = fingerprint ? rows.filter((row) => `eq.${row.fingerprint}` === fingerprint) : [...rows];
      if (url.searchParams.get('order') === 'created_at.desc,id.desc') {
        found.sort((a, b) => b.created_at.localeCompare(a.created_at) || Number(BigInt(b.id) - BigInt(a.id)));
      }
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Number(url.searchParams.get('limit') || found.length);
      found = found.slice(offset, offset + limit);
      return Response.json(found);
    }
    if (upstream.method === 'POST') {
      const payload = await upstream.json();
      if (Object.keys(payload).sort().join(',') !== 'direction,fingerprint,message,url'
        || !/^[a-f0-9]{64}$/.test(payload.fingerprint)
        || headers.get('prefer') !== 'return=representation') {
        return Response.json({ message: 'invalid persisted fields' }, { status: 400 });
      }
      if (rows.some((row) => row.fingerprint === payload.fingerprint)) {
        return Response.json({ code: '23505', message: 'private constraint detail' }, { status: 409 });
      }
      const row = { id: String(rows.length + 1), created_at: '2026-10-18T12:00:00.000Z', ...payload };
      rows.push(row);
      return Response.json([row], { status: 201 });
    }
    return new Response(null, { status: 405 });
  };
  return { fetch, rows, get visits() { return visits; } };
}

function app(database, env = environment) {
  return createHandler({ env: (name) => env[name], fetch: database.fetch });
}

test('missing, wrong and short collection keys are rejected before storage is contacted', async () => {
  const database = storage();
  const handler = app(database);
  for (const key of [null, 'wrong-key-that-is-long-enough-to-be-checked', 'short']) {
    for (const method of ['GET', 'POST']) {
      const response = await handler(request(method, method === 'POST' ? song : undefined, { 'x-collection-key': key }));
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal(typeof (await response.json()).error, 'string');
    }
  }
  assert.equal(database.visits, 0);
});

test('a public collection reads and saves without sending a collection key', async () => {
  const database = storage();
  const publicEnvironment = { ...environment, DEDICATIONS_PUBLIC: 'true' };
  const handler = app(database, publicEnvironment);
  const read = await handler(request('GET', undefined, { 'x-collection-key': null }));
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), { dedications: [] });

  const saved = await handler(request('POST', song, { 'x-collection-key': null }));
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).dedication.direction, 'to-anis');
  assert.equal(database.rows.length, 1);
});

test('only exact allowed origins can reach the collection', async () => {
  const database = storage();
  const handler = app(database);
  for (const candidate of [null, 'null', 'https://alekspaucar.github.io.evil.test', 'https://alekspaucar.github.io/other', 'http://localhost:9999']) {
    const response = await handler(request('GET', undefined, { origin: candidate }));
    assert.equal(response.status, 403, String(candidate));
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(database.visits, 0);
  const allowed = await handler(request('GET', undefined, { origin: 'http://localhost:4174' }));
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:4174');
});

test('allowed browser preflights work without a collection key and restrict methods and headers', async () => {
  const database = storage();
  const handler = app(database);
  const preflight = { 'x-collection-key': null, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-collection-key' };
  const response = await handler(request('OPTIONS', undefined, preflight));
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-headers'), 'content-type, x-collection-key');
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
  for (const invalid of [
    { 'access-control-request-method': 'DELETE' },
    { 'access-control-request-headers': 'content-type,authorization' },
    { origin: 'https://unrelated.test' },
  ]) {
    assert.equal((await handler(request('OPTIONS', undefined, { ...preflight, ...invalid }))).status, 403);
  }
  assert.equal(database.visits, 0);
});

test('missing or unsafe backend configuration fails closed without contacting storage', async () => {
  const database = storage();
  for (const [name, value] of [
    ['SUPABASE_URL', undefined],
    ['SUPABASE_SERVICE_ROLE_KEY', undefined],
    ['DEDICATIONS_KEY_SHA256', 'not-a-digest'],
    ['DEDICATIONS_ALLOWED_ORIGINS', '*'],
    ['DEDICATIONS_ALLOWED_ORIGINS', 'https://alekspaucar.github.io/'],
  ]) {
    const response = await app(database, { ...environment, [name]: value })(request());
    assert.equal(response.status, 503, name);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.equal(database.visits, 0);
});

test('saved rows return canonical safe players, string IDs and creation dates without private fields', async () => {
  const database = storage([{
    id: '9007199254740993',
    created_at: '2026-10-18T12:34:56.000Z',
    url: 'https://youtu.be/wAPCSnAhhC8?si=old',
    message: 'Para ti',
    direction: 'to-alexander',
    fingerprint: 'a'.repeat(64),
    embedUrl: 'https://untrusted.test/player',
  }]);
  const response = await app(database)(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { dedications: [{
    id: '9007199254740993',
    createdAt: '2026-10-18T12:34:56.000Z',
    url: 'https://youtube.com/watch?v=wAPCSnAhhC8',
    provider: 'youtube',
    embedUrl: 'https://www.youtube.com/embed/wAPCSnAhhC8',
    message: 'Para ti',
    direction: 'to-alexander',
    title: 'Una canción de YouTube',
  }] });
});

test('the full collection is read across the storage API page limit', async () => {
  const fixtures = Array.from({ length: 1001 }, (_, index) => ({
    id: String(index + 1), created_at: '2026-10-18T12:34:56.000Z',
    url: 'https://youtu.be/wAPCSnAhhC8', message: `Dedicatoria ${index + 1}`,
    direction: 'to-anis', fingerprint: index.toString(16).padStart(64, '0'),
  }));
  const response = await app(storage(fixtures))(request());
  const { dedications } = await response.json();
  assert.equal(response.status, 200);
  assert.equal(dedications.length, 1001);
  assert.equal(dedications[0].id, '1001');
  assert.equal(dedications.at(-1).id, '1');
});

test('a valid POST persists only canonical fields and returns the created dedication', async () => {
  const database = storage();
  const response = await app(database)(request('POST', { ...song, embedUrl: 'https://untrusted.test/embed' }));
  assert.equal(response.status, 201);
  const { dedication } = await response.json();
  assert.equal(dedication.id, '1');
  assert.equal(dedication.createdAt, '2026-10-18T12:00:00.000Z');
  assert.equal(dedication.url, 'https://youtube.com/watch?v=wAPCSnAhhC8');
  assert.equal(dedication.message, 'Me recuerda a nosotros.');
  assert.equal(dedication.embedUrl, 'https://www.youtube.com/embed/wAPCSnAhhC8');
  assert.equal(database.rows.length, 1);
  assert.deepEqual(Object.keys(database.rows[0]).sort(), ['created_at', 'direction', 'fingerprint', 'id', 'message', 'url']);
  assert.equal(database.rows[0].url, 'https://youtube.com/watch?v=wAPCSnAhhC8');
  assert.equal(database.rows[0].message, 'Me recuerda a nosotros.');
});

test('canonical duplicates reuse a stored record while another message or recipient creates a record', async () => {
  const database = storage();
  const handler = app(database);
  const first = await (await handler(request('POST', song))).json();
  const repeated = await handler(request('POST', { ...song, url: 'https://youtu.be/wAPCSnAhhC8?utm_source=copy', message: 'Me recuerda a nosotros.' }));
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), first);
  await handler(request('POST', { ...song, message: 'Otra dedicatoria' }));
  await handler(request('POST', { ...song, direction: 'to-alexander' }));
  assert.equal(database.rows.length, 3);
  const { dedications } = await (await handler(request())).json();
  assert.equal(dedications.length, 3);
});

test('simultaneous duplicate submissions return the one saved record', async () => {
  const database = storage();
  const handler = app(database);
  const responses = await Promise.all([handler(request('POST', song)), handler(request('POST', song))]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
  assert.deepEqual(await responses[0].json(), await responses[1].json());
  assert.equal(database.rows.length, 1);
});

test('invalid song payloads are rejected before any storage operation', async () => {
  const database = storage();
  const handler = app(database);
  for (const payload of [
    'not-json', null, [], '42', {}, { ...song, direction: 'anyone' },
    { ...song, url: 'https://untrusted.test/song' },
    { ...song, url: 'https://youtube.com/playlist?list=abc' },
    { ...song, url: 'https://youtu.be/wAPCSnAhhC8?tracking=' + 'a'.repeat(2048) },
    { ...song, message: 'a'.repeat(1001) }, { ...song, message: 123 },
  ]) {
    const response = await handler(request('POST', payload));
    assert.equal(response.status, 400, JSON.stringify(payload).slice(0, 80));
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.equal(database.visits, 0);
});

test('oversize JSON is rejected by real bytes including streamed bodies with no content length', async () => {
  const database = storage();
  const handler = app(database);
  const response = await handler(request('POST', { ...song, ignored: '🎵'.repeat(5000) }));
  assert.equal(response.status, 413);
  const advertised = await handler(request('POST', song, { 'content-length': '20000' }));
  assert.equal(advertised.status, 413);
  assert.equal(database.visits, 0);
});

test('unsupported methods and non-JSON posts cannot reach storage', async () => {
  const database = storage();
  const handler = app(database);
  const method = await handler(request('DELETE'));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'GET, POST, OPTIONS');
  assert.equal((await handler(request('POST', song, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal(database.visits, 0);
});

test('storage failures and corrupt saved data return Spanish errors without upstream details or keys', async () => {
  for (const database of [storage([], { fail: true }), { fetch: async () => { throw new Error('private database host'); } }, { fetch: async () => Response.json({ unexpected: 'shape' }) }, storage([{ id: '1', created_at: 'invalid', url: song.url, message: '', direction: 'to-anis' }])]) {
    const response = await app(database)(request());
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.match(body, /dedicatorias/);
    assert.doesNotMatch(body, /private|fixture|SUPABASE|secret|host|shape/);
  }
  const failedPost = await app(storage([], { fail: true }))(request('POST', song));
  assert.equal(failedPost.status, 502);
});

test('the modern server-only default secret key can authenticate storage without a JWT bearer header', async () => {
  const modernSecret = 'sb_secret_fixture_server_only';
  const database = storage([], { secretKey: modernSecret, modernKey: true });
  const handler = app(database, {
    ...environment,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: modernSecret }),
  });
  assert.equal((await handler(request('POST', song))).status, 201);
  const { dedications } = await (await handler(request())).json();
  assert.equal(dedications.length, 1);
});

test('the real API client saves and reloads a server record while wrong keys request authentication without touching storage', async () => {
  const database = storage();
  const handler = app(database);
  const clientFetch = (input, options) => {
    const headers = new Headers(options.headers);
    // Browsers add Origin themselves; this adapter supplies it in Node.
    headers.set('origin', origin);
    return handler(new Request(input, { ...options, headers }));
  };
  const client = (key = collectionKey) => DedicationStore.create({
    mode: 'api',
    endpoint: `${environment.SUPABASE_URL}/functions/v1/dedications`,
    headers: () => ({ 'x-collection-key': key }),
    fetch: clientFetch,
  });

  const saved = await client().save(song);
  assert.deepEqual(saved, {
    id: '1',
    createdAt: '2026-10-18T12:00:00.000Z',
    url: 'https://youtube.com/watch?v=wAPCSnAhhC8',
    provider: 'youtube',
    embedUrl: 'https://www.youtube.com/embed/wAPCSnAhhC8',
    message: 'Me recuerda a nosotros.',
    direction: 'to-anis',
    title: 'Una canción de YouTube',
  });
  assert.deepEqual(await client().list(), [saved]);
  assert.equal(database.rows.length, 1);

  const visitsBeforeUnauthorizedRequests = database.visits;
  const unauthorized = client('wrong-collection-key-that-still-exceeds-32-bytes');
  await assert.rejects(unauthorized.list(), { code: 'AUTH_REQUIRED' });
  await assert.rejects(unauthorized.save(song), { code: 'AUTH_REQUIRED' });
  assert.equal(database.visits, visitsBeforeUnauthorizedRequests);
  assert.equal(database.rows.length, 1);
});
