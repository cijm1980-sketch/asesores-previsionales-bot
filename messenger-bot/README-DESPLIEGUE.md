# Cerebro del chatbot (código) + ManyChat como mensajero

Esta carpeta contiene un servidor que reemplaza casi todo el trabajo manual del
constructor visual de ManyChat. En ManyChat solo vas a crear **un bloque**
("External Request"); todo lo demás (menús, ramas, captura de datos, palabras
clave) vive en el archivo `flow.json`, que puedes editar sin tocar código.

Toda la lógica está probada y funcionando correctamente (menú → ramas →
captura de texto libre → confirmación, y también las palabras clave como
"modalidad 40" o "asesor"). El servidor está desplegado en un VPS propio
(Hetzner), no en Render.

## 1. Desplegar el servidor (VPS propio en Hetzner)

Infraestructura actual:

- Servidor: Hetzner, Ubuntu 24.04, hostname `vps-principal`, IP `62.238.35.1`
- Dominio: `asesoresprevisionales.com` (DNS gestionado en Hetzner DNS Console)
- HTTPS: certificado Let's Encrypt vía `certbot --nginx`, renovación automática
- Reverse proxy: nginx, escucha en 80/443 y redirige a `localhost:3000`
- Proceso: `pm2`, arrancado desde `ecosystem.config.js` (nombre del proceso:
  `asesores-bot`), configurado con `pm2 startup` para levantar solo si el
  servidor reinicia
- Variable de entorno `BRAIN_URL`: definida en `ecosystem.config.js`, apunta a
  `https://asesoresprevisionales.com/manychat-brain`. **Es obligatoria** — sin
  ella, los botones de respuesta rápida ("quick replies") del bot traen una
  URL interna (`localhost`) que ManyChat no puede alcanzar, y la conversación
  se rompe después del primer mensaje.
- Repositorio: clonado en `/opt/apps/asesores-previsionales-bot` vía SSH con
  una **deploy key** dedicada (`~/.ssh/deploy_asesores_bot` en el servidor)

**Primer despliegue (ya hecho):**

```bash
mkdir -p /opt/apps
cd /opt/apps
GIT_SSH_COMMAND="ssh -i ~/.ssh/deploy_asesores_bot" git clone git@github.com:cijm1980-sketch/asesores-previsionales-bot.git
cd asesores-previsionales-bot/messenger-bot
npm install
pm2 start ecosystem.config.js
pm2 save
```

**Para desplegar cambios nuevos** (en vez de "Manual Deploy" en Render), conéctate
por SSH al servidor y corre:

```bash
cd /opt/apps/asesores-previsionales-bot/messenger-bot
git pull
npm install
pm2 restart asesores-bot
```

`npm install` solo hace falta si `package.json` cambió (nuevas dependencias);
si solo cambiaste `flow.json` o algún `.js`, puedes saltarlo.

**Verificar que quedó bien:**

```bash
curl https://asesoresprevisionales.com/calculadora/ping
pm2 status
pm2 env 0
pm2 logs asesores-bot --lines 50
```

No hay tiempos de "despertar" como en el plan gratis de Render — el VPS corre
24/7 sin dormirse, así que ya no se necesita UptimeRobot para mantenerlo
despierto (aunque puede seguir siendo útil como monitor externo de
disponibilidad).

## 2. Configurar el bloque en ManyChat

1. En ManyChat, dentro del Flow que ya empezaste, agrega un bloque de tipo
   **"External Request"** (búscalo en el "+" de agregar bloque, dentro de
   la sección de acciones/lógica).
2. Configúralo así:
   - **Method**: POST
   - **URL**: `https://asesoresprevisionales.com/manychat-brain`
   - **Body** (tipo JSON), usando los "merge tags" que ManyChat te ofrece al
     escribir `{{`:
```json
     {
       "user_id": "{{user_id}}",
       "text": "{{last_input_text}}"
     }
```
     (El nombre exacto de estos tags puede variar un poco según la versión
     de ManyChat — busca en el selector de tags algo como "User ID" /
     "Subscriber ID" y "Last Text Input" / "Last User Message".)
3. Guarda ese bloque como el **paso inicial** de tu automatización (el que se
   dispara cuando alguien te escribe por primera vez).
4. **Prueba con el botón de vista previa de ManyChat.** Si todo va bien,
   deberías ver el mensaje de bienvenida con los 4 botones, y al tocar
   cualquiera, la conversación debería seguir avanzando sola — sin que tengas
   que crear un solo bloque más.

## 3. Si algo no encaja con el formato de ManyChat

Como el formato "Dynamic Content" no es la función más común de ManyChat, es
posible que algún nombre de campo no sea exactamente igual en tu cuenta. Si
al probar ves un error o los botones no continúan la conversación:

- Revisa el mensaje de error que muestra ManyChat en la vista previa —
  usualmente dice qué campo no reconoce.
- Como plan B, ManyChat también soporta un tipo de quick reply que apunta a
  "Node" (bloque) en vez de volver a llamar a la URL — en ese caso, en lugar
  de que cada botón llame de nuevo a tu servidor, tendrías que crear un único
  bloque adicional "El bucle" que vuelva a llamar al External Request, y
  todos los botones apuntarían a ese mismo bloque. Esto sigue siendo mucho
  menos trabajo manual que construir las 10+ ramas del guion original.
- Mándame captura del bloque de configuración o del error, y lo ajustamos
  juntos — es más fácil corregir un detalle puntual que adivinar el formato
  exacto sin verlo.

## 4. Editar el guion sin tocar código

Todo el contenido de la conversación está en `flow.json`. Para cambiar un
mensaje, agregar una rama nueva, o ajustar una palabra clave, edita ese
archivo, súbelo a GitHub (`git add`, `git commit`, `git push`) y despliega
el cambio en el servidor con `git pull` + `pm2 restart asesores-bot` (ver
sección 1).

Estructura de un nodo:

```json
"nombre_del_nodo": {
  "text": "Lo que el bot dice",
  "quick_replies": [
    { "title": "Texto del botón", "payload": "otro_nodo" }
  ]
}
```

- `capture_field` + `next`: espera que el usuario escriba texto libre, lo
  guarda en ese campo, y sigue al nodo indicado.
- `auto_next`: encadena automáticamente al siguiente nodo sin esperar
  respuesta (para mensajes informativos seguidos).
- `end: true`: termina la conversación en ese punto.
- `notify: true`: agrega la etiqueta `lead_calificado` (para que sepas que
  hay alguien listo para que un asesor le escriba).
