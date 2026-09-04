# Cerebro del chatbot (código) + ManyChat como mensajero

Esta carpeta contiene un servidor que reemplaza casi todo el trabajo manual del
constructor visual de ManyChat. En ManyChat solo vas a crear **un bloque**
("External Request"); todo lo demás (menús, ramas, captura de datos, palabras
clave) vive en el archivo `flow.json`, que puedes editar sin tocar código.

Ya probé toda la lógica en este entorno y funciona correctamente (menú →
ramas → captura de texto libre → confirmación, y también las palabras clave
como "modalidad 40" o "asesor"). Lo que falta es desplegarlo en un lugar con
URL pública, y conectar ManyChat a esa URL.

## 1. Desplegar el servidor (Render.com, gratis)

1. Crea una cuenta gratis en https://render.com (puedes entrar con GitHub).
2. Sube esta carpeta (`server-manychat.js`, `flow.json`, `package.json`) a un
   repositorio nuevo en GitHub. Si no usas Git normalmente, la forma más
   simple es: crea un repo vacío en github.com > "uploading an existing
   file" > arrastra los 3 archivos.
3. En Render: **New > Web Service** > conecta ese repositorio.
4. Configuración del servicio:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server-manychat.js`
   - **Plan**: Free
5. En "Environment Variables" agrega:
   - `BRAIN_URL` = `https://TU-SERVICIO.onrender.com/manychat-brain`
     (usa el dominio que Render te asigna; lo ves después del primer deploy,
     y luego regresas aquí a completar esta variable y vuelves a desplegar)
6. Dale "Create Web Service". En unos minutos vas a tener una URL como:
   `https://asesores-previsionales-bot.onrender.com`

Nota: el plan gratis de Render "duerme" el servicio si no recibe tráfico por
un rato, y tarda unos segundos en despertar en el siguiente mensaje. Para un
volumen bajo de conversaciones (como en la semana de lanzamiento) esto no es
un problema real, solo un pequeño retraso ocasional en la primera respuesta.

## 2. Configurar el bloque en ManyChat

1. En ManyChat, dentro del Flow que ya empezaste, agrega un bloque de tipo
   **"External Request"** (búscalo en el "+" de agregar bloque, dentro de
   la sección de acciones/lógica).
2. Configúralo así:
   - **Method**: POST
   - **URL**: `https://TU-SERVICIO.onrender.com/manychat-brain`
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
archivo y vuelve a desplegar en Render (o activa "Auto-Deploy" desde GitHub
para que se actualice solo con cada cambio que subas).

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
