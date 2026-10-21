(function () {
  'use strict';

  const services = { youtube: 'YouTube', spotify: 'Spotify', apple: 'Apple Music', soundcloud: 'SoundCloud', deezer: 'Deezer' };
  let mounted = false;
  let active = null;

  function stopPlayback() {
    if (!active) return;
    active.frame.remove();
    active.button.textContent = 'Escuchar aquí';
    active.button.setAttribute('aria-expanded', 'false');
    active = null;
  }

  function createCard(record) {
    const card = document.createElement('article');
    card.className = 'saved-dedication';
    const header = document.createElement('div');
    header.className = 'saved-dedication-heading';
    const title = document.createElement('h4');
    title.textContent = record.direction === 'to-anis' ? 'De Alexander para Anis' : 'De Anis para Alexander';
    const provider = document.createElement('p');
    provider.textContent = services[record.provider];
    header.append(title, provider);
    card.append(header);
    if (record.message) {
      const note = document.createElement('p');
      note.className = 'saved-dedication-message';
      note.textContent = record.message;
      card.append(note);
    }
    const player = document.createElement('div');
    player.className = 'dedication-embed dedication-embed-' + record.provider;
    const actions = document.createElement('div');
    actions.className = 'saved-dedication-actions';
    const listen = document.createElement('button');
    listen.type = 'button';
    listen.className = 'dedication-listen';
    listen.textContent = 'Escuchar aquí';
    listen.setAttribute('aria-expanded', 'false');
    listen.addEventListener('click', function () {
      if (active && active.button === listen) { stopPlayback(); return; }
      stopPlayback();
      document.dispatchEvent(new Event('dedication-player-open'));
      const frame = document.createElement('iframe');
      frame.src = record.embedUrl;
      frame.title = 'Reproductor de ' + services[record.provider] + ': ' + title.textContent;
      frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.setAttribute('allowfullscreen', '');
      player.append(frame);
      listen.textContent = 'Cerrar reproductor';
      listen.setAttribute('aria-expanded', 'true');
      active = { frame, button: listen };
    });
    const original = document.createElement('a');
    original.href = record.url;
    original.target = '_blank';
    original.rel = 'noopener noreferrer';
    original.textContent = 'Abrir en ' + services[record.provider];
    actions.append(listen, original);
    card.append(actions, player);
    return card;
  }

  function mount() {
    if (mounted || !document.documentElement.classList.contains('unlocked')) return;
    mounted = true;
    const form = document.getElementById('dedication-form');
    const url = document.getElementById('dedication-url');
    const message = document.getElementById('dedication-message');
    const direction = document.getElementById('dedication-direction');
    const status = document.getElementById('dedication-status');
    const list = document.getElementById('saved-dedications');
    const empty = document.getElementById('dedications-empty');
    const storageNote = document.getElementById('dedication-storage-note');
    const submit = form.querySelector('button[type="submit"]');
    const accessForm = document.getElementById('dedication-access');
    const accessKey = document.getElementById('dedication-access-key');
    const config = window.DEDICATIONS_CONFIG || { mode: 'browser' };
    const publicCollection = config.mode === 'api' && config.public === true;
    if (publicCollection) accessForm.hidden = true;
    let store;
    let records = [];
    let loading = true;
    let loaded = false;
    let saving = false;
    submit.disabled = true;

    function render() {
      stopPlayback();
      list.replaceChildren();
      records.forEach(function (record) { list.append(createCard(record)); });
      empty.hidden = records.length > 0;
    }

    function resetStatus() {
      status.textContent = '';
      url.removeAttribute('aria-invalid');
    }
    url.addEventListener('input', resetStatus);
    message.addEventListener('input', resetStatus);
    direction.addEventListener('change', resetStatus);

    try {
      store = window.DedicationStore.create({
        ...config,
        headers: publicCollection ? undefined : function () { return { 'x-collection-key': accessKey.value.trim() }; }
      });
      storageNote.textContent = store.mode === 'browser' ? 'Por ahora se guardan en este navegador. Para verlas desde ambos celulares falta activar el guardado compartido.' : 'Las canciones quedan guardadas para volver a escucharlas aquí.';
      if (store.mode === 'api' && !publicCollection) {
        accessForm.hidden = false;
        try { accessKey.value = window.sessionStorage.getItem('anis-collection-key') || ''; } catch (_) { /* The collection can open without remembering the key. */ }
      }
    } catch (error) {
      status.textContent = error.message || 'No se pudo abrir la colección de canciones.';
      empty.hidden = true;
      return;
    }

    async function load() {
      loading = true;
      submit.disabled = true;
      try {
        records = await store.list();
        loaded = true;
        if (store.mode === 'api' && !publicCollection) {
          accessForm.hidden = true;
          storageNote.textContent = 'Nuestra colección compartida: las canciones quedan aquí para volver a escucharlas.';
          try { window.sessionStorage.setItem('anis-collection-key', accessKey.value.trim()); } catch (_) { /* Continue with an in-memory key. */ }
        }
        render();
        status.textContent = '';
      } catch (error) {
        loaded = false;
        empty.hidden = true;
        status.textContent = error.message || 'No se pudieron cargar las canciones. Vuelve a abrir la página para intentarlo otra vez.';
        if (store.mode === 'api' && !publicCollection) accessForm.hidden = false;
      } finally {
        loading = false;
        submit.disabled = store.mode === 'api' && !loaded;
      }
    }

    accessForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const openButton = accessForm.querySelector('button');
      openButton.disabled = true;
      await load();
      openButton.disabled = false;
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (loading || saving) return;
      resetStatus();
      const draft = { url: url.value, message: message.value, direction: direction.value };
      let dedication;
      try {
        dedication = window.SongDedication.prepare(draft.url, draft.message, draft.direction);
      } catch (error) {
        status.textContent = error.message;
        url.setAttribute('aria-invalid', 'true');
        url.focus();
        return;
      }
      submit.disabled = true;
      saving = true;
      submit.textContent = 'Guardando…';
      try {
        const saved = await store.save(dedication);
        records = [saved].concat(records.filter(function (record) { return record.id !== saved.id; }));
        records.sort(function (left, right) { return Date.parse(right.createdAt) - Date.parse(left.createdAt); });
        render();
        if (url.value === draft.url && message.value === draft.message && direction.value === draft.direction) {
          url.value = '';
          message.value = '';
        }
        status.textContent = store.mode === 'browser' ? 'Canción guardada en este navegador. Ya puedes escucharla abajo.' : 'Canción guardada. Ya puedes escucharla abajo.';
      } catch (error) {
        status.textContent = error.message || 'No se pudo guardar la canción. Tu enlace y mensaje siguen aquí para intentarlo otra vez.';
        if (error.code === 'AUTH_REQUIRED') {
          loaded = false;
          accessForm.hidden = false;
        }
      } finally {
        saving = false;
        submit.disabled = store.mode === 'api' && !loaded;
        submit.textContent = 'Guardar canción';
      }
    });

    window.addEventListener('storage', function (event) {
      if (store.mode === 'browser' && event.key === 'anis-dedications-v1') load();
    });
    if (store.mode === 'browser' || publicCollection || accessKey.value) load();
    else {
      loading = false;
      empty.hidden = true;
      storageNote.textContent = 'Introduce nuestra clave para abrir las canciones que compartimos.';
    }
  }

  window.DedicationGallery = { mount: mount, stopPlayback: stopPlayback };
})();
