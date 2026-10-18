import { prepare as prepareSong } from './song-parser.mjs';

const MAX_BODY_BYTES = 16 * 1024;
const PAGE_SIZE = 1000;
const SELECT = 'id::text,created_at,url,message,direction';
const METHODS = 'GET, POST, OPTIONS';
const ALLOWED_HEADERS = 'content-type, x-collection-key';
const encoder = new TextEncoder();

function configuration(env) {
  try {
    const projectUrl = new URL(env('SUPABASE_URL'));
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(projectUrl.hostname);
    if ((projectUrl.protocol !== 'https:' && !(projectUrl.protocol === 'http:' && local))
      || projectUrl.username || projectUrl.password || projectUrl.search || projectUrl.hash
      || projectUrl.pathname !== '/') return null;

    const legacyKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const secretKey = legacyKey || JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}').default;
    const expectedHash = env('DEDICATIONS_KEY_SHA256');
    const origins = (env('DEDICATIONS_ALLOWED_ORIGINS') || '').split(',').map((value) => value.trim());
    if (typeof secretKey !== 'string' || !secretKey.trim() || !/^[a-f0-9]{64}$/i.test(expectedHash || '')
      || !origins.length || origins.some((value) => {
        const parsed = new URL(value);
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
        return value !== parsed.origin || (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback));
      })) return null;

    return {
      projectUrl: projectUrl.origin,
      secretKey,
      legacy: Boolean(legacyKey),
      expectedHash: expectedHash.toLowerCase(),
      origins: new Set(origins),
    };
  } catch {
    return null;
  }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function authenticated(key, expectedHash) {
  if (typeof key !== 'string') return false;
  const bytes = encoder.encode(key);
  if (bytes.length < 32 || bytes.length > 512) return false;
  const candidateHash = await sha256(key);
  // Compare all 64 digest characters, without exiting on the first difference.
  let difference = 0;
  for (let index = 0; index < 64; index += 1) {
    difference |= candidateHash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  }
  return difference === 0;
}

async function readPayload(request) {
  const length = request.headers.get('content-length');
  if (length !== null && Number(length) > MAX_BODY_BYTES) return { error: 413 };
  const reader = request.body?.getReader();
  if (!reader) return { error: 400 };
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return { error: 413 };
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)) };
  } catch {
    return { error: 400 };
  } finally {
    reader.releaseLock();
  }
}

export function createHandler({ env, fetch: fetchStorage = globalThis.fetch, prepare = prepareSong }) {
  return async function handle(request) {
    const config = configuration(env);
    const origin = request.headers.get('origin');
    const headers = new Headers({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      vary: 'Origin',
      'x-content-type-options': 'nosniff',
    });
    const respond = (status, value) => new Response(value === undefined ? null : JSON.stringify(value), { status, headers });
    const error = (status, message) => respond(status, { error: message });

    if (!config) return error(503, 'La colección compartida todavía no está configurada.');
    if (!origin || !config.origins.has(origin)) return error(403, 'Este origen no tiene acceso a la colección.');
    headers.set('access-control-allow-origin', origin);

    if (request.method === 'OPTIONS') {
      const method = request.headers.get('access-control-request-method');
      const requestedHeaders = (request.headers.get('access-control-request-headers') || '')
        .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
      if (!['GET', 'POST'].includes(method) || requestedHeaders.some((value) => !['content-type', 'x-collection-key'].includes(value))) {
        return error(403, 'Esta solicitud no tiene acceso a la colección.');
      }
      headers.set('access-control-allow-methods', METHODS);
      headers.set('access-control-allow-headers', ALLOWED_HEADERS);
      headers.set('access-control-max-age', '600');
      headers.set('vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      return respond(204);
    }

    if (!(await authenticated(request.headers.get('x-collection-key'), config.expectedHash))) {
      return error(401, 'La clave de la colección no es correcta.');
    }
    if (!['GET', 'POST'].includes(request.method)) {
      headers.set('allow', METHODS);
      return error(405, 'Usa GET o POST para la colección.');
    }

    const apiHeaders = new Headers({ apikey: config.secretKey, accept: 'application/json' });
    if (config.legacy) apiHeaders.set('authorization', `Bearer ${config.secretKey}`);
    const endpoint = (parameters = {}) => {
      const url = new URL('/rest/v1/song_dedications', config.projectUrl);
      url.searchParams.set('select', SELECT);
      for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, String(value));
      return url;
    };
    const savedRecord = (row) => {
      if (!row || !/^[1-9][0-9]*$/.test(String(row.id))
        || (typeof row.id === 'number' && !Number.isSafeInteger(row.id))
        || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))
        || typeof row.url !== 'string' || row.url.length > 2048
        || typeof row.message !== 'string' || typeof row.direction !== 'string') throw new Error('Invalid saved record');
      return { id: String(row.id), createdAt: row.created_at, ...prepare(row.url, row.message, row.direction) };
    };

    try {
      if (request.method === 'GET') {
        const dedications = [];
        let offset = 0;
        while (true) {
          const response = await fetchStorage(endpoint({ order: 'created_at.desc,id.desc', limit: PAGE_SIZE, offset }), {
            headers: apiHeaders, signal: request.signal,
          });
          if (!response.ok) throw new Error('Storage read failed');
          const rows = await response.json();
          if (!Array.isArray(rows)) throw new Error('Invalid storage result');
          dedications.push(...rows.map(savedRecord));
          if (rows.length < PAGE_SIZE) break;
          offset += rows.length;
        }
        return respond(200, { dedications });
      }

      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return error(415, 'Envía la dedicatoria como JSON.');
      }
      const body = await readPayload(request);
      if (body.error) return error(body.error, body.error === 413 ? 'La dedicatoria es demasiado grande.' : 'No pudimos leer la dedicatoria.');
      const payload = body.value;
      if (!payload || Array.isArray(payload) || typeof payload !== 'object'
        || typeof payload.url !== 'string' || payload.url.length > 2048
        || typeof payload.message !== 'string' || typeof payload.direction !== 'string') {
        return error(400, 'Revisa el enlace y tu dedicatoria.');
      }
      let dedication;
      try {
        dedication = prepare(payload.url, payload.message, payload.direction);
      } catch (validationError) {
        return error(400, validationError.message);
      }
      const fingerprint = await sha256(JSON.stringify([dedication.url, dedication.direction, dedication.message]));
      const insertHeaders = new Headers(apiHeaders);
      insertHeaders.set('content-type', 'application/json');
      insertHeaders.set('prefer', 'return=representation');
      const response = await fetchStorage(endpoint(), {
        method: 'POST',
        headers: insertHeaders,
        body: JSON.stringify({ url: dedication.url, message: dedication.message, direction: dedication.direction, fingerprint }),
        signal: request.signal,
      });
      if (response.ok) {
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Invalid storage result');
        return respond(201, { dedication: savedRecord(rows[0]) });
      }
      if (response.status === 409 && (await response.json()).code === '23505') {
        const existing = await fetchStorage(endpoint({ fingerprint: `eq.${fingerprint}`, limit: 1 }), {
          headers: apiHeaders, signal: request.signal,
        });
        if (!existing.ok) throw new Error('Storage lookup failed');
        const rows = await existing.json();
        if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Missing saved record');
        return respond(200, { dedication: savedRecord(rows[0]) });
      }
      throw new Error('Storage insert failed');
    } catch {
      return error(502, 'No pudimos conectar con las dedicatorias. Inténtalo de nuevo.');
    }
  };
}
