import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../dedication.js', import.meta.url), 'utf8');

function loadBrowserDedication() {
  const window = {};
  runInNewContext(source, { window, URL });
  return window.SongDedication;
}

const dedication = loadBrowserDedication();

test('the screenshot YouTube Music link becomes a playable, saved song record', () => {
  const record = dedication.prepare(
    '  https://music.youtube.com/watch?v=wAPCSnAhhC8&si=shared#details  ',
    '  Me recuerda a nosotros.  ',
    'to-anis',
  );
  assert.equal(record.url, 'https://youtube.com/watch?v=wAPCSnAhhC8');
  assert.equal(record.provider, 'youtube');
  assert.equal(record.embedUrl, 'https://www.youtube.com/embed/wAPCSnAhhC8');
  assert.equal(record.message, 'Me recuerda a nosotros.');
  assert.equal(record.direction, 'to-anis');
  assert.equal(record.title, 'Una canción de YouTube');
});

test('YouTube share, watch, shorts and embed links identify the same song', () => {
  for (const url of [
    'https://youtu.be/wAPCSnAhhC8?si=shared',
    'https://youtube.com/watch?v=wAPCSnAhhC8&list=PL123&index=2',
    'https://www.youtube.com/watch?v=wAPCSnAhhC8&t=33',
    'https://music.youtube.com/watch?v=wAPCSnAhhC8',
    'https://youtube.com/shorts/wAPCSnAhhC8',
    'https://youtube.com/embed/wAPCSnAhhC8?autoplay=1',
  ]) {
    const record = dedication.prepare(url);
    assert.equal(record.url, 'https://youtube.com/watch?v=wAPCSnAhhC8', url);
    assert.equal(record.embedUrl, 'https://www.youtube.com/embed/wAPCSnAhhC8', url);
    assert.equal(record.direction, 'to-alexander');
    assert.equal(record.message, '');
  }
});

