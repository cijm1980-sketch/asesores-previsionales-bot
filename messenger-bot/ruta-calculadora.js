/**
 * ruta-calculadora.js
 * Endpoint para el bloque "Solicitud externa" (External Request) de ManyChat.
 *
 * Montarlo en server-manychat.js:
 *   const calculadora = require('./ruta-calculadora');
 *   app.use('/calculadora', calculadora);
 *
 * ManyChat manda POST con los custom fields ya capturados y espera de vuelta
 * el formato de "Respuesta dinamica" (version v2).
 */

const express = require('express');
const router = express.Router();

const {
  CONFIG,
  calcularLey73,
  simularModalidad40,
  diagnosticarLey97,
  semanasMinimasLey97,
} = require('./calculo-pension');

// ---------------------------------------------------------------------------
// Helpers de formato ManyChat
// ---------------------------------------------------------------------------

function texto(msg) {
  return { type: 'text', text: msg };
}

function textoConBotones(msg, botones) {
  return { type: 'text', text: msg, buttons: botones };
}

function botonFlujo(titulo, targetFlow) {
  return { type: 'flow', caption: titulo, target: targetFlow };
}

function respuesta(mensajes, acciones = []) {
  return {
    version: 'v2',
    content: { messages: mensajes, actions: acciones, quick_replies: [] },
  };
}

function accionTag(tag) {
  return { action: 'add_tag', tag_name: tag };
}

function accionCampo(campo, valor) {
  return { action: 'set_field_value', field_name: campo, value: String(valor) };
}

const money = n => '$' + Number(n).toLocaleString('es-MX');

// ---------------------------------------------------------------------------
// Normalizacion de entradas (la gente escribe de todo)
// ---------------------------------------------------------------------------

function limpiarNumero(valor) {
  if (valor === null || valor === undefined) return NaN;
  const s = String(valor)
    .replace(/[$,\s]/g, '')
    .replace(/mil$/i, '000')
    .trim();
  return parseFloat(s);
}

function detectarLey(anioRegistro) {
  const a = limpiarNumero(anioRegistro);
  if (isNaN(a)) return null;
  // Julio 1997 es el corte. Si solo tenemos el año, 1997 es ambiguo:
  // lo mandamos a revision humana.
  if (a < 1997) return 73;
  if (a > 1997) return 97;
  return 'ambiguo';
}

// ---------------------------------------------------------------------------
// PASO 1: determinar ley aplicable
// ---------------------------------------------------------------------------

router.post('/ley', (req, res) => {
  const { anio_registro_imss } = req.body;
  const ley = detectarLey(anio_registro_imss);

  if (ley === null) {
    return res.json(
      respuesta([
        texto(
          'No pude leer ese año 🤔\n\n' +
            'Escríbelo con 4 dígitos, por ejemplo: 1992'
        ),
      ])
    );
  }

  if (ley === 'ambiguo') {
    return res.json(
      respuesta(
        [
          texto(
            '1997 es un año especial ⚠️\n\n' +
              'Si te registraste ANTES del 1 de julio de 1997 te aplica la Ley 73. ' +
              'Después de esa fecha, la Ley 97.\n\n' +
              'Como la diferencia es de días, necesito revisarlo contigo directamente.'
          ),
        ],
        [accionTag('revision_manual'), accionCampo('ley_aplicable', 'ambiguo')]
      )
    );
  }

  if (ley === 73) {
    return res.json(
      respuesta(
        [
          texto(
            '✅ Te aplica la LEY 73\n\n' +
              'Es la más favorable: tu pensión se calcula con tu salario y semanas ' +
              'cotizadas, no con lo que tengas ahorrado en la Afore.\n\n' +
              'Necesito 3 datos para estimarla.'
          ),
        ],
        [accionCampo('ley_aplicable', '73')]
      )
    );
  }

  return res.json(
    respuesta(
      [
        texto(
          '📋 Te aplica la LEY 97\n\n' +
            'Tu pensión depende del saldo acumulado en tu Afore.\n\n' +
            'Con 2 datos puedo decirte si ya cumples los requisitos mínimos.'
        ),
      ],
      [accionCampo('ley_aplicable', '97')]
    )
  );
});

