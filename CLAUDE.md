# Proyecto: Página de cumpleaños — Nicole

## Contexto general
Página web personal de cumpleaños para Nicole. Se entregará un ramo de flores amarillas
con una tarjeta que contiene un QR apuntando a esta página desplegada en GitHub Pages.

La tarjeta dirá: **"escanea cuando sea tu cumpleaños"**

**Fecha de cumpleaños: 21 de octubre de 2026**

---

## Repositorio
- GitHub: `https://github.com/alekspaucar/Nicolehbd.git`
- GitHub Pages: `https://alekspaucar.github.io/Nicolehbd/`
- Carpeta local: `/Users/erickvzh/Desktop/aleksOS/anahi/anahi-para-ti/`

---

## Stack técnico
- HTML + Tailwind CSS (compilado en `styles.css`)
- Google Fonts: Playfair Display + Plus Jakarta Sans
- Sin frameworks JS — vanilla puro
- Música: `musica.mp3` en raíz
- Portada: carpeta `img/`
- Álbum: catálogo generado `memories.js`, copias optimizadas en `media/`
- Originales privados: `Anis/` (no modificar ni publicar sin indicación)

---

## Estrategia de despliegue (DATE GATE)

La página usa **detección de fecha en JavaScript síncrono** en `<head>`.

- **Antes del 21 de octubre de 2026:** pantalla de "paciencia" (🌻 gate)
- **Desde el 21 de octubre en adelante:** página completa automáticamente, sin push manual

### Cómo funciona el gate (ya implementado)
1. Script síncrono en `<head>` agrega clase `unlocked` a `<html>` si fecha >= `2026-10-21T00:00:00`, según el reloj local del dispositivo.
2. Sin `unlocked`, CSS oculta `#page` y muestra únicamente `#gate`.
3. Al desbloquear, `app.js` genera el álbum y habilita la carga diferida de los medios. La música comienza solo al pulsar Reproducir.
4. La pantalla de espera comprueba la fecha hasta abrirse sin recargar al llegar el cumpleaños.
5. Sigue siendo una compuerta visual del cliente, no un control de acceso al contenido estático.

---

## Estado del proyecto

- [x] Compuerta de fecha (gate) — implementada en index.html
- [x] Página completa de cumpleaños — desplegada, en desarrollo continuo
- [x] GitHub Pages — activo en alekspaucar.github.io/Nicolehbd/
- [x] 56 recuerdos de `Anis/`, 64 medios y sus textos originales — versión autorizada para publicar (2026-10-18)
- [x] Álbum continuo, orden por fechas conocidas y etapas narrativas; controles simplificados
- [x] Bienvenida con confeti y animaciones suaves
- La bienvenida solo deja ver la página al pulsar «Ver mi sorpresa»; no cerrarla automáticamente ni omitirla al reducir movimiento.
- [x] Dedicatorias guardadas en el navegador, con reproductores incrustados — no compartidas entre dispositivos todavía
- [ ] Activar almacenamiento compartido Supabase: fuentes preparadas; falta conectar cuenta y crear/verificar proyecto
- [x] QR entregado a Nicole — conservar su URL actual
- [ ] Revisión final antes del 21 de octubre

---

## Notas importantes

- **NO hacer push sin revisar el gate** — Nicole puede escanear desde que tiene el QR
- El QR impreso es permanente — la URL no puede cambiar después de imprimirla
- `npm run dev` sirve la página con el gate intacto.
- `npm run preview` permite revisar todo en `http://127.0.0.1:4173/`: el servidor local añade `unlocked` únicamente a su respuesta, sin editar el archivo ni crear un desbloqueo público por URL.
- `npm run build` regenera el catálogo y los estilos; `npm run verify` comprueba el gate, cobertura y textos originales.
- Orden: `data/memory-order.json`. Fechas sin confirmar se dejan vacías; no inventar fechas.
- No commits ni pushes sin confirmación del usuario
- El usuario autorizó publicar esta versión el 2026-10-18. Mantener la URL del QR y el gate; excluir siempre `Anis/`, `.env*` y secretos. La autorización no se extiende automáticamente a publicaciones futuras.
- `musica.mp3` es la canción que Alexander le dedicó a Anis; se mantiene de fondo y voluntaria.
- Las dedicatorias se guardan en la página con enlace, mensaje y dirección. Ya no se usa Web Share ni WhatsApp.
- Configuración actual: `dedication-config.js`, modo `browser` (solo este navegador). El usuario eligió preparar Supabase para compartir entre dispositivos; el proyecto remoto aún no está creado ni conectado.
- El modo `api` usa una función Supabase protegida con clave de colección introducida al abrirla. Nunca poner la clave de colección ni service_role en archivos públicos.

---

## Archivos clave

- `index.html` — saludo + gate JS síncrono + estructura del álbum
- `app.js` — recuerdos, visor accesible, carga diferida y coordinación música/video
- `celebration.js` — bienvenida, confeti limitado y apariciones al desplazarse; respeta movimiento reducido
- `dedication.js` — normalización de enlaces y reproductores admitidos
- `dedication-store.js` — guardado local y adaptador de servicio compartido
- `dedication-gallery.js` — formulario, colección y reproducción dentro de la página
- `dedication-config.js` — selección del modo local/compartido (sin secretos)
- `supabase/` — servidor de dedicatorias y esquema pendientes de activar
- `memories.js` — catálogo generado; no editar directamente
- `data/memory-order.json` — títulos, orden y procedencia de fechas
- `styles.css` — Tailwind compilado (no editar directamente)
- `input.css` + `tailwind.config.js` — fuente de Tailwind
- `musica.mp3` — canción de fondo
- `media/` — copias optimizadas y portadas, con manifiesto técnico
- `Anis/` — originales y textos sin cambios
- `scripts/` — generación del catálogo/medios, servidor local y verificación
