# Calculadora de pensión — Flujo ManyChat

## 1. Campos personalizados a crear

En ManyChat → Settings → Custom Fields, crear estos campos de texto:

| Campo | Tipo | Para qué |
|---|---|---|
| `anio_registro_imss` | Texto | Año del primer registro al IMSS |
| `ley_aplicable` | Texto | Lo llena el servidor: 73, 97 o ambiguo |
| `edad_actual` | Texto | Edad del usuario |
| `semanas_cotizadas` | Texto | Semanas cotizadas |
| `salario_promedio` | Texto | Salario mensual bruto (solo Ley 73) |
| `pension_estimada` | Texto | Lo llena el servidor |
| `whatsapp_contacto` | Texto | Teléfono capturado al final |

## 2. Tags a crear

`lead_calificado`, `lead_prioritario`, `lead_exploratorio`, `ley_73`, `ley_97`,
`interes_modalidad40`, `revision_manual`, `contacto_capturado`

---

## 3. Secuencia de pasos

### Paso 0 — Entrada

Disparadores de palabra clave: `calcular`, `calculadora`, `cuanto`, `pension`,
`cuánto`, `estimar`

**Mensaje:**

> 🧮 Calculadora de pensión
>
> Te doy una estimación en menos de 2 minutos. Solo necesito 3 o 4 datos.
>
> No te pido tu NSS ni ningún dato sensible.

**Botón:** `Empezar` → siguiente paso

---

### Paso 1 — Año de registro

**Bloque:** Recopilación de datos (Pregunta abierta) → guardar en `anio_registro_imss`

**Mensaje:**

> Primera pregunta, la más importante 👇
>
> ¿En qué año te diste de alta por primera vez en el IMSS?
>
> Escríbelo con 4 dígitos. Ejemplo: 1992
>
> 💡 Si no lo recuerdas exacto, pon el aproximado.

**Después:** Bloque External Request

- Método: `POST`
- URL: `https://asesores-previsionales-bot.onrender.com/calculadora/ley`
- Body (JSON):
```json
{ "anio_registro_imss": "{{anio_registro_imss}}" }
```
- Respuesta: **Respuesta dinámica** (Dynamic response)

---

### Paso 2A — Preguntas Ley 73

*(Condición: `ley_aplicable` = 73)*

**Pregunta 1** → `edad_actual`

> ¿Cuántos años tienes actualmente?
>
> Solo el número. Ejemplo: 62

**Pregunta 2** → `semanas_cotizadas`

> ¿Cuántas semanas tienes cotizadas?
>
> Solo el número. Ejemplo: 1250
>
> 💡 ¿No las sabes? Consúltalas gratis en IMSS Digital o en gob.mx con tu CURP.
> Regresa aquí cuando las tengas.

**Pregunta 3** → `salario_promedio`

> Última pregunta 👍
>
> ¿Cuál es tu sueldo MENSUAL bruto aproximado?
>
> El de los últimos años, antes de descuentos. Ejemplo: 18000

---

### Paso 2B — Preguntas Ley 97

*(Condición: `ley_aplicable` = 97)*

**Pregunta 1** → `edad_actual`

> ¿Cuántos años tienes actualmente?
>
> Solo el número. Ejemplo: 58

**Pregunta 2** → `semanas_cotizadas`

> ¿Cuántas semanas tienes cotizadas?
>
> Solo el número. Ejemplo: 900
>
> 💡 ¿No las sabes? Consúltalas gratis en IMSS Digital o en gob.mx con tu CURP.

---

### Paso 3 — Resultado (External Request)

- Método: `POST`
- URL: `https://asesores-previsionales-bot.onrender.com/calculadora/estimar`
- Body:
```json
{
  "ley_aplicable": "{{ley_aplicable}}",
  "edad_actual": "{{edad_actual}}",
  "semanas_cotizadas": "{{semanas_cotizadas}}",
  "salario_promedio": "{{salario_promedio}}"
}
```
- Respuesta: **Respuesta dinámica**

El servidor devuelve el resultado y aplica los tags automáticamente.

---

### Paso 4 — Gancho Modalidad 40

*(Solo si `ley_aplicable` = 73)*

- Método: `POST`
- URL: `https://asesores-previsionales-bot.onrender.com/calculadora/modalidad40`
- Body:
```json
{
  "semanas_cotizadas": "{{semanas_cotizadas}}",
  "salario_promedio": "{{salario_promedio}}",
  "edad_actual": "{{edad_actual}}"
}
```

---

### Paso 5 — Captura de contacto

**Mensaje con botones:**

> 📞 ¿Quieres tu cálculo exacto?
>
> Con tu estado de cuenta del IMSS te doy el número real, no una estimación.
> Y te digo si Modalidad 40 te conviene o no.
>
> La primera revisión es sin costo.

**Botón 1:** `Sí, quiero mi revisión` → sigue a captura
**Botón 2:** `Solo era curiosidad` → mensaje de cierre suave

**Si toca el botón 1** → Bloque Recopilación de datos, tipo **Teléfono** → `whatsapp_contacto`

> Perfecto 👍
>
> Déjame tu WhatsApp a 10 dígitos y te contacto para agendar.
>
> Ejemplo: 5512345678

**Acciones al capturar:** agregar tag `contacto_capturado`

**Mensaje de confirmación:**

> ✅ Listo, quedó registrado.
>
> Te escribo por WhatsApp en las próximas horas.
>
> 📄 Para aprovechar la llamada, ten a la mano tu constancia de semanas cotizadas
> (la descargas gratis en IMSS Digital).

---

### Cierre suave (botón 2)

> Sin problema 🙂
>
> Aquí te dejo el dato clave: cada año que pasa sin planear tu retiro es dinero
> que ya no recuperas.
>
> Si más adelante quieres revisarlo, escribe "calcular" y retomamos.

---

## 4. Notas de configuración

**Timeout de Render.** El plan gratuito duerme tras inactividad y la primera
petición puede tardar 50 segundos. UptimeRobot ya lo mantiene despierto, pero si
ves respuestas lentas, revisa que siga activo.

**Prueba antes de publicar.** Usa la vista previa de ManyChat con estos casos:
- 1985 / 64 años / 1500 semanas / 25000 → debe dar Ley 73 con estimación
- 2010 / 45 años / 600 semanas → debe dar Ley 97, faltan semanas
- 1997 / cualquier cosa → debe mandar a revisión manual

**Endpoint de salud:** `GET /calculadora/ping` para verificar que el módulo cargó.
