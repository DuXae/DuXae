/**
 * Движок расчёта наклонной подъёмной платформы.
 *
 * Чистый модуль без DOM: используется страницей (window.PlatformEngine)
 * и тестами в Node (module.exports).
 */
(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    global.PlatformEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const G = 9.81;

  /** Заводские настройки. Меняются в окне «Параметры» и сохраняются в браузере. */
  const DEFAULTS = {
    maxRiseMm: 10000,
    maxAngleDeg: 30,
    minWidthMm: 900,
    platformBaseMm: 1100,
    platformMarginMm: 100,
    minPlatformWidthMm: 800,
    npuDeltaMm: -150,
    railTailMm: 250,
    supportSpacingMm: 1500,
    speedMps: 0.1,
    boardingS: 3,
    platformMassKg: 120,
    friction: 0.02,
    efficiency: 0.75,
    payloadKg: 250,
    maxSteps: 30,
    minSteps: 2,
    minTreadMm: 250,
    maxRiserSpreadMm: 5,
    riserRangeMm: [100, 200],
  };

  /** Добавка к длине платформы за выбранный пандус, мм. */
  const RAMP_DELTA = { 0: 0, 50: 50, 100: 100, 150: 150 };

  const RAMP_TITLES = {
    0: 'обычный пандус',
    50: 'удлинённый пандус на 50 мм',
    100: 'удлинённый пандус на 100 мм',
    150: 'удлинённый пандус на 150 мм',
  };

  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const mm = (value) => Math.round(value * 10) / 10;

  function withDefaults(settings) {
    return Object.assign({}, DEFAULTS, settings || {});
  }

  /**
   * Приводит строки таблицы к списку ступеней.
   * Пустая высота означает конец марша; заполненные строки после неё — пропуск.
   */
  function collectSteps(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const filled = [];

    list.forEach((row, index) => {
      const rise = num(row && row.rise);
      if (rise > 0) filled.push({ index, rise, tread: Math.max(0, num(row && row.tread)) });
    });

    const steps = filled.map((item) => ({ rise: item.rise, tread: item.tread }));

    // Пропуск в середине таблицы: индекс последней заполненной минус первой
    // больше их количества — значит, между ними есть пустые строки.
    let gapAt = null;
    if (filled.length > 1) {
      const span = filled[filled.length - 1].index - filled[0].index + 1;
      if (span !== filled.length) {
        const present = new Set(filled.map((item) => item.index));
        for (let i = filled[0].index; i <= filled[filled.length - 1].index; i += 1) {
          if (!present.has(i)) { gapAt = i + 1; break; }
        }
      }
    }

    return { steps, gapAt };
  }

  function collectWarnings(ctx) {
    const { input, s, rise, stepsRun, angleDeg, avgRise, spread, platform, steps, gapAt } = ctx;
    const out = [];

    if (gapAt !== null) {
      out.push({ level: 'error', text: `Ступенька ${gapAt} не заполнена, а следующие заполнены. Ступеньки пропускать нельзя.` });
    }

    if (steps.length < s.minSteps) {
      out.push({ level: 'error', text: `Нужно не меньше ${s.minSteps} ступеней.` });
    }

    if (steps.length >= s.minSteps && stepsRun <= 0) {
      out.push({ level: 'error', text: 'Длины проступей равны нулю: подъём вертикальный, платформа невозможна.' });
    }

    if (angleDeg > s.maxAngleDeg) {
      out.push({
        level: 'error',
        text: `Угол подъёма ${angleDeg.toFixed(1)}° больше допустимых ${s.maxAngleDeg}°.`,
      });
    }

    if (rise > s.maxRiseMm) {
      out.push({
        level: 'error',
        text: `Длина подъёма ${(rise / 1000).toFixed(2)} м больше допустимых ${s.maxRiseMm / 1000} м.`,
      });
    }

    if (input.width < s.minWidthMm) {
      out.push({
        level: 'warn',
        text: `Ширина марша ${(input.width / 1000).toFixed(2)} м меньше ${(s.minWidthMm / 1000).toFixed(2)} м: платформа будет уже типовой.`,
      });
    }

    if (platform.width < s.minPlatformWidthMm) {
      out.push({
        level: 'error',
        text: `Ширина платформы ${Math.round(platform.width)} мм меньше минимальных ${s.minPlatformWidthMm} мм.`,
      });
    }

    if (spread > s.maxRiserSpreadMm) {
      out.push({
        level: 'warn',
        text: `Высоты ступеней различаются на ${Math.round(spread)} мм: направляющая получит излом, проверьте геометрию.`,
      });
    }

    const [minRiser, maxRiser] = s.riserRangeMm;
    if (avgRise > maxRiser) {
      out.push({ level: 'warn', text: `Средняя высота ступени ${Math.round(avgRise)} мм выше ${maxRiser} мм — тяжело для коляски.` });
    } else if (avgRise < minRiser) {
      out.push({ level: 'warn', text: `Средняя высота ступени ${Math.round(avgRise)} мм ниже ${minRiser} мм — проверьте число ступеней.` });
    }

    const shortTreads = [];
    steps.slice(0, -1).forEach((step, i) => {
      if (step.tread < s.minTreadMm) shortTreads.push(i + 1);
    });
    if (shortTreads.length) {
      const listed = shortTreads.slice(0, 6).join(', ');
      const tail = shortTreads.length > 6 ? ' и др.' : '';
      out.push({
        level: 'warn',
        text: `Проступь меньше ${s.minTreadMm} мм у ступеней ${listed}${tail}: платформе не хватит места для проезда.`,
      });
    }

    if (steps.length && steps[steps.length - 1].tread > 0) {
      out.push({ level: 'info', text: 'Длина проступи последней ступени не учитывается: её роль играет верхняя площадка.' });
    }

    if (input.npu) {
      out.push({ level: 'info', text: `Включена укороченная площадка НПУ: длина платформы уменьшена на ${Math.abs(s.npuDeltaMm)} мм.` });
    }

    return out;
  }

  /**
   * Основной расчёт.
   * @param {object} input  { rows, lower, upper, width, ramp, npu, payload }
   * @param {object} [settings] переопределение DEFAULTS
   */
  function compute(input, settings) {
    const s = withDefaults(settings);
    const data = input || {};
    const { steps, gapAt } = collectSteps(data.rows);

    const rises = steps.map((step) => step.rise);
    const treads = steps.slice(0, -1).map((step) => step.tread);

    const rise = rises.reduce((a, b) => a + b, 0);
    const stepsRun = treads.reduce((a, b) => a + b, 0);

    const lower = Math.max(0, num(data.lower));
    const upper = Math.max(0, num(data.upper));
    const width = Math.max(0, num(data.width));
    const payload = num(data.payload) > 0 ? num(data.payload) : s.payloadKg;

    const totalRun = lower + stepsRun + upper;

    const angleDeg = stepsRun > 0 ? (Math.atan2(rise, stepsRun) * 180) / Math.PI : (rise > 0 ? 90 : 0);
    const slope = stepsRun > 0 ? Math.hypot(rise, stepsRun) : rise;

    const ramp = String(data.ramp === undefined ? 0 : data.ramp);
    const rampDelta = RAMP_DELTA[ramp] === undefined ? 0 : RAMP_DELTA[ramp];
    const npu = Boolean(data.npu);

    const platformLength = Math.max(600, s.platformBaseMm + rampDelta + (npu ? s.npuDeltaMm : 0));
    const platformWidth = Math.max(s.minPlatformWidthMm, width - s.platformMarginMm);

    const rail = slope + 2 * s.railTailMm;
    const supports = Math.max(2, Math.ceil(rail / s.supportSpacingMm));

    const count = steps.length;
    const avgRise = count ? rise / count : 0;
    const spread = rises.length ? Math.max(...rises) - Math.min(...rises) : 0;

    const angleRad = (angleDeg * Math.PI) / 180;
    const movingMass = payload + s.platformMassKg;
    const traction = movingMass * G * (Math.sin(angleRad) + s.friction * Math.cos(angleRad));
    const powerKw = (traction * s.speedMps) / s.efficiency / 1000;
    const travelTime = slope / 1000 / s.speedMps;
    const totalTime = travelTime + 2 * s.boardingS;
    const loadPerSupport = (movingMass * G * Math.cos(angleRad)) / supports;

    const platform = {
      length: platformLength,
      width: platformWidth,
      ramp,
      rampTitle: RAMP_TITLES[ramp] || RAMP_TITLES[0],
      rampDelta,
      npu,
    };

    const warnings = collectWarnings({
      input: { width, npu }, s, rise, stepsRun, angleDeg, avgRise, spread, platform, steps, gapAt,
    });

    return {
      settings: s,
      steps,
      stepsCount: count,
      rise: mm(rise),
      stepsRun: mm(stepsRun),
      totalRun: mm(totalRun),
      angleDeg: mm(angleDeg),
      slope: mm(slope),
      rail: mm(rail),
      supports,
      platform,
      avgRise: mm(avgRise),
      riserSpread: mm(spread),
      payload,
      movingMass,
      traction: mm(traction),
      powerKw: mm(powerKw),
      travelTime: mm(travelTime),
      totalTime: mm(totalTime),
      loadPerSupport: mm(loadPerSupport),
      warnings,
      feasible: !warnings.some((w) => w.level === 'error'),
      gapAt,
    };
  }

  return { DEFAULTS, RAMP_DELTA, RAMP_TITLES, compute, collectSteps, withDefaults };
});
