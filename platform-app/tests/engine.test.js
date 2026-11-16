/**
 * Тесты движка расчёта. Запуск:  node tests/engine.test.js
 */
'use strict';

const assert = require('assert');
const E = require('../js/engine.js');

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok   ' + name);
  } catch (err) {
    failures.push({ name, err });
    console.log('FAIL ' + name + ' — ' + err.message);
  }
}

/** 12 ступеней 160×320, площадки по 1000, марш 1100. */
function sample(overrides) {
  const rows = Array.from({ length: 30 }, () => ({ rise: '', tread: '' }));
  for (let i = 0; i < 12; i += 1) {
    rows[i] = { rise: 160, tread: i === 11 ? '' : 320 };
  }
  return Object.assign({ rows, lower: 1000, upper: 1000, width: 1100, ramp: '0', npu: false }, overrides || {});
}

test('высота подъёма — сумма высот', () => {
  assert.strictEqual(E.compute(sample()).rise, 12 * 160);
});

test('длина по ступеням — без последней проступи', () => {
  assert.strictEqual(E.compute(sample()).stepsRun, 11 * 320);
});

test('угол подъёма по arctg', () => {
  assert.strictEqual(E.compute(sample()).angleDeg, 28.6);
});

test('длина по наклону — гипотенуза', () => {
  const r = E.compute(sample());
  assert.strictEqual(r.slope, Math.round(Math.hypot(1920, 3520) * 10) / 10);
});

test('направляющая с запасом с двух сторон', () => {
  const r = E.compute(sample());
  assert.strictEqual(r.rail, r.slope + 500);
});

test('точки крепления по шагу 1,5 м', () => {
  const r = E.compute(sample());
  assert.strictEqual(r.supports, Math.ceil(r.rail / 1500));
});

test('обычный пандус не меняет платформу', () => {
  assert.strictEqual(E.compute(sample({ ramp: '0' })).platform.length, 1100);
});

test('удлинённые пандусы добавляют длину', () => {
  assert.strictEqual(E.compute(sample({ ramp: '50' })).platform.length, 1150);
  assert.strictEqual(E.compute(sample({ ramp: '100' })).platform.length, 1200);
  assert.strictEqual(E.compute(sample({ ramp: '150' })).platform.length, 1250);
});

test('НПУ укорачивает платформу на 150 мм', () => {
  assert.strictEqual(E.compute(sample({ npu: true })).platform.length, 950);
});

test('НПУ и удлинённый пандус складываются', () => {
  assert.strictEqual(E.compute(sample({ ramp: '150', npu: true })).platform.length, 1100);
});

test('ширина платформы — марш минус 100 мм', () => {
  assert.strictEqual(E.compute(sample({ width: 1300 })).platform.width, 1200);
});

test('ширина платформы не ниже 800 мм', () => {
  assert.strictEqual(E.compute(sample({ width: 850 })).platform.width, 800);
});

test('пустая ступень внутри марша — ошибка пропуска', () => {
  const rows = sample().rows.slice();
  rows[5] = { rise: '', tread: '' };
  const r = E.compute(Object.assign(sample(), { rows }));
  assert.strictEqual(r.feasible, false);
  assert.ok(r.warnings.some((w) => /пропускать нельзя/.test(w.text)));
});

test('угол больше 30° — не проходит', () => {
  const rows = Array.from({ length: 30 }, () => ({ rise: '', tread: '' }));
  for (let i = 0; i < 12; i += 1) rows[i] = { rise: 200, tread: 250 };
  const r = E.compute(Object.assign(sample(), { rows }));
  assert.ok(r.angleDeg > 30);
  assert.strictEqual(r.feasible, false);
});

test('длина подъёма больше 10 м — не проходит', () => {
  const rows = Array.from({ length: 30 }, () => ({ rise: '', tread: '' }));
  for (let i = 0; i < 30; i += 1) rows[i] = { rise: 370, tread: 300 };
  const r = E.compute(Object.assign(sample(), { rows }));
  assert.ok(r.rise > 10000);
  assert.strictEqual(r.feasible, false);
});

test('типовая лестница проходит', () => {
  assert.strictEqual(E.compute(sample()).feasible, true);
});

test('короткая проступь даёт предупреждение', () => {
  const rows = Array.from({ length: 30 }, () => ({ rise: '', tread: '' }));
  for (let i = 0; i < 12; i += 1) rows[i] = { rise: 160, tread: 200 };
  const r = E.compute(Object.assign(sample(), { rows }));
  assert.ok(r.warnings.some((w) => /Проступь меньше 250/.test(w.text)));
});

test('разброс высот ступеней даёт предупреждение', () => {
  const rows = sample().rows.slice();
  rows[3] = { rise: 190, tread: 320 };
  const r = E.compute(Object.assign(sample(), { rows }));
  assert.ok(r.warnings.some((w) => /различаются/.test(w.text)));
});

test('проступь последней ступени не учитывается', () => {
  const rows = sample().rows.slice();
  rows[11] = { rise: 160, tread: 500 };
  const r = E.compute(Object.assign(sample(), { rows }));
  assert.strictEqual(r.stepsRun, 11 * 320);
  assert.ok(r.warnings.some((w) => w.level === 'info' && /последней/.test(w.text)));
});

test('настройка угла переопределяется', () => {
  const rows = Array.from({ length: 30 }, () => ({ rise: '', tread: '' }));
  for (let i = 0; i < 12; i += 1) rows[i] = { rise: 200, tread: 250 };
  const strict = E.compute(Object.assign(sample(), { rows }));
  const loose = E.compute(Object.assign(sample(), { rows }), { maxAngleDeg: 45 });
  assert.strictEqual(strict.feasible, false);
  assert.strictEqual(loose.feasible, true);
  assert.ok(loose.warnings.every((w) => !/больше допустимых/.test(w.text)));
});

test('пустая таблица не падает', () => {
  const r = E.compute({ rows: [], lower: 0, upper: 0, width: 0 });
  assert.strictEqual(r.stepsCount, 0);
  assert.strictEqual(r.feasible, false);
  assert.ok(r.warnings.length > 0);
});

test('collectSteps отбрасывает строки после пустой', () => {
  const { steps, gapAt } = E.collectSteps([
    { rise: 100, tread: 300 }, { rise: 100, tread: 300 }, { rise: '', tread: '' }, { rise: 100, tread: 300 },
  ]);
  assert.strictEqual(steps.length, 3);
  assert.strictEqual(gapAt, 3);
});

console.log('');
console.log(`Пройдено: ${passed}, провалено: ${failures.length}`);

if (failures.length) {
  for (const f of failures) {
    console.error('\n' + f.name + '\n' + (f.err.stack || f.err.message));
  }
  process.exit(1);
}
