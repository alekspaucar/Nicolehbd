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
- Material Symbols (Google Icons)
- Google Fonts: Playfair Display + Plus Jakarta Sans
- Sin frameworks JS — vanilla puro
- Música: `musica.mp3` en raíz
- Imágenes: carpeta `img/`

---

## Estrategia de despliegue (DATE GATE)

La página usa **detección de fecha en JavaScript síncrono** en `<head>`.

- **Antes del 21 de octubre de 2026:** pantalla de "paciencia" (🌻 gate)
- **Desde el 21 de octubre en adelante:** página completa automáticamente, sin push manual

### Cómo funciona el gate (ya implementado)
1. Script síncrono en `<head>` (línea ~50) agrega clase `unlocked` a `<html>` si fecha >= 21 oct
2. `<div id="gate">` es el primer hijo de `<body>` — cubre todo con `position:fixed; z-index:9999`
3. `.unlocked #gate { display:none }` oculta el gate antes de renderizar cualquier cosa
4. Sin `unlocked`: Nicole solo ve el mensaje de paciencia con las flores amarillas

---

## Estado del proyecto

- [x] Compuerta de fecha (gate) — implementada en index.html
- [x] Página completa de cumpleaños — desplegada, en desarrollo continuo
- [x] GitHub Pages — activo en alekspaucar.github.io/Nicolehbd/
- [ ] Fotos/videos personalizados finales — pendiente
- [ ] QR generado e impreso en tarjeta — pendiente
- [ ] Revisión final antes del 21 de octubre

---

## Notas importantes

- **NO hacer push sin revisar el gate** — Nicole puede escanear desde que tiene el QR
- El QR impreso es permanente — la URL no puede cambiar después de imprimirla
- Para probar el gate localmente: cambiar `'2026-10-21'` a una fecha futura en línea ~50
- Para ver la página completa: cambiar a fecha pasada (ej. `'2020-01-01'`)
- No commits ni pushes sin confirmación del usuario

---

## Archivos clave

- `index.html` — todo el contenido + gate CSS/JS en `<head>` + `<div id="gate">` como primer hijo de `<body>`
- `styles.css` — Tailwind compilado (no editar directamente)
- `input.css` + `tailwind.config.js` — fuente de Tailwind
- `musica.mp3` — canción de fondo
- `img/` — fotos y videos
