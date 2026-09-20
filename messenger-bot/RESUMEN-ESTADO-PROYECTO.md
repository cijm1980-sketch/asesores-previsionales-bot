# Asesores Previsionales MX — Estado del proyecto

**Última actualización:** 20 de septiembre de 2026

---

## 1. Infraestructura en producción

| Componente | Estado | Detalle |
|---|---|---|
| Servidor Node.js | ✅ Live | Hetzner VPS, pm2 + nginx + HTTPS |
| Repositorio | ✅ | `cijm1980-sketch/asesores-previsionales-bot`, rama `main` |
| URL base | ✅ | `https://asesoresprevisionales.com` |
| Monitoreo | ✅ | UptimeRobot (alertas de caída; ya no es necesario para evitar que se duerma — pm2 en VPS propio corre 24/7) |
| ManyChat | ✅ Pro | Solicitudes externas habilitadas |
| Canal | ✅ | Messenger (Facebook Page) |

**Último commit desplegado:** `4d5c2d7` — "Documentar ecosystem.config.js y variable BRAIN_URL para despliegue en VPS" (en producción en Hetzner vía pm2 + Nginx + Let's Encrypt; verificado 20-sep-2026 con `/calculadora/ping` respondiendo en vivo en `https://asesoresprevisionales.com`)

---

## 2. Archivos del proyecto

```
messenger-bot/
├── server-manychat.js      # Servidor principal (bot conversacional)
├── flow.json               # Contenido del chatbot general
├── calculo-pension.js      # Lógica de cálculo Ley 73 / diagnóstico Ley 97
├── ruta-calculadora.js     # Endpoints de la calculadora
├── flujo-manychat.md       # Guía de armado del flujo en ManyChat
└── package.json
```

**Conexión en `server-manychat.js`:**
```js
const calculadora = require('./ruta-calculadora');
app.use('/calculadora', calculadora);
```

---

## 3. Calculadora de pensión

### Endpoints

| Ruta | Método | Función |
|---|---|---|
| `/calculadora/ping` | GET | Verificar que el módulo cargó |
| `/calculadora/ley` | POST | Determina Ley 73, 97 o ambiguo |
| `/calculadora/estimar` | POST | Estimación (73) o diagnóstico (97) |
| `/calculadora/modalidad40` | POST | Gancho comercial de Modalidad 40 |

### Valores de configuración (CONFIG en `calculo-pension.js`)

| Variable | Valor 2026 | Fuente | Actualizar |
|---|---|---|---|
| `UMA_DIARIA` | 117.31 | INEGI, vigente 1-feb-2026 | Cada febrero |
| `SALARIO_MINIMO_DIARIO` | 315.04 | CONASAMI, vigente 1-ene-2026 | Cada enero |
| `FACTOR_INCREMENTO_2001` | 1.11 | Decreto 2001 | Verificar |
| `TOPE_UMAS` | 25 | Tope legal Ley 73 | Fijo |

### Lógica de negocio

**Bifurcación por año de primer registro al IMSS:**
- Antes de 1997 → **Ley 73** (3 preguntas: edad, semanas, salario)
- Después de 1997 → **Ley 97** (2 preguntas: edad, semanas)
- Exactamente 1997 → **ambiguo**, se detiene y pide revisión manual

**Ley 73:** cálculo real con tabla del Artículo 167 LSS 1973 (cuantía básica +
incrementos por semanas excedentes a 500), factor por edad de retiro (Art. 171:
60 años = 75%, hasta 65 años = 100%), tope de 25 UMAs y pensión mínima
garantizada. Devuelve un rango ±12%.

**Ley 97:** no devuelve monto (depende del saldo de Afore). Solo diagnostica si
cumple el mínimo de semanas del año en curso (875 en 2026, sube 25 cada año
hasta 1,000 en 2031).

---

## 4. Configuración en ManyChat

### Campos de usuario (carpeta `calculadoraIMSS`)

Todos tipo **Texto**, para tolerar entradas informales:

`anio_registro_imss`, `ley_aplicable`, `edad_actual`, `semanas_cotizadas`,
`salario_promedio`, `pension_estimada`, `whatsapp_contacto`

### Tags

| Tag | Cuándo se aplica |
|---|---|
| `lead_calificado` | Completó la calculadora |
| `lead_prioritario` | Cumple requisitos, listo para asesoría |
| `lead_exploratorio` | Le faltan semanas o datos |
| `ley_73` / `ley_97` | Segmentación por régimen |
| `interes_modalidad40` | Vio el gancho de M40 |
| `revision_manual` | Caso ambiguo (1997) |
| `contacto_capturado` | Aceptó la revisión |

Los tags los aplica **el servidor** vía `actions`, no el flujo visual.

### Estructura del flujo

```
Disparador: calcular / calculadora / cuanto / cuánto / pension / pensión / estimar
  ↓
mensajeBienvenida [botón Empezar]
  ↓
mensajeAlta (pregunta año) → guarda anio_registro_imss
  ↓
servicioAlta → POST /calculadora/ley
  ↓
condicionAmbiguo97 (ley_aplicable es ambiguo)
  ├─ Sí → mensaje revisión + tag revision_manual [FIN]
  └─ No ↓
condicion73 (ley_aplicable es 73)
  ├─ Sí → mensajeEdad73 → Semanas73 → mensajeSalario
  └─ No → mensajeEdad97 → mensajeSemanas97
              ↓ (ambas convergen)
mensajeCalcula → POST /calculadora/estimar
  ↓
condicionM40 (ley_aplicable es 73)
  ├─ Sí → mensajeM40 → POST /calculadora/modalidad40
  └─ No ↓
mensajeRevision [2 botones]
  ├─ "Sí, revisión" → mensajeCaptura → tag contacto_capturado
  └─ "No, curiosidad" → mensajeCierre
```

### Lecciones aprendidas del armado

1. **Las solicitudes externas deben ir en un paso de tipo Messenger**, no dentro
   de un bloque "Realizar acciones". El bloque de acciones solo soporta mapeo de
   respuesta y descarta los mensajes del servidor.
2. **Encadenar por "Siguiente paso"**, no por "Acción en respuesta". Si ambas
   salidas están conectadas, el flujo avanza sin esperar la respuesta del servidor.
3. **"Mapeo de respuesta" se deja vacío.** El servidor devuelve formato nativo
   `{"version":"v2","content":{...}}` y ManyChat lo interpreta automáticamente.
4. **La vista previa no ejecuta solicitudes externas.** Muestra "Dynamic block
   can't be previewed" — hay que probar en Messenger real.
5. **Los campos se insertan con el botón `{+}`**, no escribiéndolos a mano.
   ManyChat los convierte a IDs internos (`cuf_XXXXXXX`).

---

## 5. Validación en producción

| Caso | Entrada | Resultado | Estado |
|---|---|---|---|
| Ley 73 | 1985 / 64 / 1500 / 25000 | $14,007 — $17,827 + gancho 95% | ✅ (validado antes del fix de factor 30.4) |
| Ley 97 | 2010 / 45 / 600 | Faltan 275 semanas (de 875) | ✅ |
| Ambiguo | 1997 | Mensaje de revisión, se detiene | ✅ |
| Modalidad 40 | — | 200 OK, aplica tag | ✅ |

**Re-validado el 11-sep-2026 tras las correcciones técnicas (sección 6), con los
mismos casos, simulando las rutas con Node directamente (sin desplegar aún):**

| Caso | Entrada | Resultado | Estado |
|---|---|---|---|
| Ley 73 | 1985 / 64 / 1500 / 25000 | $13,823 — $17,592 (antes $14,007—$17,827; baja ~1.3% por el factor 30.4, correcto) | ✅ |
| Ley 97 | 2010 / 45 / 600 | Faltan 275 semanas (de 875) — sin cambio | ✅ |
| Ambiguo | 1997 | Mensaje de revisión, se detiene — sin cambio | ✅ |
| Piso de pensión mínima | salario 20000 / 500 semanas / edad 60 | $10,631/mes (antes $9,451; el piso ya incluye el Factor Fox) | ✅ |
| Modalidad 40 | 1500 sem / $25,000 / edad 64 | Tope de salario M40 ahora usa UMA 117.31 (antes 113.14 hardcodeado) | ✅ |

**Confirmado (20-sep-2026):** despliegue real completado — no en Render, sino en el VPS
de Hetzner (ver migración en sección 6). Verificado end-to-end: `/calculadora/ping`
responde en `https://asesoresprevisionales.com`, ManyChat ya apunta a ese dominio en
los bloques de solicitud externa, y el proceso corre con pm2 sin caídas reportadas.

---

## 6. Cambios recientes (11-sep-2026)

Correcciones técnicas aplicadas en `calculo-pension.js` y `ruta-calculadora.js`:

| Cambio | Antes | Ahora | Impacto |
|---|---|---|---|
| Factor días/mes | `/30` fijo | `CONFIG.DIAS_POR_MES = 30.4` (365÷12) | Pensión Ley 73 baja ~1.3% (más precisa) |
| Piso de pensión mínima garantizada | `SALARIO_MINIMO_DIARIO * 30` (sin Factor Fox) | `SALARIO_MINIMO_DIARIO * 30.4 * FACTOR_INCREMENTO_2001` | El piso subía ~11% menos de lo real. Con valores 2026: pasó de $9,451 a ~$10,631/mes (cifra oficial publicada: $10,636.54) |
| UMA en tope de Modalidad 40 | Hardcodeado `113.14` (desactualizado) | `CONFIG.UMA_DIARIA` (117.31, vigente) | El tope de salario M40 usaba un UMA de un año anterior |

**Verificado con investigación (11-sep-2026):**
- `UMA_DIARIA` (117.31) y `SALARIO_MINIMO_DIARIO` (315.04) vigentes para 2026: correctos, confirmados con INEGI/CONASAMI.
- `FACTOR_INCREMENTO_2001` (1.11): correcto. Es el "Factor Fox", decreto presidencial del 20/dic/2001. Se aplica tanto a la pensión calculada como al piso de pensión mínima garantizada (esto último NO se estaba haciendo — ver tabla arriba).
- Se agregó `SALARIO_MINIMO_DIARIO_ZLFN` (440.87) a `CONFIG` como referencia para la Zona Libre de la Frontera Norte, pero **no está conectado al flujo** — el bot no pregunta la zona del usuario. Solo es relevante si se decide atender activamente esa zona.

Todos los casos de validación de la sección 5 se volvieron a correr con estos
cambios (ver detalle abajo); los resultados están dentro del rango esperado.

## 6.1 Migración de infraestructura: Render → Hetzner VPS (17/18-sep-2026)

- Servidor movido de Render (plan gratuito) a un VPS propio de Hetzner
  (`vps-principal`, Ubuntu 24.04, CX23).
- Repo clonado en `/opt/apps/asesores-previsionales-bot` usando una deploy key
  SSH dedicada (`~/.ssh/deploy_asesores_bot`), no las credenciales personales.
- Proceso gestionado con **pm2** (nombre `asesores-bot`), con `pm2 save` +
  `pm2 startup` configurados para que arranque solo si el VPS se reinicia.
- **Nginx** como reverse proxy + certificado **HTTPS de Let's Encrypt** para
  el dominio propio `asesoresprevisionales.com` (ya no se depende del
  subdominio `.onrender.com`).
- Los bloques "External Request" en ManyChat ya apuntan al nuevo dominio.
- **Verificado en vivo el 20-sep-2026:** `/calculadora/ping` responde
  correctamente en `https://asesoresprevisionales.com`, y el código
  desplegado coincide exactamente con el commit más reciente de `main`
  (incluye las tres correcciones técnicas del 11-sep: factor 30.4, Factor
  Fox en el piso mínimo, y UMA vigente en Modalidad 40).
- **Pendiente de decidir:** si Render se apaga/pausa o se conserva un tiempo
  como respaldo.

## 6.2 Verificación de cumplimiento: NSS (19-sep-2026)

Carlos Iván planteó la duda de si el bot pide el NSS (dato personal, riesgo
de incumplimiento). Se revisó el código completo:

- `flow.json` no tiene ningún campo ni pregunta que capture el NSS.
- El mensaje de bienvenida de la calculadora ya lo aclara explícitamente:
  *"No te pido tu NSS ni ningún dato sensible."*
- Las únicas menciones de datos oficiales del IMSS son sobre el **CURP**, y
  solo como referencia para que el usuario consulte sus propias semanas en
  la app IMSS Digital — el bot no lo pide ni lo guarda.
- El commit histórico `3112724` ("...sugerencia de captura NSS") fue
  revisado: a pesar del título, nunca implementó captura de NSS.
- **Conclusión:** no hay nada que corregir en el código sobre este punto.
  Se ofreció redactar un aviso de privacidad simplificado para los otros
  datos que sí se capturan (nombre, WhatsApp, ciudad, salario), pero Carlos
  Iván decidió no hacerlo por ahora — tema cerrado.

## 7. Pendientes

### Técnicos
- **Simulación de Modalidad 40:** el modelo pondera el salario nuevo contra las
  últimas 250 semanas. Es aproximado; no presentar como número exacto (ya se
  redacta así en el mensaje al usuario).
- **Zona Libre de la Frontera Norte:** el valor ya está en `CONFIG`, pero falta
  decidir si el bot debe preguntar la zona y cuándo usar ese salario mínimo en
  vez del general.

### Nota de precaución: reingreso y modificación de salario en Modalidad 40
Al investigar (11-sep-2026) si había cambios confirmados a Modalidad 40 para 2026,
encontramos mucho contenido de baja calidad en internet (varios artículos de
"ambito.com" repiten el mismo titular con un mes distinto cada vez —marzo, abril,
junio, julio— sin citar ningún decreto ni boletín oficial). Separamos lo verificable
de lo que no:

**Confirmado oficialmente** (Boletín 272 del IMSS, 2-jun-2025,
[gob.mx/imss/prensa](https://www.gob.mx/imss/prensa/implementa-imss-mecanismo-de-supervision-para-garantizar-atencion-transparente-y-eficiente-a-personas-aseguradas-en-modalidad-40)):
supervisión bimestral de las Jefaturas de Afiliación y Cobranza sobre reingresos,
salarios registrados y semanas cotizadas, más un nuevo mecanismo de pago vía HSBC.
Los requisitos de fondo NO cambiaron (52 semanas en los últimos 5 años, sin
aseguramiento vigente como trabajador, tope de 25 UMAs) — coincide con lo que ya
tiene programado `calculo-pension.js`.

**Sin confirmar oficialmente pero relevante para la asesoría en vivo:** una nota
(aforeyfinanzas.com, sin cita a documento del IMSS) afirma que desde el 4 de
septiembre el IMSS aplica un criterio más estricto sobre una práctica común:
inscribirse en M40 con un salario bajo para después subirlo. Según esa nota, el
derecho de reingreso (Art. 220 LSS) se mantiene, pero un reingreso YA NO
garantizaría automáticamente el derecho a modificar el salario de cotización.

**Acción recomendada:** antes de que un asesor le diga a un lead que puede
inscribirse con salario bajo y subirlo más adelante vía reingreso, debe confirmarlo
directamente con el IMSS (o con el contador/actuario del equipo) — no dar ese
consejo solo con base en artículos de prensa no oficiales. No se modificó la lógica
de `simularModalidad40` ni el mensaje del bot por este punto, ya que el escenario
que simula (salario más alto sostenido, no un truco de reingreso) no se ve afectado.

**Actualización (14-sep-2026):** se revisó un artículo más de ambito.com con el
mismo patrón ("IMSS confirma cambios en Modalidad 40... octubre 2026"). Confirmamos
que es el mismo reciclaje de titular (ya van mayo, junio, julio y ahora octubre) sin
fuente oficial citada, y el propio texto admite que los "cambios" ya aplican desde
enero de 2026 — no hay nada nuevo. Sí se verificó un dato real mencionado ahí: la
cuota mensual de Modalidad 40 para 2026 es **14.438% del salario registrado**
(Art. 218 LSS), parte de un incremento gradual ya programado desde la reforma de
2020 al seguro de Invalidez, Vejez, Cesantía y Muerte (~1.09 puntos porcentuales
por año; sube a 15.528% en 2027). Es dato correcto pero no es una noticia de
octubre — es el mismo % vigente desde enero. No requiere ningún cambio de código:
el bot no cotiza el costo mensual de M40, solo compara la pensión resultante.
**Recomendación:** seguir sin usar ambito.com como fuente para contenido o
asesoría — el patrón de titulares reciclados con fecha cambiada resta credibilidad
si un lead lo detecta.

### Comerciales
- Google Business Profile (no iniciado)
- Distribución orgánica en grupos de Facebook
- Versión web de la calculadora (indexable en Google, tráfico orgánico)
- Replicar contenido a Instagram

---

## 8. Contenido producido

- Carrusel "4 cambios importantes en tu pensión 2026" (5 slides, publicado)
- Reel vertical del mismo tema, 13.4s, CTA visible desde el segundo 0
  (corrige el problema de retención detectado: de 1.8k vistas, solo 210
  llegaban a 3 segundos y ninguna al minuto)
- Video corto "¿Sabes cuánto vas a recibir de pensión?" (13-sep-2026, listo para
  publicar, aún no publicado): 5 tarjetas verticales 1080x1920 con el mismo estilo
  de marca (azul marino/dorado), gancho visible desde el segundo 0, sin cifras de
  pensión (para no restar valor a la calculadora), CTA final "Escríbenos
  'CALCULAR'" — coincide con las palabras clave ya programadas en el bot. Falta
  agregarle música/voz en edición (se entregó sin audio) y subir el copy de
  publicación sugerido.

**Temas cubiertos:** reducción de edad ISSSTE (56 mujeres / 58 hombres),
incremento de semanas IMSS (+25 anuales hacia 1,000 en 2031), fallo SCJN sobre
concubinas, Fondo de Pensiones para el Bienestar, y la importancia de saber el
monto estimado de tu pensión (nuevo video).

---

## 9. Comandos frecuentes

```bash
# Subir cambios
git add .
git commit -m "descripcion"
git push

# Si el remoto tiene cambios (ej. edición desde GitHub web)
git pull    # en Vim: Esc, :wq, Enter
git push
```

**Deploy:** SSH al servidor → `git pull` → `npm install` (si aplica) → `pm2 restart asesores-bot`

**Verificar:** `https://asesoresprevisionales.com/calculadora/ping`
