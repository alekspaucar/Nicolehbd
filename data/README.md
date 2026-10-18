# Catálogo de recuerdos

`Anis/` conserva los originales. `memory-order.json` usa como claves los nombres exactos de sus 56 carpetas, incluidos los espacios finales. Cada entrada define un título de presentación, un orden explícito, una sección neutral y las fechas que se pudieron documentar. Los títulos no cambian el contenido de los textos.

Para generar el archivo clásico compatible con `file://`:

```sh
node scripts/build-memories.mjs
```

Para generar y verificar también los archivos optimizados:

```sh
node scripts/build-memories.mjs --require-media
```

El generador exige exactamente un archivo de texto sin extensión y al menos una imagen o vídeo por carpeta. Ignora únicamente `.DS_Store` y rechaza archivos, carpetas o enlaces inesperados. Conserva el texto original y sus saltos de línea; solo quita el espacio en blanco inicial y final. El archivo de texto de `parque motos` está vacío en el original.

Los medios se ordenan por nombre con el orden Unicode predeterminado de JavaScript, sin reglas de idioma. La carpeta se transforma con normalización NFD, eliminación de marcas diacríticas, minúsculas y guiones entre grupos alfanuméricos. Cada salida se llama `media/<slug>-<índice>.jpg` o `.mp4`, con índice desde 1. `originalSrc` conserva la ruta original con cada segmento codificado para URL. Las dimensiones y los pósteres proceden de `media/manifest.json`.

Las fechas usan `AAAA-MM-DD`, sin inventar una hora ni aplicar conversiones de zona horaria. `original-text` indica una fecha expresada en el texto; `source-media` indica la fecha documentada del medio. Una fecha del medio no fecha necesariamente todos los hechos mencionados en su texto. Un `null` significa que no se conoce con suficiente seguridad. Las capturas tomadas en septiembre y los contenedores sin fecha fiable del recuerdo no se usan para deducir fechas. `stalk` reúne varios días de febrero de 2026 y conserva solo el año.

El orden respeta las fechas conocidas y sitúa los recuerdos sin fecha por sus pistas de contexto. Esa posición es narrativa y no prueba un día ni un año. Las secciones son `Antes de todo`, `Los primeros recuerdos`, `Volver a encontrarnos` y `Lo cotidiano contigo`. `dateSource` se exporta para que la presentación distinga la fecha del archivo y la del relato; las notas de contexto quedan solo en los metadatos.
