/**
 * calculo-pension.js
 * Estimacion orientativa de pension IMSS.
 *
 * IMPORTANTE: los resultados son ESTIMACIONES para orientacion comercial.
 * No sustituyen el calculo oficial del IMSS, que usa el salario real de las
 * ultimas 250 semanas segun el estado de cuenta del asegurado.
 */

// ---------------------------------------------------------------------------
// CONFIGURACION - revisar y actualizar cada año
// ---------------------------------------------------------------------------

const CONFIG = {
  // UMA diaria vigente. ACTUALIZAR cada febrero.
  // El valor de abajo es un placeholder: ponlo con el dato oficial del INEGI.
  UMA_DIARIA: 117.31,

  // Salario minimo general diario vigente. ACTUALIZAR cada enero.
  SALARIO_MINIMO_DIARIO: 315.04,

  // Factor de incremento decretado en 2001 (Art. 25 transitorio / decreto 2001)
  FACTOR_INCREMENTO_2001: 1.11,

  // Tope de salario promedio para Ley 73: 25 UMAs
  TOPE_UMAS: 25,
};

// ---------------------------------------------------------------------------
// TABLA ART. 167 LSS 1973 (reformado DOF 27/12/1990)
// limite = tope superior del grupo expresado en veces salario minimo/UMA
// ---------------------------------------------------------------------------

const TABLA_167 = [
  { limite: 1.00, cuantiaBasica: 80.00, incrementoAnual: 0.563 },
  { limite: 1.25, cuantiaBasica: 77.11, incrementoAnual: 0.814 },
  { limite: 1.50, cuantiaBasica: 58.18, incrementoAnual: 1.178 },
  { limite: 1.75, cuantiaBasica: 49.23, incrementoAnual: 1.430 },
  { limite: 2.00, cuantiaBasica: 42.67, incrementoAnual: 1.615 },
  { limite: 2.25, cuantiaBasica: 37.65, incrementoAnual: 1.756 },
  { limite: 2.50, cuantiaBasica: 33.68, incrementoAnual: 1.868 },
  { limite: 2.75, cuantiaBasica: 30.48, incrementoAnual: 1.958 },
  { limite: 3.00, cuantiaBasica: 27.83, incrementoAnual: 2.033 },
  { limite: 3.25, cuantiaBasica: 25.60, incrementoAnual: 2.096 },
  { limite: 3.50, cuantiaBasica: 23.70, incrementoAnual: 2.149 },
  { limite: 3.75, cuantiaBasica: 22.07, incrementoAnual: 2.195 },
  { limite: 4.00, cuantiaBasica: 20.65, incrementoAnual: 2.235 },
  { limite: 4.25, cuantiaBasica: 19.39, incrementoAnual: 2.271 },
  { limite: 4.50, cuantiaBasica: 18.29, incrementoAnual: 2.302 },
  { limite: 4.75, cuantiaBasica: 17.30, incrementoAnual: 2.330 },
  { limite: 5.00, cuantiaBasica: 16.41, incrementoAnual: 2.355 },
  { limite: 5.25, cuantiaBasica: 15.61, incrementoAnual: 2.377 },
  { limite: 5.50, cuantiaBasica: 14.88, incrementoAnual: 2.398 },
  { limite: 5.75, cuantiaBasica: 14.22, incrementoAnual: 2.416 },
  { limite: 6.00, cuantiaBasica: 13.62, incrementoAnual: 2.433 },
  { limite: Infinity, cuantiaBasica: 13.00, incrementoAnual: 2.450 },
];

// ---------------------------------------------------------------------------
// TABLA ART. 171 LSS 1973 - porcentaje por cesantia segun edad
// ---------------------------------------------------------------------------

const TABLA_171 = {
  60: 0.75,
  61: 0.80,
  62: 0.85,
  63: 0.90,
  64: 0.95,
  65: 1.00,
};

// ---------------------------------------------------------------------------
// SEMANAS MINIMAS REQUERIDAS - Ley 97 (transicion hacia 1000 en 2031)
// ---------------------------------------------------------------------------

const SEMANAS_MINIMAS_LEY97 = {
  2021: 750, 2022: 775, 2023: 800, 2024: 825, 2025: 850,
  2026: 875, 2027: 900, 2028: 925, 2029: 950, 2030: 975,
  2031: 1000,
};

function semanasMinimasLey97(anio) {
  if (anio <= 2021) return 750;
  if (anio >= 2031) return 1000;
  return SEMANAS_MINIMAS_LEY97[anio];
}

// ---------------------------------------------------------------------------
// CALCULO LEY 73
// ---------------------------------------------------------------------------

/**
 * @param {number} salarioPromedioMensual - promedio mensual aproximado (MXN)
 * @param {number} semanasCotizadas
 * @param {number} edadRetiro - 60 a 65
 * @returns {object}
 */
