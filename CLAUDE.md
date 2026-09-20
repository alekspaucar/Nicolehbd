# Proyecto: Página de cumpleaños — Nicole

## Contexto general
Página web personal de cumpleaños para Nicole. Se entregará un ramo de flores amarillas
con una tarjeta que contiene un QR apuntando a esta página desplegada en GitHub Pages.

La tarjeta dirá: **"escanea cuando sea tu cumpleaños"**

**Fecha de cumpleaños: 21 de octubre de 2026**

---

## Estrategia de despliegue

La página usa **detección de fecha en JavaScript** para mostrar contenido diferente:

- **Antes del 21 de octubre:** muestra el mensaje de "paciencia"
  > "dije que escanees cuando sea tu cumpleaños no seas impaciente 🙄"

- **Desde el 21 de octubre en adelante:** muestra la página completa de cumpleaños

No se necesita hacer push manual el día del cumpleaños. Todo está contenido en un
solo `index.html` que se auto-gestiona por fecha.

---

## Estado del proyecto

- [ ] Página de "paciencia" (bloqueo pre-cumpleaños) — pendiente
- [ ] Página completa de cumpleaños — en desarrollo
- [ ] Despliegue en GitHub Pages — pendiente
- [ ] Generación del QR con la URL de GitHub Pages — pendiente

---

## Notas importantes

- El repositorio se llama `Nicolehbd` en GitHub
- Se entrega el ramo con tarjeta QR **antes del 21 de octubre** (hay ~1 mes de margen)
- No hacer cambios estructurales sin revisar que la detección de fecha sigue funcionando
- El QR en la tarjeta física NO se puede cambiar una vez impreso — la URL de GitHub Pages
  debe quedar fija desde el primer despliegue
- No commits ni pushes sin confirmación del usuario

---

## Archivos clave

- `index.html` — página principal, contiene toda la lógica de fecha y el contenido