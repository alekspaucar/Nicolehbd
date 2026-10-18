(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, () => require('./dedication.js'));
  } else {
    root.DedicationStore = factory(root);
  }
}(typeof window !== 'undefined' ? window : globalThis, function (root, loadParser) {
  'use strict';

  const storageKey = 'anis-dedications-v1';
  const browserRecordLimit = 500;
  let sequence = 0;

  function failure(message, cause) {
    const error = new Error(message);
    if (cause) error.cause = cause;
    return error;
  }

  function validId(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
  }

  function validDate(value) {
    if (typeof value !== 'string') return false;
    const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/);
    if (!parts || !Number.isFinite(Date.parse(value))) return false;
    const year = Number(parts[1]);
    const month = Number(parts[2]);
    const day = Number(parts[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
  }

  function createId() {
    if (typeof root.crypto?.randomUUID === 'function') return root.crypto.randomUUID();
    sequence += 1;
    return `dedication-${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function endpointFor(value) {
    const invalid = () => failure('Configura una ruta del servicio que empiece por / o una dirección HTTPS válida.');
    if (typeof value !== 'string' || !value || /[\u0000-\u0020\u007f\\]/.test(value)) throw invalid();
    try {
      const relative = value.startsWith('/') && !value.startsWith('//');
      const parsed = new URL(value, 'https://dedications.invalid');
      if ((!relative && (!/^https:\/\/[^/]/i.test(value) || parsed.protocol !== 'https:')) || parsed.username || parsed.password || parsed.hash) throw invalid();
      if (relative && parsed.origin !== 'https://dedications.invalid') throw invalid();
      return value;
    } catch (error) {
      throw invalid();
    }
  }

  function newestFirst(records) {
    return records.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  function sameDedication(left, right) {
    return left.url === right.url && left.direction === right.direction && left.message === right.message;
  }

  function create({ mode = 'browser', endpoint, storage, fetch: fetchFn, headers, parser, now = () => new Date(), makeId = createId } = {}) {
    if (mode !== 'browser' && mode !== 'api') throw failure('El modo de dedicatorias debe ser browser o api.');
    const apiEndpoint = mode === 'api' ? endpointFor(endpoint) : null;

    function prepare(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('Primero elige la canción que quieres dedicar.');
      const songParser = parser || root.SongDedication || (loadParser && loadParser());
      const parse = typeof songParser === 'function' ? songParser : songParser?.prepare;
      if (typeof parse !== 'function') throw failure('No pudimos preparar la canción. Recarga la página y vuelve a intentarlo.');
      const song = parse.call(songParser, input.url, input.message, input.direction);
      if (!song || ['url', 'provider', 'embedUrl', 'message', 'direction', 'title'].some(field => typeof song[field] !== 'string')) {
        throw failure('No pudimos preparar la canción. Recarga la página y vuelve a intentarlo.');
      }
      return {
        url: song.url,
        provider: song.provider,
        embedUrl: song.embedUrl,
        message: song.message,
        direction: song.direction,
        title: song.title,
      };
    }

    function recordFrom(input) {
      if (!input || !validId(input.id) || !validDate(input.createdAt)
        || ['url', 'message', 'direction'].some(field => typeof input[field] !== 'string')) {
        throw failure('La dedicatoria tiene datos incompletos.');
      }
      return { id: input.id, createdAt: input.createdAt, ...prepare(input) };
    }

    function recordsFrom(input) {
      if (!Array.isArray(input)) throw failure('La lista de dedicatorias no es válida.');
      const ids = new Set();
      const records = input.map(item => {
        const record = recordFrom(item);
        if (ids.has(record.id)) throw failure('La lista contiene identificadores repetidos.');
        ids.add(record.id);
        return record;
      });
      return newestFirst(records);
    }

    function browserStorage() {
      try {
        const selected = storage === undefined ? root.localStorage : storage;
        if (!selected || typeof selected.getItem !== 'function' || typeof selected.setItem !== 'function') throw new Error('Unavailable storage');
        return selected;
      } catch (error) {
        throw failure('No podemos acceder al almacenamiento de este navegador. Habilítalo y vuelve a intentarlo.', error);
      }
    }

    function browserRecords(selected) {
      let raw;
      try {
        raw = selected.getItem(storageKey);
      } catch (error) {
        throw failure('No podemos leer el almacenamiento de este navegador. Habilítalo y vuelve a intentarlo.', error);
      }
      if (raw === null) return [];
      try {
        if (typeof raw !== 'string') throw new Error('Invalid storage value');
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length > browserRecordLimit) throw failure('La lista supera el límite de 500 dedicatorias de este navegador.');
        return recordsFrom(saved);
      } catch (error) {
        throw failure('No podemos leer las dedicatorias guardadas. Tus datos no se han modificado; revisa el almacenamiento del navegador antes de volver a guardar.', error);
      }
    }

    function requestHeaders(method) {
      try {
        const supplied = typeof headers === 'function' ? headers() : headers === undefined ? {} : headers;
        if (!supplied || Object.prototype.toString.call(supplied) !== '[object Object]') throw new Error('Invalid headers');
        const result = { Accept: 'application/json' };
        const names = new Map([['accept', 'Accept'], ['content-type', 'Content-Type']]);
        for (const [name, value] of Object.entries(supplied)) {
          if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || typeof value !== 'string' || /[\u0000-\u0008\u000a-\u001f\u007f]/.test(value)) {
            throw new Error('Invalid header');
          }
          const normalized = name.toLowerCase();
          const target = names.get(normalized) || name;
          names.set(normalized, target);
          Object.defineProperty(result, target, { value, writable: true, enumerable: true, configurable: true });
        }
        if (method === 'POST') result['Content-Type'] = 'application/json';
        return result;
      } catch (error) {
        throw failure('No pudimos preparar las cabeceras de acceso a las dedicatorias. Revisa la configuración e inténtalo de nuevo.', error);
      }
    }

    async function request(method, song) {
      const send = fetchFn || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
      if (!send) throw failure('No hay conexión con el servicio de dedicatorias. Vuelve a intentarlo más tarde.');
      const options = { method, credentials: 'omit', cache: 'no-store', headers: requestHeaders(method) };
      if (method === 'POST') {
        options.body = JSON.stringify({ url: song.url, message: song.message, direction: song.direction });
      }
      let response;
      try {
        response = await send(apiEndpoint, options);
      } catch (error) {
        throw failure('No pudimos conectar con el servicio de dedicatorias. Revisa tu conexión y vuelve a intentarlo.', error);
      }
      if (response?.status === 401 || response?.status === 403) {
        const error = failure('Introduce la clave de nuestra colección para ver y guardar las canciones.');
        error.code = 'AUTH_REQUIRED';
        throw error;
      }
      if (response?.ok !== true) throw failure('El servicio de dedicatorias no pudo completar la solicitud. Vuelve a intentarlo más tarde.');
      try {
        const body = await response.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid response');
        if (method === 'GET') return recordsFrom(body.dedications);
        const saved = recordFrom(body.dedication);
        if (!sameDedication(saved, song)) throw new Error('The response does not match the dedication');
        return saved;
      } catch (error) {
        throw failure('El servicio devolvió una respuesta de dedicatorias no válida. Recarga la página y vuelve a intentarlo.', error);
      }
    }

    async function list() {
      return mode === 'api' ? request('GET') : browserRecords(browserStorage());
    }

    async function save(input) {
      if (mode === 'api') return request('POST', prepare(input));
      const selected = browserStorage();
      const records = browserRecords(selected);
      const song = prepare(input);
      const existing = records.find(record => sameDedication(record, song));
      if (existing) return existing;
      if (records.length >= browserRecordLimit) throw failure('Llegaste al límite de 500 dedicatorias guardadas en este navegador.');
      const id = makeId();
      if (!validId(id) || records.some(record => record.id === id)) throw failure('No pudimos crear un identificador único para la dedicatoria. Vuelve a intentarlo.');
      let createdAt;
      try {
        createdAt = new Date(now()).toISOString();
      } catch (error) {
        throw failure('No pudimos obtener la fecha de la dedicatoria. Revisa la fecha del dispositivo.', error);
      }
      const record = { id, createdAt, ...song };
      try {
        selected.setItem(storageKey, JSON.stringify(newestFirst([record, ...records])));
      } catch (error) {
        throw failure('No pudimos guardar la dedicatoria en este navegador. Libera espacio o habilita el almacenamiento y vuelve a intentarlo.', error);
      }
      return record;
    }

    return { mode, list, save };
  }

  return { create };
}));