// ---------------------------------------------------------------------------
// PASO 2: calcular resultado parcial
// ---------------------------------------------------------------------------

router.post('/estimar', (req, res) => {
  const {
    ley_aplicable,
    edad_actual,
    semanas_cotizadas,
    salario_promedio,
  } = req.body;

  // Guardia: si la ley no quedo definida como 73 o 97, no se puede estimar.
  // Cubre el caso 'ambiguo' (registro en 1997) y cualquier valor vacio o raro.
  const ley = String(ley_aplicable || '').trim();
  if (ley !== '73' && ley !== '97') {
    return res.json(
      respuesta(
        [
          texto(
            '📋 Tu caso necesita revisión personalizada\n\n' +
              'No puedo darte una estimación automática porque falta definir ' +
              'qué ley te aplica.\n\n' +
              'Un asesor lo revisa contigo sin costo y te da el número correcto.'
          ),
        ],
        [accionTag('revision_manual'), accionTag('lead_calificado')]
      )
    );
  }

  const edad = limpiarNumero(edad_actual);
  const semanas = limpiarNumero(semanas_cotizadas);

  if (isNaN(edad) || edad < 18 || edad > 100) {
    return res.json(
      respuesta([texto('Esa edad no me cuadra 🤔 Escríbela solo en números, ej: 62')])
    );
  }
  if (isNaN(semanas) || semanas < 0 || semanas > 3500) {
    return res.json(
      respuesta([
        texto(
          'Ese número de semanas no me cuadra 🤔\n\n' +
            'Consúltalo en IMSS Digital y escríbelo solo en números, ej: 1250'
        ),
      ])
    );
  }

  // ---------------- LEY 97 ----------------
  if (ley === '97') {
    const d = diagnosticarLey97(semanas, edad, new Date().getFullYear());
    const acciones = [
      accionTag('lead_calificado'),
      accionTag('ley_97'),
      accionCampo('semanas_cotizadas', semanas),
    ];

    let msg;
    if (d.cumpleSemanas) {
      acciones.push(accionTag('lead_prioritario'));
      msg =
        '✅ BUENAS NOTICIAS\n\n' +
        `Con ${semanas} semanas YA CUMPLES el mínimo de ` +
        `${d.semanasRequeridas} que se exige este año.\n\n` +
        (d.cumpleEdad
          ? '📌 Y ya tienes la edad para tramitar por cesantía (60+).'
          : `📌 Te faltan ${60 - edad} años para poder tramitar (mínimo 60).`);
    } else {
      acciones.push(accionTag('lead_exploratorio'));
      msg =
        '⚠️ TE FALTAN SEMANAS\n\n' +
        `Tienes ${semanas} y este año se exigen ${d.semanasRequeridas}.\n\n` +
        `Te faltan ${d.faltanSemanas} semanas (unos ${d.aniosFaltantes} años).\n\n` +
        '📌 Ojo: el requisito sube 25 semanas cada año hasta llegar a 1,000 en 2031.';
    }

    return res.json(
      respuesta(
        [
          texto(msg),
          texto(
            '💡 Lo que NO puedo decirte por aquí:\n\n' +
              'Cuánto vas a recibir al mes. Ese monto depende del saldo de tu ' +
              'Afore y solo se puede calcular con tu estado de cuenta.\n\n' +
              '¿Quieres que lo revisemos juntos sin costo?'
          ),
        ],
        acciones
      )
    );
  }

  // ---------------- LEY 73 ----------------
  const salario = limpiarNumero(salario_promedio);
  if (isNaN(salario) || salario < 1000 || salario > 500000) {
    return res.json(
      respuesta([
        texto(
          'Ese salario no me cuadra 🤔\n\n' +
            'Escribe tu sueldo MENSUAL bruto aproximado, solo números. Ej: 18000'
        ),
      ])
    );
  }

  // Edad de retiro: si aun no cumple 60, proyectamos a 65
  const edadRetiro = edad >= 60 ? Math.min(Math.floor(edad), 65) : 65;
  const r = calcularLey73(salario, semanas, edadRetiro);

  if (!r.ok) {
    const acciones = [accionTag('lead_exploratorio'), accionTag('ley_73')];
    return res.json(
      respuesta(
        [
          texto(
            '⚠️ ' +
              r.errores.join(' ') +
              '\n\nPero no te preocupes: hay formas de completar semanas. ' +
              'Eso lo vemos en la asesoría.'
          ),
        ],
        acciones
      )
    );
  }

  const acciones = [
    accionTag('lead_calificado'),
    accionTag('lead_prioritario'),
    accionTag('ley_73'),
    accionCampo('semanas_cotizadas', semanas),
    accionCampo('pension_estimada', r.pensionMensual),
  ];

  const mensajes = [
    texto(
      '📊 TU ESTIMACIÓN\n\n' +
        `Retirándote a los ${edadRetiro} años, tu pensión mensual rondaría:\n\n` +
        `${money(r.rangoMensual.min)} — ${money(r.rangoMensual.max)}\n\n` +
        `Más un aguinaldo anual de aproximadamente ${money(r.aguinaldoAnual)}.`
    ),
    texto(
      '⚠️ Es una estimación orientativa.\n\n' +
        'El IMSS calcula con el salario real de tus últimas 250 semanas, ' +
        'que solo aparece en tu estado de cuenta oficial.'
    ),
  ];

  if (edadRetiro < 65) {
    mensajes.push(
      texto(
        `💡 Dato importante: a los ${edadRetiro} años solo recibes el ` +
          `${Math.round(r.factorEdad * 100)}% de tu pensión.\n\n` +
          'Si esperas hasta los 65 recibes el 100%. La diferencia es permanente, ' +
          'de por vida.'
      )
    );
  }

  return res.json(respuesta(mensajes, acciones));
});