function calcularLey73(salarioPromedioMensual, semanasCotizadas, edadRetiro) {
  const errores = [];

  if (!salarioPromedioMensual || salarioPromedioMensual <= 0) {
    errores.push('Salario promedio invalido.');
  }
  if (!semanasCotizadas || semanasCotizadas < 500) {
    errores.push('Se requieren al menos 500 semanas cotizadas para Ley 73.');
  }
  if (edadRetiro < 60 || edadRetiro > 65) {
    errores.push('La edad de retiro debe estar entre 60 y 65 años.');
  }
  if (errores.length) return { ok: false, errores };

  // 1. Salario diario promedio
  const salarioDiario = salarioPromedioMensual / 30;

  // 2. Expresarlo en veces UMA, aplicando tope de 25 UMAs
  let vecesUMA = salarioDiario / CONFIG.UMA_DIARIA;
  let topeAplicado = false;
  if (vecesUMA > CONFIG.TOPE_UMAS) {
    vecesUMA = CONFIG.TOPE_UMAS;
    topeAplicado = true;
  }

  // 3. Ubicar grupo salarial en tabla art. 167
  const grupo = TABLA_167.find(g => vecesUMA <= g.limite);

  // 4. Cuantia basica anual
  const cuantiaBasicaAnual = salarioDiario * 365 * (grupo.cuantiaBasica / 100);

  // 5. Incrementos anuales: uno por cada 52 semanas EXCEDENTES a las primeras 500
  const semanasExcedentes = Math.max(0, semanasCotizadas - 500);
  const aniosIncremento = Math.floor(semanasExcedentes / 52);
  const incrementosAnual =
    salarioDiario * 365 * (grupo.incrementoAnual / 100) * aniosIncremento;

  // 6. Pension anual por vejez (100%)
  const pensionAnualVejez = cuantiaBasicaAnual + incrementosAnual;
  let pensionMensualVejez = pensionAnualVejez / 12;

  // 7. Factor de incremento decretado en 2001
  pensionMensualVejez *= CONFIG.FACTOR_INCREMENTO_2001;

  // 8. Ajuste por edad (cesantia) segun art. 171
  const factorEdad = TABLA_171[edadRetiro];
  let pensionMensual = pensionMensualVejez * factorEdad;

  // 9. Pisos y topes legales
  const pensionMinima = CONFIG.SALARIO_MINIMO_DIARIO * 30;
  const topeMaximo = salarioPromedioMensual; // no puede exceder el 100% del salario promedio
  let ajuste = null;

  if (pensionMensual < pensionMinima) {
    pensionMensual = pensionMinima;
    ajuste = 'Se aplico la pension minima garantizada.';
  }
  if (pensionMensual > topeMaximo) {
    pensionMensual = topeMaximo;
    ajuste = 'Se aplico el tope del 100% del salario promedio.';
  }

  return {
    ok: true,
    ley: 73,
    grupoSalarial: {
      vecesUMA: Number(vecesUMA.toFixed(2)),
      cuantiaBasicaPct: grupo.cuantiaBasica,
      incrementoAnualPct: grupo.incrementoAnual,
    },
    semanasExcedentes,
    aniosIncremento,
    factorEdad,
    topeAplicado,
    ajuste,
    pensionMensual: Math.round(pensionMensual),
    // Rango orientativo +/- 12% por imprecision del salario declarado
    rangoMensual: {
      min: Math.round(pensionMensual * 0.88),
      max: Math.round(pensionMensual * 1.12),
    },
    aguinaldoAnual: Math.round(pensionMensual),
  };
}

// ---------------------------------------------------------------------------
// SIMULACION MODALIDAD 40
// ---------------------------------------------------------------------------

/**
 * Compara la pension actual contra el escenario de cotizar en Modalidad 40
 * con un salario mayor durante N años.
 */
function simularModalidad40(base, salarioM40Mensual, aniosM40, edadRetiro) {
  const semanasNuevas = base.semanasCotizadas + aniosM40 * 52;

  // Las ultimas 250 semanas (~4.8 años) dominan el promedio.
  // Si cotiza M40 mas de 5 años, el promedio se vuelve practicamente el de M40.
  const semanas250 = 250;
  const semanasM40 = aniosM40 * 52;
  const pesoM40 = Math.min(semanasM40, semanas250) / semanas250;
  const salarioPromedioNuevo =
    salarioM40Mensual * pesoM40 + base.salarioPromedioMensual * (1 - pesoM40);

  const sinM40 = calcularLey73(
    base.salarioPromedioMensual,
    base.semanasCotizadas,
    edadRetiro
  );
  const conM40 = calcularLey73(salarioPromedioNuevo, semanasNuevas, edadRetiro);

  if (!sinM40.ok || !conM40.ok) return { ok: false, errores: ['Datos insuficientes.'] };

  const diferencia = conM40.pensionMensual - sinM40.pensionMensual;

  return {
    ok: true,
    sinM40: sinM40.pensionMensual,
    conM40: conM40.pensionMensual,
    diferenciaMensual: diferencia,
    incrementoPct: Number(((diferencia / sinM40.pensionMensual) * 100).toFixed(1)),
    salarioPromedioNuevo: Math.round(salarioPromedioNuevo),
    semanasNuevas,
  };
}

// ---------------------------------------------------------------------------
// DIAGNOSTICO LEY 97
// ---------------------------------------------------------------------------

/**
 * Ley 97 NO permite estimar monto sin el saldo de Afore.
 * Este diagnostico solo evalua elegibilidad y contexto.
 */
function diagnosticarLey97(semanasCotizadas, edadActual, anioRetiroPrevisto) {
  const anio = anioRetiroPrevisto || new Date().getFullYear();
  const minimas = semanasMinimasLey97(anio);
  const cumpleSemanas = semanasCotizadas >= minimas;
  const faltanSemanas = Math.max(0, minimas - semanasCotizadas);

  return {
    ok: true,
    ley: 97,
    semanasRequeridas: minimas,
    semanasCotizadas,
    cumpleSemanas,
    faltanSemanas,
    aniosFaltantes: Number((faltanSemanas / 52).toFixed(1)),
    edadMinimaCesantia: 60,
    edadMinimaVejez: 65,
    cumpleEdad: edadActual >= 60,
    nota:
      'El monto de la pension bajo Ley 97 depende del saldo acumulado en tu ' +
      'Afore, sus rendimientos y la modalidad de retiro. No es posible ' +
      'estimarlo sin tu estado de cuenta.',
  };
}

module.exports = {
  CONFIG,
  TABLA_167,
  TABLA_171,
  calcularLey73,
  simularModalidad40,
  diagnosticarLey97,
  semanasMinimasLey97,
};
