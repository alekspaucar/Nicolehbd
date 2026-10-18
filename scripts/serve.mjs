import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const preview = process.argv.includes('--preview');
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg' };

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep) || pathname.split('/').some(part => part.startsWith('.'))) {
      response.writeHead(403).end(); return;
    }
    const info = await stat(file);
    if (!info.isFile()) { response.writeHead(404).end(); return; }
    const headers = { 'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (preview && file === resolve(root, 'index.html')) {
      const html = (await readFile(file, 'utf8')).replace('<html lang="es">', '<html lang="es" class="unlocked">');
      response.writeHead(200, headers).end(html); return;
    }
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
      if (start > end || start >= info.size) { response.writeHead(416, { 'Content-Range': 'bytes */' + info.size }).end(); return; }
      response.writeHead(206, { ...headers, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': end - start + 1 });
      createReadStream(file, { start, end }).pipe(response);
    } else {
      response.writeHead(200, { ...headers, 'Accept-Ranges': 'bytes', 'Content-Length': info.size });
      createReadStream(file).pipe(response);
    }
  } catch (_) { response.writeHead(404).end('No encontrado'); }
}).listen(port, '127.0.0.1', () => console.log(`Página local${preview ? ' (vista previa del cumpleaños)' : ''}: http://127.0.0.1:${port}`));
