# Dedicatorias compartidas con Supabase

Estado: fuentes preparadas y pruebas locales del servicio HTTP. No se ha creado ni conectado un proyecto de Supabase, no se ha ejecutado `schema.sql` y la función no está desplegada. Las pruebas sustituyen únicamente la API de almacenamiento; todavía falta comprobar los permisos y las solicitudes contra una base real.

La colección pertenece a Alexander y Anis. Quien conozca su clave compartida puede ver y añadir dedicatorias. La página pide esa clave en tiempo de uso y la envía por HTTPS en `x-collection-key`. La función verifica su SHA-256 antes de consultar la base. La clave de Supabase que permite acceder a la tabla se utiliza exclusivamente dentro de la función.

## Archivos

- `schema.sql`: instalación inicial de `public.song_dedications`, restricciones, RLS y permisos mínimos. Se ejecuta una vez y se detiene si la tabla ya existe.
- `functions/dedications/index.ts`: entrada de la Edge Function.
- `functions/dedications/handler.mjs`: autenticación, CORS, validación y acceso a la API de datos.
- `functions/dedications/song-parser.mjs`: archivo generado a partir del mismo `dedication.js` que usa la página. No se edita directamente.
- `config.toml`: configura `verify_jwt = false` porque la función autentica mediante la clave privada de la colección.

## Activación pendiente

1. Añade la integración de Supabase y conecta tu cuenta. Después crea un proyecto para esta página y selecciona ese proyecto para alojar la colección. En esta preparación no se ha creado ninguno.
2. En el SQL Editor de ese proyecto, revisa y ejecuta `supabase/schema.sql`. Mantén habilitada la Data API y `public` como esquema expuesto. La tabla tiene acceso explícito para `service_role`; `anon` y `authenticated` no tienen acceso ni políticas públicas. No concedas permisos públicos para solucionar un error de conexión.
3. Elige una clave aleatoria larga en un gestor de contraseñas y compártela por un canal privado. La función acepta entre 32 y 512 bytes UTF-8; una clave aleatoria de al menos 32 caracteres ASCII cumple ese requisito. Calcula su SHA-256 localmente y guarda solamente el resumen hexadecimal de 64 caracteres como `DEDICATIONS_KEY_SHA256` en **Edge Functions → Secrets**. Conserva la clave original en el gestor de contraseñas para introducirla en la página. No la pegues en la configuración pública, el repositorio, las URL ni los registros.
4. Añade allí `DEDICATIONS_ALLOWED_ORIGINS` con los orígenes exactos, sin rutas ni barra final:

   ```text
   https://alekspaucar.github.io,http://localhost:4173,http://localhost:4174
   ```

   Si utilizas otro dominio o una vista previa en `127.0.0.1`, añade su origen exacto. No se admiten comodines. Las solicitudes sin `Origin` también se rechazan.
5. La plataforma proporciona `SUPABASE_URL` y sus credenciales privadas a la función. El servicio utiliza `SUPABASE_SERVICE_ROLE_KEY` cuando está disponible y, en proyectos con claves modernas, `SUPABASE_SECRET_KEYS.default`. Ninguno de estos valores se copia a la página ni se configura como secreto personalizado con el prefijo reservado `SUPABASE_`.
6. Regenera el parser antes de desplegar:

   ```sh
   node scripts/build-dedication-backend.mjs
   node scripts/build-dedication-backend.mjs --check
   node --test scripts/dedication-backend.test.mjs
   ```

7. Instala y autentica la CLI oficial si vas a desplegar desde este repositorio. La CLI no está instalada en este entorno. Consulta primero `supabase --help` y la ayuda de la operación que vayas a utilizar; sigue la documentación actual de despliegue para enlazar el proyecto y publicar la función `dedications`, incluyendo sus módulos locales. Debe conservarse `verify_jwt = false`; esta opción no reemplaza la validación de `x-collection-key` implementada en el servicio.
8. Antes de activar la página, verifica en el proyecto real: una clave incorrecta devuelve 401; la clave correcta permite guardar y leer; repetir la misma canción, destinatario y mensaje devuelve el mismo identificador; `anon` y `authenticated` no pueden leer ni insertar directamente en la tabla. Comprueba también que el dominio de la página coincide con la lista de orígenes permitidos.
9. Cuando esas verificaciones pasen, configura únicamente la URL pública de la función en `dedication-config.js`:

   ```js
   window.DEDICATIONS_CONFIG = {
     mode: 'api',
     endpoint: 'https://TU_PROYECTO.supabase.co/functions/v1/dedications'
   };
   ```

   La clave compartida se introduce en el formulario de la página. Las dedicatorias guardadas en un navegador siguen siendo locales hasta que se envíen al servicio; cambiar la configuración no las importa automáticamente.

## Contrato HTTP

Todas las solicitudes de lectura y escritura necesitan un `Origin` permitido y la cabecera `x-collection-key`. La función no necesita una clave pública de Supabase en el navegador. `OPTIONS` permite las comprobaciones previas de CORS sin solicitar la clave de la colección.

| Solicitud | Resultado |
| --- | --- |
| `GET` | `200 { "dedications": [registro] }`, con las canciones más recientes primero |
| `POST` con JSON `{ "url", "message", "direction" }` | `201 { "dedication": registro }` |
| Repetición de una dedicatoria canónica | `200 { "dedication": registroExistente }` |
| Clave ausente o incorrecta | `401 { "error": "…" }` antes de consultar la base |
| Origen no permitido | `403`, sin cabecera CORS de acceso |
| JSON o canción no válidos | `400 { "error": "…" }` |
| Cuerpo mayor de 16 KiB / tipo de contenido incorrecto | `413` / `415` |
| Configuración del servidor incompleta / fallo de almacenamiento | `503` / `502` con un mensaje sin detalles privados |

Un registro contiene `id` como texto, `createdAt`, `url`, `provider`, `embedUrl`, `message`, `direction` y `title`. `direction` admite únicamente `to-alexander` o `to-anis`. El servicio valida el enlace, limita el mensaje a 1000 caracteres y calcula los reproductores a partir del enlace en cada lectura. La base no almacena HTML ni una URL de reproductor proporcionada por el cliente. Una restricción única sobre la huella SHA-256 evita duplicados incluso con envíos simultáneos.

## Referencias oficiales

- [Autenticación de Edge Functions](https://supabase.com/docs/guides/functions/auth)
- [Variables y secretos de Edge Functions](https://supabase.com/docs/guides/functions/secrets)
- [CORS para funciones](https://supabase.com/docs/guides/functions/cors)
- [Protección de la Data API: permisos y RLS](https://supabase.com/docs/guides/api/securing-your-api)
- [Despliegue de funciones](https://supabase.com/docs/guides/functions/deploy)
