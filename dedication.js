(function (root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SongDedication = api;
}(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  const songLinkHint = 'Pega el enlace completo de una canción de YouTube, Spotify, Apple Music, SoundCloud o Deezer.';
  const shortHosts = new Set(['spotify.link', 'spoti.fi', 'deezer.page.link', 'dzr.page.link']);
  const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'music.youtube.com', 'youtu.be']);
  const soundcloudPages = new Set(['discover', 'charts', 'search', 'you', 'stream', 'upload', 'settings', 'pages', 'jobs', 'go', 'mobile']);
  const soundcloudCollections = new Set(['tracks', 'sets', 'albums', 'popular-tracks', 'reposts', 'likes', 'comments', 'following', 'followers']);

  // Player URL formats come from the providers; never accept iframe markup or a supplied embed src.
  // https://developers.google.com/youtube/player_parameters
  // https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed
  // https://developers.soundcloud.com/docs/api/html5-widget
  // https://developers.deezer.com/musicplugins/player
  function findSong(song) {
    const host = song.hostname;
    const path = song.pathname;
    let match;

    if (shortHosts.has(host)) {
      throw new Error('Abre la canción y copia su enlace completo de canción; los enlaces cortos no se admiten aquí.');
    }
    if (host === 'music.amazon.com') {
      throw new Error('Este reproductor no admite Amazon Music. ' + songLinkHint);
    }

    if (youtubeHosts.has(host)) {
      let id;
      if (host === 'youtu.be') {
        match = path.match(/^\/([A-Za-z0-9_-]{11})\/?$/);
        id = match && match[1];
      } else if (/^\/watch\/?$/.test(path)) {
        const ids = song.searchParams.getAll('v');
        if (ids.length === 1 && /^[A-Za-z0-9_-]{11}$/.test(ids[0])) id = ids[0];
      } else {
        match = path.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/);
        id = match && match[1];
      }
      if (id) {
        return {
          url: 'https://youtube.com/watch?v=' + id,
          provider: 'youtube',
          embedUrl: 'https://www.youtube.com/embed/' + id,
          title: 'Una canción de YouTube',
        };
      }
    }

    if (host === 'open.spotify.com') {
      match = path.match(/^\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})\/?$/);
      if (match) {
        return {
          url: 'https://open.spotify.com/track/' + match[1],
          provider: 'spotify',
          embedUrl: 'https://open.spotify.com/embed/track/' + match[1],
          title: 'Una canción de Spotify',
        };
      }
    }

    if (host === 'music.apple.com') {
      match = path.match(/^\/([a-z]{2})\/(song|album)\/(?:([^/]+)\/)?([1-9][0-9]*)\/?$/);
      const selectors = song.searchParams.getAll('i');
      const validSelector = selectors.length === 1 && /^[1-9][0-9]*$/.test(selectors[0]);
      if (match && selectors.length <= 1 && (!selectors.length || validSelector)
        && (match[2] === 'song' || validSelector)) {
        let slug = '';
        if (match[3]) {
          try {
            const decoded = decodeURIComponent(match[3]);
            if (/[\u0000-\u0020\u007f/\\?#<>]/.test(decoded)) throw new Error();
            slug = encodeURIComponent(decoded) + '/';
          } catch (_) {
            throw new Error(songLinkHint);
          }
        }
        const songPath = '/' + match[1] + '/' + match[2] + '/' + slug + match[4]
          + (validSelector ? '?i=' + selectors[0] : '');
        return {
          url: 'https://music.apple.com' + songPath,
          provider: 'apple',
          embedUrl: 'https://embed.music.apple.com' + songPath,
          title: 'Una canción de Apple Music',
        };
      }
    }

    if (host === 'soundcloud.com' || host === 'www.soundcloud.com') {
      match = path.match(/^\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/?$/);
      if (match && !soundcloudPages.has(match[1].toLowerCase()) && !soundcloudCollections.has(match[2].toLowerCase())) {
        const url = 'https://soundcloud.com/' + match[1] + '/' + match[2];
        return {
          url,
          provider: 'soundcloud',
          embedUrl: 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) + '&auto_play=false',
          title: 'Una canción de SoundCloud',
        };
      }
    }

    if (host === 'deezer.com' || host === 'www.deezer.com') {
      match = path.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?track\/([1-9][0-9]*)\/?$/);
      if (match) {
        return {
          url: 'https://www.deezer.com/track/' + match[1],
          provider: 'deezer',
          embedUrl: 'https://widget.deezer.com/widget/dark/track/' + match[1],
          title: 'Una canción de Deezer',
        };
      }
    }

    throw new Error(songLinkHint);
  }

  function prepare(url, message = '', direction = 'to-alexander') {
    let song;
    try {
      if (typeof url !== 'string' || !url.trim()) throw new Error();
      const input = url.trim();
      // URL normalizes backslashes, controls and default ports. Reject them before parsing.
      if (!/^https:\/\//i.test(input) || /[\u0000-\u0020\u007f\\]/.test(input)) throw new Error();
      const authority = input.match(/^https:\/\/([^/?#]+)/i);
      if (!authority || authority[1].includes(':')) throw new Error();
      song = new URL(input);
      if (song.protocol !== 'https:' || song.username || song.password || song.port) throw new Error();
    } catch (_) {
      throw new Error('Usa un enlace HTTPS de una canción, sin usuario, contraseña ni puerto. ' + songLinkHint);
    }

    if (typeof message !== 'string') throw new Error('Escribe tu dedicatoria como un mensaje.');
    const note = message.trim();
    if (note.length > 1000) throw new Error('Tu dedicatoria puede tener hasta 1000 caracteres.');
    if (direction !== 'to-alexander' && direction !== 'to-anis') {
      throw new Error('Elige para quién es esta dedicatoria: Alexander o Anis.');
    }

    const songData = findSong(song);
    return {
      url: songData.url,
      provider: songData.provider,
      embedUrl: songData.embedUrl,
      message: note,
      direction,
      title: songData.title,
    };
  }

  return { prepare };
}));