// ---------------------------------------------------------------------------
// PASO 3: gancho Modalidad 40 (solo Ley 73)
// ---------------------------------------------------------------------------

router.post('/modalidad40', (req, res) => {
  const { semanas_cotizadas, salario_promedio, edad_actual } = req.body;

  const semanas = limpiarNumero(semanas_cotizadas);
  const salario = limpiarNumero(salario_promedio);
  const edad = limpiarNumero(edad_actual);

  if (isNaN(semanas) || isNaN(salario)) {
    return res.json(
      respuesta([texto('Me faltan datos para esta comparación. Retomemos el cálculo.')])
    );
  }

  const edadRetiro = edad >= 60 ? Math.min(Math.floor(edad), 65) : 65;

  // Escenario: cotizar 5 años en M40 al triple del salario actual, topado a 25 UMAs
  // (antes usaba un UMA hardcodeado y desactualizado de 113.14; ahora toma el valor
  // vigente de CONFIG y el mismo factor de 30.4 dias/mes que calculo-pension.js).
  const salarioM40 = Math.min(
    salario * 3,
    CONFIG.UMA_DIARIA * CONFIG.TOPE_UMAS * CONFIG.DIAS_POR_MES
  );
  const sim = simularModalidad40(
    { salarioPromedioMensual: salario, semanasCotizadas: semanas },
    salarioM40,
    5,
    edadRetiro
  );

  if (!sim.ok) {
    return res.json(respuesta([texto('No pude hacer la comparación con esos datos.')]));
  }

  return res.json(
    respuesta(
      [
        texto(
          '🚀 ¿SABÍAS QUE PUEDES AUMENTARLA?\n\n' +
            'Existe la Modalidad 40: sigues cotizando por tu cuenta con un salario ' +
            'más alto durante unos años antes de pensionarte.\n\n' +
            'En un escenario de 5 años, tu pensión podría pasar de ' +
            `${money(sim.sinM40)} a varias veces esa cantidad.`
        ),
        texto(
          '⚠️ No es para todos.\n\n' +
            'Tiene un costo mensual que sube cada año, y conviene solo si los ' +
            'números de TU caso lo justifican. Hacerlo mal es tirar dinero.\n\n' +
            'Eso es justo lo que revisamos en la asesoría.'
        ),
      ],
      [accionTag('interes_modalidad40')]
    )
  );
});

// ---------------------------------------------------------------------------
// Salud del servicio
// ---------------------------------------------------------------------------

router.get('/ping', (_req, res) => {
  res.json({ ok: true, servicio: 'calculadora', hora: new Date().toISOString() });
});

module.exports = router;
