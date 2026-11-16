/*
 * Сверка ядра с замерами живого калькулятора (лесенка74.рф).
 * Каждый набор — вход и снятый с сайта ответ. Геометрия сверяется точно,
 * параметры платформы — с точностью до единиц миллиметров.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../js/engine.js');

const uniform = (steps, stepRise, tread) => ({
  heights: Array(steps).fill(stepRise),
  lengths: [...Array(steps - 1).fill(tread), null],
});

const base = {
  downFloor: 3000,
  widthStair: 1500,
  upperFloor: 1000,
  ramp: 0,
  shortNpu: true,
};

function check(input, expected, tolerance = {}) {
  const actual = engine.compute(input);
  const tolAngle = tolerance.angle ?? 0.05;
  const tolMm = tolerance.mm ?? 2;

  assert.ok(Math.abs(actual.stairAngle - expected.stairAngle) <= tolAngle,
    `угол лестницы: ${actual.stairAngle} vs ${expected.stairAngle}`);
  assert.equal(Math.round(actual.rise), expected.rise, 'высота подъёма');
  assert.ok(Math.abs(actual.along - expected.along) <= tolMm,
    `длина подъёма: ${actual.along} vs ${expected.along}`);

  for (const family of ['et', 'npu']) {
    const exp = expected[family];
    const got = actual[family];
    assert.ok(Math.abs(got.angle - exp.angle) <= (tolerance.familyAngle ?? 0.15),
      `${family} угол: ${got.angle} vs ${exp.angle}`);
    assert.ok(Math.abs(got.path - exp.path) <= (tolerance.path ?? 12),
      `${family} путь: ${got.path} vs ${exp.path}`);
    assert.ok(Math.abs(got.minPass - exp.minPass) <= (tolerance.minPass ?? 6),
      `${family} minPass: ${got.minPass} vs ${exp.minPass}`);
    assert.ok(Math.abs(got.minSide - exp.minSide) <= (tolerance.minSide ?? 6),
      `${family} minSide: ${got.minSide} vs ${exp.minSide}`);
  }
  return actual;
}

const passedKeys = (actual) => Object.keys(actual.pass).filter((k) => actual.pass[k]).sort();

test('9×150/300 — базовый расчёт', () => {
  const actual = check(
    Object.assign({}, base, uniform(9, 150, 300)),
    {
      stairAngle: 26.6, rise: 1350, along: 2683,
      et: { angle: 26, path: 3079, minPass: 1639, minSide: 1465 },
      npu: { angle: 26.6, path: 3015, minPass: 1602, minSide: 1457 },
    },
    { familyAngle: 0.05, path: 2, minPass: 2, minSide: 2 },
  );
  assert.equal(Object.values(actual.pass).filter(Boolean).length, 12, 'все 12 вариантов проходят');
});

test('9×150/300, ширина 1200 — проходной EasyTrap и четыре варианта НПУ', () => {
  const actual = engine.compute(Object.assign({}, base, uniform(9, 150, 300), { widthStair: 1200 }));
  assert.deepEqual(passedKeys(actual), [
    'et_passage_to_wall',
    'npu_3side_to_wall',
    'npu_passage_on_supports',
    'npu_passage_to_wall',
    'npu_side_to_wall',
  ]);
});

test('9×150/300, ширина 1099 — у EasyTrap не проходит ничего', () => {
  const actual = engine.compute(Object.assign({}, base, uniform(9, 150, 300), { widthStair: 1099 }));
  assert.deepEqual(passedKeys(actual), ['npu_passage_to_wall']);
});

test('нижняя площадка 1465 — боковые EasyTrap и проходные НПУ', () => {
  const actual = engine.compute(Object.assign({}, base, uniform(9, 150, 300), { downFloor: 1465 }));
  assert.deepEqual(passedKeys(actual), [
    'et_side_on_supports',
    'et_side_to_wall',
    'npu_passage_on_supports',
    'npu_passage_to_wall',
  ]);
});

test('нижняя площадка 1639 — проходит всё', () => {
  const actual = engine.compute(Object.assign({}, base, uniform(9, 150, 300), { downFloor: 1639 }));
  assert.equal(Object.values(actual.pass).filter(Boolean).length, 12);
});

test('5×150/300 — короткая лестница', () => {
  check(
    Object.assign({}, base, uniform(5, 150, 300)),
    {
      stairAngle: 26.6, rise: 750, along: 1341,
      et: { angle: 26, path: 1711, minPass: 1609, minSide: 1435 },
      npu: { angle: 26.6, path: 1675, minPass: 1602, minSide: 1457 },
    },
    { familyAngle: 0.05, path: 2, minPass: 3, minSide: 3 },
  );
});

test('12×150/300 — длинная лестница', () => {
  check(
    Object.assign({}, base, uniform(12, 150, 300)),
    {
      stairAngle: 26.6, rise: 1800, along: 3689,
      et: { angle: 26, path: 4106, minPass: 1662, minSide: 1488 },
      npu: { angle: 26.6, path: 4020, minPass: 1602, minSide: 1457 },
    },
    { familyAngle: 0.05, path: 2, minPass: 3, minSide: 3 },
  );
});

test('20×150/300 — 3 метра подъёма', () => {
  check(
    Object.assign({}, base, uniform(20, 150, 300)),
    {
      stairAngle: 26.6, rise: 3000, along: 6372,
      et: { angle: 26, path: 6843, minPass: 1722, minSide: 1548 },
      npu: { angle: 26.6, path: 6700, minPass: 1602, minSide: 1457 },
    },
    { familyAngle: 0.05, path: 3, minPass: 3, minSide: 3 },
  );
});

test('6×200/300 — крутая лестница, угол упирается в 30°', () => {
  check(
    Object.assign({}, base, uniform(6, 200, 300)),
    {
      stairAngle: 33.7, rise: 1200, along: 1802,
      et: { angle: 30, path: 2399, minPass: 1795, minSide: 1621 },
      npu: { angle: 30, path: 2399, minPass: 1824, minSide: 1679 },
    },
    { familyAngle: 0.1, path: 3, minPass: 8, minSide: 8 },
  );
});

test('9×180/280 — крутая лестница средней высоты', () => {
  check(
    Object.assign({}, base, uniform(9, 180, 280)),
    {
      stairAngle: 32.7, rise: 1620, along: 2662,
      et: { angle: 30, path: 3240, minPass: 1797, minSide: 1623 },
      npu: { angle: 30, path: 3240, minPass: 1826, minSide: 1681 },
    },
    { familyAngle: 0.1, path: 4, minPass: 8, minSide: 8 },
  );
});

test('9×120/350 — пологая лестница', () => {
  check(
    Object.assign({}, base, uniform(9, 120, 350)),
    {
      stairAngle: 18.9, rise: 1080, along: 2960,
      et: { angle: 18, path: 3495, minPass: 1834, minSide: 1660 },
      npu: { angle: 18.9, path: 3333, minPass: 1694, minSide: 1549 },
    },
    { familyAngle: 0.1, path: 6, minPass: 6, minSide: 6 },
  );
});

test('8×180/369 — высокая ступень', () => {
  check(
    Object.assign({}, base, uniform(8, 180, 369)),
    {
      stairAngle: 26.0, rise: 1440, along: 2874,
      et: { angle: 26, path: 3284, minPass: 1648, minSide: 1474 },
      npu: { angle: 26.0, path: 3284, minPass: 1674, minSide: 1529 },
    },
    { familyAngle: 0.1, path: 4, minPass: 4, minSide: 4 },
  );
});

test('10×150/308 на 20° — пологий марш', () => {
  check(
    Object.assign({}, base, uniform(10, 150, 412)),
    {
      stairAngle: 20.0, rise: 1500, along: 3946,
      et: { angle: 20, path: 4385, minPass: 1726, minSide: 1552 },
      npu: { angle: 20.0, path: 4385, minPass: 1746, minSide: 1601 },
    },
    { familyAngle: 0.1, path: 4, minPass: 4, minSide: 4 },
  );
});

test('10×150/282 на 28° — крутой марш', () => {
  check(
    Object.assign({}, base, uniform(10, 150, 282)),
    {
      stairAngle: 28.0, rise: 1500, along: 2875,
      et: { angle: 28, path: 3195, minPass: 1553, minSide: 1379 },
      npu: { angle: 28.0, path: 3195, minPass: 1581, minSide: 1436 },
    },
    { familyAngle: 0.1, path: 4, minPass: 4, minSide: 4 },
  );
});

test('удлинённый пандус 50 мм поднимает угол НПУ', () => {
  const actual = check(
    Object.assign({}, base, uniform(10, 150, 308), { ramp: 50 }),
    {
      stairAngle: 26.0, rise: 1500, along: 3083,
      et: { angle: 26, path: 3421, minPass: 1586, minSide: 1412 },
      npu: { angle: 26.9, path: 3315, minPass: 1598, minSide: 1453 },
    },
    { familyAngle: 0.2, path: 30, minPass: 10, minSide: 10 },
  );
  assert.ok(actual.npu.angle > actual.stairAngle, 'угол НПУ должен вырасти');
});

test('удлинённый пандус 100 мм даёт угол EasyTrap 27°', () => {
  const actual = engine.compute(Object.assign({}, base, uniform(10, 150, 308), { ramp: 100 }));
  assert.equal(actual.et.angle, 27);
  assert.ok(Math.abs(actual.et.minPass - 1569) <= 10, `et minPass ${actual.et.minPass}`);
  assert.ok(Math.abs(actual.npu.angle - 27.4) <= 0.2, `npu угол ${actual.npu.angle}`);
});

test('сложная траектория: одна ступень', () => {
  const actual = engine.compute({
    heights: [150], lengths: [null], downFloor: 3000, widthStair: 1500, upperFloor: 1000, ramp: 0,
  });
  assert.equal(actual.feasible, false);
  assert.equal(actual.et.angle, 0);
  assert.equal(Object.values(actual.pass).filter(Boolean).length, 0);
});

test('пустые проступи не ломают расчёт', () => {
  const actual = engine.compute({
    heights: [150, 150, 150, 150],
    lengths: [300, null, 300, null],
    downFloor: 3000, widthStair: 1500, upperFloor: 1000, ramp: 0,
  });
  assert.equal(actual.steps, 4);
  assert.ok(actual.stairAngle > 0);
});