test('Spotify track links discard locale prefixes and tracking', () => {
  for (const url of [
    'https://OPEN.SPOTIFY.COM/track/4uLU6hMCjMI75M1A2tKUQC?si=abc#shared',
    'https://open.spotify.com/intl-es/track/4uLU6hMCjMI75M1A2tKUQC?utm_source=copy-link',
  ]) {
    const record = dedication.prepare(url);
    assert.equal(record.url, 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
    assert.equal(record.provider, 'spotify');
    assert.equal(record.embedUrl, 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC');
  }
});

test('Apple Music song and album-track links use Apple embeds and retain only a song selector', () => {
  const fixtures = [
    {
      input: 'https://music.apple.com/ec/song/amor-de-mi-vida/123456789?l=es#share',
      url: 'https://music.apple.com/ec/song/amor-de-mi-vida/123456789',
      embed: 'https://embed.music.apple.com/ec/song/amor-de-mi-vida/123456789',
    },
    {
      input: 'https://music.apple.com/us/song/123456789?utm_source=copy',
      url: 'https://music.apple.com/us/song/123456789',
      embed: 'https://embed.music.apple.com/us/song/123456789',
    },
    {
      input: 'https://music.apple.com/ec/album/una-canci%C3%B3n/123456789?i=987654321&l=es&itscg=30200',
      url: 'https://music.apple.com/ec/album/una-canci%C3%B3n/123456789?i=987654321',
      embed: 'https://embed.music.apple.com/ec/album/una-canci%C3%B3n/123456789?i=987654321',
    },
  ];
  for (const fixture of fixtures) {
    const record = dedication.prepare(fixture.input);
    assert.equal(record.provider, 'apple');
    assert.equal(record.url, fixture.url);
    assert.equal(record.embedUrl, fixture.embed);
  }
});

test('SoundCloud keeps the song route inside a safely encoded widget URL', () => {
  const record = dedication.prepare('https://www.soundcloud.com/artist/our-song?si=tracking&utm_source=clipboard#share');
  assert.equal(record.url, 'https://soundcloud.com/artist/our-song');
  assert.equal(record.provider, 'soundcloud');
  assert.equal(record.embedUrl, 'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Four-song&auto_play=false');
});

test('Deezer country routes identify the same song without tracking', () => {
  for (const url of [
    'https://www.deezer.com/es/track/3135556?utm_source=copy',
    'https://deezer.com/track/3135556#share',
  ]) {
    const record = dedication.prepare(url);
    assert.equal(record.url, 'https://www.deezer.com/track/3135556');
    assert.equal(record.provider, 'deezer');
    assert.equal(record.embedUrl, 'https://widget.deezer.com/widget/dark/track/3135556');
  }
});

test('homepages, playlists, albums without a song, profiles and malformed IDs cannot be saved as songs', () => {
  for (const url of [
    'https://youtube.com/',
    'https://youtube.com/playlist?list=PL123',
    'https://youtube.com/watch?v=123',
    'https://youtube.com/watch?v=wAPCSnAhhC8&v=dQw4w9WgXcQ',
    'https://youtu.be/wAPCSnAhhC8/extra',
    'https://open.spotify.com/',
    'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    'https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC',
    'https://open.spotify.com/track/123',
    'https://music.apple.com/ec/album/album-name/123456789',
    'https://music.apple.com/ec/album/album-name/123456789?i=not-a-song',
    'https://music.apple.com/ec/playlist/playlist-name/pl.123',
    'https://soundcloud.com/artist',
    'https://soundcloud.com/artist/sets/a-playlist',
    'https://soundcloud.com/artist/tracks',
    'https://soundcloud.com/discover/sets',
    'https://deezer.com/es/playlist/123',
    'https://deezer.com/track/not-a-number',
  ]) {
    assert.throws(() => dedication.prepare(url), { name: 'Error' }, url);
  }
});

test('short Spotify and Deezer links ask for a full song link', () => {
  for (const url of [
    'https://spotify.link/abcdef',
    'https://spoti.fi/abcdef',
    'https://deezer.page.link/abcdef',
    'https://dzr.page.link/abcdef',
  ]) {
    assert.throws(() => dedication.prepare(url), /enlace completo.*canci[oó]n/i, url);
  }
});

test('Amazon Music is rejected with an explanation and a supported next step', () => {
  assert.throws(
    () => dedication.prepare('https://music.amazon.com/tracks/B012345678'),
    /Amazon Music.*enlace completo/i,
  );
});

test('unsupported, insecure, deceptive, credentialed and custom-port URLs are rejected', () => {
  for (const url of [
    '', '   ', 'not a URL', null, undefined, {},
    '<iframe src="https://youtube.com/embed/wAPCSnAhhC8"></iframe>',
    'http://youtube.com/watch?v=wAPCSnAhhC8',
    'javascript:alert(1)',
    'https://localhost/song',
    'https://127.0.0.1/song',
    'https://example.com/song',
    'https://notspotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://open.spotify.com.example.com/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://youtube.com.evil.test/watch?v=wAPCSnAhhC8',
    'https://evil.youtube.com/watch?v=wAPCSnAhhC8',
    'https://youtube.com@evil.example/watch?v=wAPCSnAhhC8',
    'https://name:password@youtube.com/watch?v=wAPCSnAhhC8',
    'https://youtube.com:8443/watch?v=wAPCSnAhhC8',
    'https://youtube.com:443/watch?v=wAPCSnAhhC8',
    'https://youtube.com\\watch?v=wAPCSnAhhC8',
  ]) {
    assert.throws(() => dedication.prepare(url), { name: 'Error' }, String(url));
  }
});

test('messages allow 1000 trimmed characters and reject non-text or longer content', () => {
  assert.equal(dedication.prepare('https://youtu.be/wAPCSnAhhC8', ` ${'a'.repeat(1000)} `).message.length, 1000);
  assert.throws(() => dedication.prepare('https://youtu.be/wAPCSnAhhC8', 'a'.repeat(1001)), /1000/);
  for (const message of [null, {}, 1, []]) {
    assert.throws(() => dedication.prepare('https://youtu.be/wAPCSnAhhC8', message), /mensaje/i);
  }
});

test('only the two intended dedication directions can be saved', () => {
  assert.equal(dedication.prepare('https://youtu.be/wAPCSnAhhC8', '', 'to-alexander').direction, 'to-alexander');
  assert.equal(dedication.prepare('https://youtu.be/wAPCSnAhhC8', '', 'to-anis').direction, 'to-anis');
  for (const direction of ['', 'to-anyone', 'to-Alexander', null, 1, {}]) {
    assert.throws(() => dedication.prepare('https://youtu.be/wAPCSnAhhC8', '', direction), /dedicatoria/i);
  }
});

test('the server can import the same parser as a CommonJS default export', async () => {
  const { default: parser } = await import('../dedication.js');
  const record = parser.prepare('https://youtu.be/wAPCSnAhhC8', 'Para ti');
  assert.equal(record.url, 'https://youtube.com/watch?v=wAPCSnAhhC8');
  assert.equal(record.message, 'Para ti');
});
