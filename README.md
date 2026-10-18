# Para ti, Anis

Página de cumpleaños y álbum personal. El enlace del QR y el desbloqueo del 21 de octubre de 2026 se conservan. El usuario autorizó publicar esta versión el 18 de octubre de 2026; futuras publicaciones requieren una nueva indicación. Los originales de `Anis/` se conservan solo en este equipo, fuera del repositorio; se publican sus copias optimizadas en `media/`.

## Ver la página localmente

```sh
npm run preview
```

Abrir `http://127.0.0.1:4173/`. Esta vista permite revisar todo antes del cumpleaños: el servidor local modifica únicamente la respuesta HTML. No cambia la compuerta del archivo ni añade un parámetro de desbloqueo a la web publicada.

Para comprobar la pantalla de espera, usar `npm run dev` (detener antes la vista previa, o elegir otro puerto con `PORT=4174 npm run dev`). El servidor escucha solo en este equipo.

## Contenido y estilos

- `Anis/`: fotos, videos y textos originales, conservados sin cambios.
- `data/memory-order.json`: títulos y orden narrativo que respeta las fechas conocidas. Las ubicaciones sin fecha son aproximadas; sus textos no se reescriben.
- `media/`: copias ligeras para la web, videos H.264/AAC y portadas.
- `memories.js`: catálogo generado con todos los textos y medios.
- `app.js`: álbum, música, visor de fotos y carga diferida.
- `input.css`: estilos fuente; `styles.css` es el resultado compilado.

```sh
npm run build
npm run verify
```

El generador usa los originales locales y `media/manifest.json`. Si se agregan recuerdos, completar el orden en `data/memory-order.json`. En macOS, `node scripts/prepare-media.mjs` regenera los medios con las herramientas nativas; después, ejecutar `npm run build`. Los archivos estáticos ya generados funcionan sin Node ni servidor especial.

Las fechas originales de los medios se muestran por mes y año; solo se presenta el día exacto cuando está expresado en el texto. Las capturas de pantalla no se fechan por el día en que se recopilaron.

La página descarga fotos y portadas al acercarse a ellas. Los videos se descargan al reproducirlos y la canción comienza solo al pulsar Reproducir. Al reproducir un video se pausa la canción, que vuelve cuando se pausa o termina el video. El visor de fotos se cierra con el botón, con Escape o tocando fuera de la imagen.

Al abrirse el cumpleaños se muestra una bienvenida con confeti. La bienvenida permanece hasta pulsar «Ver mi sorpresa»: no se cierra por tiempo, Escape ni al cambiar de pestaña. Reducir movimiento detiene los efectos, pero conserva la bienvenida y su botón. Los recuerdos aparecen suavemente al desplazarse.

`musica.mp3` es la canción de fondo que Alexander le dedicó a Anis. En «Canciones que nos dedicamos» se pega un enlace completo de canción, se elige quién la dedica y se añade un mensaje opcional. «Guardar canción» la agrega a la colección; «Escuchar aquí» muestra el reproductor del servicio dentro de la página. Solo se carga un reproductor a la vez y se pausa el audio de fondo para evitar dos canciones simultáneas. Si el servicio restringe la reproducción incrustada, queda el enlace para abrir la canción original.

## Guardado de dedicatorias

La configuración actual es `mode: 'browser'` en `dedication-config.js`: los enlaces y mensajes permanecen en este navegador después de recargar. La pantalla lo indica claramente. No se abre el menú para compartir ni WhatsApp. Los errores de almacenamiento conservan el formulario y no muestran un falso mensaje de guardado.

El guardado compartido con Supabase está preparado en `supabase/`, pero todavía necesita un proyecto y una conexión a la cuenta del usuario. No se ha creado, desplegado ni probado ninguna base de datos remota. Ver [preparación de Supabase](supabase/README.md). Al activarlo se cambia a `mode: 'api'` con la URL de la función; el navegador solicita la clave de la colección. Las credenciales administrativas permanecen únicamente en los secretos del servidor. Si el servicio falla, no se guarda silenciosamente en local ni se indica que la canción está compartida.
