/*
 * Ядро расчёта наклонного подъёмника по геометрии лестницы.
 *
 * Модель восстановлена по поведению калькулятора лесенка74.рф (чёрный ящик:
 * серии расчётов, сверка чисел). Что воспроизводится точно и проверено на
 * десятках прогонов:
 *   - угол лестницы, высота подъёма, длина подъёма по проступям;
 *   - угол платформы EasyTrap = floor(угла лестницы), потолок 30°;
 *   - угол платформы НПУ = угол лестницы (+сдвиг от пандуса), потолок 30°;
 *   - длина пути = высота / sin(угла);
 *   - минимальные нижние площадки: (h_max + c) / tg(угла) + k;
 *   - матрица «проходит / не проходит» по ширине марша и нижней площадке.
 *
 * Приближённо (подобрано по сетке замеров, см. README):
 *   - сдвиг угла от удлинённого пандуса (+50/+100/+150);
 *   - лестницы с разными проступями.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Lesenka = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_ANGLE_DEG = 30;
  var DEG = 180 / Math.PI;
  var RAD = Math.PI / 180;

  // Пороги ширины марша, при которых вариант физически проходит.
  var WIDTH_MIN = {
    et: {
      passage_to_wall: 1100,
      side_to_wall: 1300,
      '3side_to_wall': 1300,
      passage_on_supports: 1300,
      side_on_supports: 1450,
      '3side_on_supports': 1450
    },
    npu: {
      passage_to_wall: 1090,
      side_to_wall: 1150,
      '3side_to_wall': 1150,
      passage_on_supports: 1200,
      side_on_supports: 1250,
      '3side_on_supports': 1250
    }
  };

  var VARIANTS = [
    'passage_to_wall',
    'side_to_wall',
    '3side_to_wall',
    'passage_on_supports',
    'side_on_supports',
    '3side_on_supports'
  ];

  // Какие варианты сверяются с «боковой» минимальной площадкой.
  var SIDE_SENSITIVE = {
    et: { side_to_wall: true, side_on_supports: true },
    npu: { passage_to_wall: true, passage_on_supports: true }
  };

  var VARIANT_TITLES = {
    passage_to_wall: 'Проходной к стене',
    side_to_wall: 'Боковой к стене',
    '3side_to_wall': '3 стороны к стене',
    passage_on_supports: 'Проходной на опорах',
    side_on_supports: 'Боковой на опорах',
    '3side_on_supports': '3 стороны на опорах'
  };

  var RAMP_TITLES = {
    0: 'Обычный пандус',
    50: 'Удлинённый пандус на 50 мм',
    100: 'Удлинённый пандус на 100 мм',
    150: 'Удлинённый пандус на 150 мм'
  };

  function toNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function sum(list) {
    var total = 0;
    for (var i = 0; i < list.length; i++) total += list[i];
    return total;
  }

  function hypot(a, b) {
    return Math.sqrt(a * a + b * b);
  }

  /** Собирает ступени, пока не встретится пустая строка. */
  function collectSteps(heights, lengths) {
    var steps = [];
    for (var i = 0; i < heights.length; i++) {
      var rise = toNumber(heights[i]);
      if (rise === null || rise <= 0) break;
      var tread = toNumber(lengths[i]);
      if (tread === null || tread < 0) tread = 0;
      steps.push({ rise: rise, tread: tread });
    }
    return steps;
  }

  /**
   * Сдвиг угла платформы НПУ от удлинённого въездного пандуса.
   * Эмпирическая аппроксимация сетки замеров: чем меньше высота подъёма и
   * чем круче лестница, тем сильнее сдвиг.
   */
  function rampAngleShift(ramp, rise, stairAngle) {
    var extension = toNumber(ramp) || 0;
    if (extension <= 0 || rise <= 0) return 0;
    var base = 0.4 + 0.01 * extension;
    var heightFactor = 1500 / Math.max(300, rise);
    var slopeFactor = 1 + 0.095 * (stairAngle - 26);
    return base * heightFactor * slopeFactor;
  }

  /**
   * Добавка к минимальной площадке, когда платформа идёт положе лестницы.
   *
   * Геометрический смысл: к верхней точке трасса не доходит до линии лестницы
   * на (1/tg(платформы) - 1/tg(лестницы)) * (высота подъёма - 2 высоты ступени).
   * Формула сверена на сериях замеров (в т.ч. с шагом 0,5°).
   */
  function mismatchPenalty(stairAngle, platformAngle, rise, stepHeight) {
    if (stairAngle <= platformAngle) return 0;
    var tanStair = Math.tan(stairAngle * RAD);
    var tanPlatform = Math.tan(platformAngle * RAD);
    if (tanStair <= 0 || tanPlatform <= 0) return 0;
    var extraRun = 1 / tanPlatform - 1 / tanStair;
    var effectiveRise = Math.max(0, rise - 2 * stepHeight);
    return extraRun * effectiveRise;
  }

  function platformParams(hMax, stairAngle, extension) {
    var shift = rampAngleShift(extension, hMax.rise, stairAngle);
    // Калькулятор округляет угол платформы до десятых, и только потом
    // считает путь и площадки — это заметно по длине пути (3015, а не 3018).
    var npuAngle = Math.round(Math.min(MAX_ANGLE_DEG, stairAngle + shift) * 10) / 10;
    var etAngle = Math.min(MAX_ANGLE_DEG, Math.floor(npuAngle + 1e-9));

    var etSin = Math.sin(etAngle * RAD);
    var npuSin = Math.sin(npuAngle * RAD);

    var pathEt = hMax.rise / Math.sin(etAngle * RAD);
    var pathNpu = hMax.rise / Math.sin(npuAngle * RAD);

    var minPassEt = (hMax.height + 51) / Math.tan(etAngle * RAD) + 1174 +
      mismatchPenalty(stairAngle, etAngle, hMax.rise, hMax.height);
    var minPassNpu = (hMax.height + 40) / Math.tan(npuAngle * RAD) + 1222.5 +
      mismatchPenalty(stairAngle, npuAngle, hMax.rise, hMax.height);

    return {
      et: {
        angle: etAngle,
        path: pathEt,
        minPass: minPassEt,
        minSide: minPassEt - 174,
        angleSin: etSin,
        angleCos: Math.cos(etAngle * RAD)
      },
      npu: {
        angle: npuAngle,
        path: pathNpu,
        minPass: minPassNpu,
        minSide: minPassNpu - 145,
        angleSin: npuSin,
        angleCos: Math.cos(npuAngle * RAD)
      },
      shift: shift
    };
  }

  /** Проверка варианта исполнения: ширина марша + длина нижней площадки. */
  function checkVariant(family, variant, params, widthStair, downFloor) {
    var minWidth = WIDTH_MIN[family][variant];
    var limit = SIDE_SENSITIVE[family][variant] ? params.minSide : params.minPass;
    var widthOk = toNumber(widthStair) !== null && Number(widthStair) >= minWidth;
    var floorOk = toNumber(downFloor) !== null && Number(downFloor) >= limit;
    return widthOk && floorOk;
  }

  /**
   * Полный расчёт.
   * @param {object} input {heights, lengths, downFloor, widthStair, upperFloor, ramp, shortNpu}
   */
  function compute(input) {
    input = input || {};
    var heights = input.heights || [];
    var lengths = input.lengths || [];
    var steps = collectSteps(heights, lengths);

    var stairAngle = 0;
    var rise = sum(steps.map(function (s) { return s.rise; }));
    var along = 0;
    var run = 0;

    if (steps.length >= 2) {
      var treads = [];
      for (var i = 0; i < steps.length - 1; i++) treads.push(steps[i].tread);
      var treadSum = sum(treads);
      var lastTread = treads[treads.length - 1] || 0;
      // В калькуляторе к сумме проступей добавляется ещё одна (верхняя)
      // проступь — именно так получается угол из 9×150 и 8×300.
      run = treadSum + lastTread;
      for (var j = 0; j < steps.length - 1; j++) {
        along += hypot(steps[j].rise, steps[j].tread);
      }
      stairAngle = run > 0 ? Math.atan2(rise, run) * DEG : 0;
    }

    var hMax = { height: 0, rise: rise };
    for (var k = 0; k < steps.length; k++) {
      if (steps[k].rise > hMax.height) hMax.height = steps[k].rise;
    }

    var params = platformParams(hMax, stairAngle, input.ramp);
    var result = {
      steps: steps.length,
      rise: rise,
      run: run,
      along: along,
      stairAngle: stairAngle,
      feasible: steps.length >= 2 && run > 0,
      et: params.et,
      npu: params.npu,
      ramp: toNumber(input.ramp) || 0,
      rampTitle: RAMP_TITLES[toNumber(input.ramp) || 0] || '',
      shortNpu: !!input.shortNpu,
      input: {
        heights: steps.map(function (s) { return s.rise; }),
        lengths: steps.map(function (s) { return s.tread; }),
        downFloor: toNumber(input.downFloor),
        widthStair: toNumber(input.widthStair),
        upperFloor: toNumber(input.upperFloor)
      },
      pass: {}
    };

    VARIANTS.forEach(function (variant) {
      result.pass['et_' + variant] = checkVariant('et', variant, params.et, input.widthStair, input.downFloor);
      result.pass['npu_' + variant] = checkVariant('npu', variant, params.npu, input.widthStair, input.downFloor);
    });

    // «Сложная траектория»: посчитать платформу нельзя.
    if (!result.feasible) {
      result.et.angle = 0; result.et.path = 0;
      result.npu.angle = 0; result.npu.path = 0;
      VARIANTS.forEach(function (variant) {
        result.pass['et_' + variant] = false;
        result.pass['npu_' + variant] = false;
      });
    }

    return result;
  }

  return {
    compute: compute,
    MAX_ANGLE_DEG: MAX_ANGLE_DEG,
    WIDTH_MIN: WIDTH_MIN,
    VARIANTS: VARIANTS,
    VARIANT_TITLES: VARIANT_TITLES,
    RAMP_TITLES: RAMP_TITLES,
    collectSteps: collectSteps
  };
});
