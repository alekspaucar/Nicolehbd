(function () {
  'use strict';

  const song = document.getElementById('song');
  const playButton = document.getElementById('play-btn');
  const playLabel = document.getElementById('play-label');
  const floatingMusic = document.getElementById('floating-music');
  const musicPlayer = document.getElementById('musica');
  const musicStatus = document.getElementById('music-status');
  const seek = document.getElementById('seek');
  const currentTime = document.getElementById('time-current');
  const totalTime = document.getElementById('time-total');
  const dialog = document.getElementById('lightbox');
  const dialogImage = document.getElementById('lightbox-img');
  const dialogCaption = document.getElementById('lightbox-caption');
  const closePhoto = document.getElementById('lightbox-close');
  let initialized = false;
  let musicPlayerVisible = true;
  let photoTrigger = null;
  let resumeAfterVideo = false;
  let activeVideo = null;
  let musicStarted = false;

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    return Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
  }

  function renderMusic() {
    const playing = !song.paused;
    musicPlayer.classList.toggle('is-playing', playing);
    playButton.classList.toggle('is-playing', playing);
    playButton.setAttribute('aria-pressed', String(playing));
    playButton.setAttribute('aria-label', (playing ? 'Pausar' : 'Reproducir') + ' nuestra canción');
    playLabel.textContent = playing ? 'Pausar' : 'Reproducir';
    floatingMusic.hidden = !musicStarted || musicPlayerVisible;
    floatingMusic.classList.toggle('is-playing', playing);
    floatingMusic.setAttribute('aria-label', (playing ? 'Pausar' : 'Reproducir') + ' nuestra canción');
    floatingMusic.querySelector('span').textContent = playing ? 'Pausar música' : 'Reproducir música';
  }

  function updateProgress() {
    const duration = song.duration;
    const available = Number.isFinite(duration) && duration > 0;
    seek.disabled = !available;
    seek.value = available ? (song.currentTime / duration) * 100 : 0;
    seek.setAttribute('aria-valuetext', formatTime(song.currentTime) + (available ? ' de ' + formatTime(duration) : ''));
    currentTime.textContent = formatTime(song.currentTime);
    totalTime.textContent = available ? formatTime(duration) : '—:—';
  }

  async function playSong() {
    if (window.DedicationGallery) window.DedicationGallery.stopPlayback();
    musicStarted = true;
    musicStatus.textContent = '';
    if (activeVideo && !activeVideo.paused) {
      resumeAfterVideo = false;
      activeVideo.pause();
    }
    if (!song.getAttribute('src')) song.src = song.dataset.src;
    try {
      await song.play();
    } catch (_) {
      musicStatus.textContent = 'No se pudo reproducir la canción. Toca Reproducir para intentarlo otra vez.';
    }
  }

  playButton.addEventListener('click', function () {
    if (song.paused) playSong();
    else song.pause();
    resumeAfterVideo = false;
  });
  floatingMusic.addEventListener('click', function () {
    if (song.paused) playSong();
    else song.pause();
    resumeAfterVideo = false;
  });
  seek.addEventListener('input', function () {
    if (Number.isFinite(song.duration)) song.currentTime = Number(seek.value) / 100 * song.duration;
    updateProgress();
  });
  song.addEventListener('play', renderMusic);
  song.addEventListener('pause', renderMusic);
  song.addEventListener('loadedmetadata', updateProgress);
  song.addEventListener('durationchange', updateProgress);
  song.addEventListener('timeupdate', updateProgress);
  song.addEventListener('error', function () {
    musicStatus.textContent = 'La canción no se pudo cargar. Puedes intentar reproducirla de nuevo.';
    renderMusic();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      musicPlayerVisible = entries[0].isIntersecting;
      renderMusic();
    }).observe(musicPlayer);
  }

  document.addEventListener('dedication-player-open', function () {
    resumeAfterVideo = false;
    song.pause();
    if (activeVideo) {
      const previous = activeVideo;
      activeVideo = null;
      previous.pause();
    }
  });

  function openPhoto(trigger, memory, media, index) {
    photoTrigger = trigger;
    dialogImage.src = media.src;
    dialogImage.alt = memory.title + (memory.media.length > 1 ? ', foto ' + (index + 1) : '');
    dialogCaption.textContent = memory.title;
    dialog.showModal();
    document.body.classList.add('photo-open');
    closePhoto.focus();
  }

  closePhoto.addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', function () {
    document.body.classList.remove('photo-open');
    dialogImage.removeAttribute('src');
    if (photoTrigger) photoTrigger.focus({ preventScroll: true });
  });

  const mediaObserver = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      const element = entry.target;
      if (element.dataset.poster) element.poster = element.dataset.poster;
      if (element.dataset.src) element.src = element.dataset.src;
      mediaObserver.unobserve(element);
    });
  }, { rootMargin: '600px 0px' }) : null;

  function deferMedia(element, media) {
    element.dataset.src = media.src;
    if (media.poster) element.dataset.poster = media.poster;
    if (mediaObserver) mediaObserver.observe(element);
    else {
      element.src = media.src;
      if (media.poster) element.poster = media.poster;
    }
  }

  function showMediaError(element, media) {
    if (element.parentElement.querySelector('.memory-error')) return;
    const message = document.createElement('p');
    message.className = 'memory-error';
    message.append('Este archivo no se pudo cargar. ');
    const link = document.createElement('a');
    link.href = media.originalSrc || media.src;
    link.textContent = 'Abrir el archivo original';
    message.append(link);
    element.parentElement.append(message);
  }

  function createMedia(memory, media, index) {
    const wrapper = document.createElement('div');
    if (media.type === 'video') {
      const video = document.createElement('video');
      video.className = 'memory-video';
      video.controls = true;
      video.playsInline = true;
      video.preload = 'none';
      video.setAttribute('aria-label', memory.title + ', video ' + (index + 1));
      if (media.width && media.height) { video.width = media.width; video.height = media.height; }
      deferMedia(video, media);
      video.addEventListener('play', function () {
        if (window.DedicationGallery) window.DedicationGallery.stopPlayback();
        const wasPlaying = !song.paused || resumeAfterVideo;
        resumeAfterVideo = false;
        if (activeVideo && activeVideo !== video) activeVideo.pause();
        activeVideo = video;
        resumeAfterVideo = wasPlaying;
        song.pause();
      });
      function finishVideo() {
        if (activeVideo !== video) return;
        activeVideo = null;
        const shouldResume = resumeAfterVideo;
        resumeAfterVideo = false;
        if (shouldResume) playSong();
      }
      video.addEventListener('pause', finishVideo);
      video.addEventListener('ended', finishVideo);
      video.addEventListener('error', function () { showMediaError(video, media); finishVideo(); });
      wrapper.append(video);
    } else {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'memory-photo';
      button.setAttribute('aria-label', 'Ampliar foto: ' + memory.title + (memory.media.length > 1 ? ', ' + (index + 1) + ' de ' + memory.media.length : ''));
      const image = document.createElement('img');
      image.alt = memory.title + (memory.media.length > 1 ? ', foto ' + (index + 1) : '');
      image.loading = 'lazy';
      image.decoding = 'async';
      if (media.width && media.height) { image.width = media.width; image.height = media.height; }
      deferMedia(image, media);
      image.addEventListener('error', function () { showMediaError(button, media); });
      button.append(image);
      button.addEventListener('click', function () { openPhoto(button, memory, media, index); });
      wrapper.append(button);
    }
    return wrapper;
  }

  function renderAlbum() {
    const container = document.getElementById('memories');
    const memories = window.MEMORIES;
    if (!Array.isArray(memories) || !memories.length) {
      container.textContent = 'No se pudo cargar el álbum. Vuelve a abrir la página para intentarlo de nuevo.';
      return;
    }
    const fragment = document.createDocumentFragment();
    let chapter = null;
    let previousSection = null;
    memories.forEach(function (memory) {
      const section = memory.section || 'Nuestros recuerdos';
      if (section !== previousSection) {
        chapter = document.createElement('section');
        chapter.className = 'memory-chapter';
        const heading = document.createElement('div');
        heading.className = 'chapter-heading';
        const title = document.createElement('h3');
        title.textContent = section;
        heading.append(title);
        chapter.append(heading);
        fragment.append(chapter);
        previousSection = section;
      }
      const article = document.createElement('article');
      article.className = 'memory';
      article.id = 'recuerdo-' + memory.id;
      const heading = document.createElement('div');
      heading.className = 'memory-heading';
      const title = document.createElement('h4');
      title.textContent = memory.title;
      heading.append(title);
      if (memory.date) {
        const date = document.createElement('time');
        const isExact = memory.dateSource === 'original-text';
        date.dateTime = isExact ? memory.date : memory.date.slice(0, 7);
        date.textContent = new Date(memory.date + 'T12:00:00').toLocaleDateString('es-EC', isExact ? { day: 'numeric', month: 'long', year: 'numeric' } : { month: 'long', year: 'numeric' });
        heading.append(date);
      } else if (memory.year) {
        const date = document.createElement('time');
        date.dateTime = String(memory.year);
        date.textContent = String(memory.year);
        heading.append(date);
      }
      article.append(heading);
      const media = document.createElement('div');
      media.className = 'memory-media';
      memory.media.forEach(function (item, index) { media.append(createMedia(memory, item, index)); });
      article.append(media);
      if (memory.text) {
        const text = document.createElement('div');
        text.className = 'memory-text';
        memory.text.split(/\r?\n\s*\r?\n/).forEach(function (paragraph) {
          const p = document.createElement('p');
          p.textContent = paragraph;
          text.append(p);
        });
        article.append(text);
      }
      chapter.append(article);
    });
    container.append(fragment);
  }

  function initialize() {
    if (initialized || !document.documentElement.classList.contains('unlocked')) return;
    initialized = true;
    document.querySelectorAll('.hero-photo img[data-src]').forEach(function (image) { image.src = image.dataset.src; });
    renderAlbum();
    renderMusic();
    if (window.DedicationGallery) window.DedicationGallery.mount();
    if (window.BirthdayCelebration) {
      window.BirthdayCelebration.start();
      window.BirthdayCelebration.observe(document.getElementById('page'));
    }
    let anchor = null;
    try { anchor = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (_) { /* Ignore malformed fragments. */ }
    if (anchor) requestAnimationFrame(function () { anchor.scrollIntoView(); });
  }
  window.addEventListener('birthday-unlocked', initialize);
  initialize();
})();
