/* Логика повторяет liftcalc/calc.py. Меняя константы, правьте оба файла. */

const G = 9.81;

const MIN_ANGLE = 15;
const MAX_ANGLE = 45;
const STEP_MIN_MM = 150;
const STEP_MAX_MM = 200;
const MIN_CLEAR_WIDTH = 0.9;

const RAIL_RESERVE = 0.35;
const TURN_EXTRA = 1.6;
const SUPPORT_SPACING = 1.5;
const FRICTION = 0.02;
const EFFICIENCY = 0.75;
const ACCEL = 0.1;
const BOARDING_S = 3.0;

const SPEED = { platform: 0.1, seat: 0.15 };
const MOVING_MASS = { platform: 120, seat: 45 };
const PLATFORM_LEN = { platform: 1.2, seat: 0.55 };
const PLATFORM_WIDTH = { platform: 0.8, seat: 0.45 };

const PRICE = {
  base: 320000,
  perRailMeter: 42000,
  railIncluded: 3.0,
  turn: 90000,
  wheelchair: 50000,
  installation: 0.12,
};

const nf = (min, max) => new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: min,
  maximumFractionDigits: max,
});

const money = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

const meters = (v) => `${nf(2, 2).format(v)} м`;
const rub = (v) => `${money.format(Math.round(v))} ₽`;

function compute(input) {
  const angleRad = Math.atan2(input.height, input.run);
  const angleDeg = (angleRad * 180) / Math.PI;
  const slope = Math.hypot(input.height, input.run);

  let rail = slope + 2 * RAIL_RESERVE;
  if (input.track === 'turn') rail += TURN_EXTRA;
  const supports = Math.max(2, Math.ceil(rail / SUPPORT_SPACING));

  const stepHeight = (input.height / input.steps) * 1000;
  const clearance = Math.max(0, input.width - 0.1);
  const platformLength = PLATFORM_LEN[input.kind];
  const platformWidth = PLATFORM_WIDTH[input.kind];

  const speed = SPEED[input.kind];
  const travelTime = slope / speed;
  const totalTime = travelTime + 2 * BOARDING_S;

  const movingMass = input.payload + MOVING_MASS[input.kind];
  const traction = movingMass * G * (Math.sin(angleRad) + FRICTION * Math.cos(angleRad))
    + movingMass * ACCEL;
  const powerKw = (traction * speed) / EFFICIENCY / 1000;

  const loadPerSupport = (movingMass * G * Math.cos(angleRad)) / supports;

  const extraMeters = Math.max(0, rail - PRICE.railIncluded);
  const extraRail = extraMeters * PRICE.perRailMeter;
  const turn = input.track === 'turn' ? PRICE.turn : 0;
  const wheelchair = input.kind === 'platform' ? PRICE.wheelchair : 0;
  const subtotal = PRICE.base + extraRail + turn + wheelchair;
  const installation = subtotal * PRICE.installation;

  const price = {
    base: PRICE.base,
    extraRail,
    turn,
    wheelchair,
    installation,
    total: subtotal + installation,
  };

  const warnings = collectWarnings({
    input, angleDeg, stepHeight, clearance, platformWidth, rail, powerKw,
  });

  return {
    angleDeg, slope, rail, supports, stepHeight, clearance,
    platformLength, platformWidth, speed, travelTime, totalTime,
    movingMass, traction, powerKw, loadPerSupport, price, warnings,
    feasible: !warnings.some((w) => w.level === 'error'),
  };
}

function collectWarnings({ input, angleDeg, stepHeight, clearance, platformWidth, rail, powerKw }) {
  const out = [];

  if (angleDeg < MIN_ANGLE) {
    out.push({ level: 'error', text: `Угол наклона ${nf(1, 1).format(angleDeg)}° меньше ${MIN_ANGLE}°: рельсовый подъёмник теряет смысл, нужен вертикальный вариант.` });
  } else if (angleDeg > MAX_ANGLE) {
    out.push({ level: 'error', text: `Угол наклона ${nf(1, 1).format(angleDeg)}° больше ${MAX_ANGLE}°: платформа не удержится на рельсе, требуется другой тип подъёмника.` });
  }

  if (stepHeight < STEP_MIN_MM) {
    out.push({ level: 'warn', text: `Шаг ступени ${nf(0, 0).format(stepHeight)} мм ниже ${STEP_MIN_MM} мм — ступени слишком пологие, проверьте число ступеней.` });
  } else if (stepHeight > STEP_MAX_MM) {
    out.push({ level: 'warn', text: `Шаг ступени ${nf(0, 0).format(stepHeight)} мм выше ${STEP_MAX_MM} мм — неудобно и небезопасно, проверьте число ступеней.` });
  }

  if (clearance < MIN_CLEAR_WIDTH) {
    out.push({ level: 'error', text: `Свободная ширина марша ${nf(2, 2).format(clearance)} м меньше ${nf(2, 2).format(MIN_CLEAR_WIDTH)} м — подъёмник не поместится.` });
  } else if (clearance < platformWidth + 0.1) {
    out.push({ level: 'warn', text: `Свободная ширина ${nf(2, 2).format(clearance)} м впритык для платформы ${nf(2, 2).format(platformWidth)} м — останется меньше 10 см сбоку.` });
  }

  if (rail > 12) {
    out.push({ level: 'warn', text: `Длина направляющей ${nf(1, 1).format(rail)} м — трасса длинная, потребуется промежуточная опора и проверка прогиба.` });
  }

  if (input.height > 6) {
    out.push({ level: 'info', text: `Высота подъёма ${nf(1, 1).format(input.height)} м: проверьте требования пожарной безопасности и аварийного спуска.` });
  }

  if (powerKw > 1.5) {
    out.push({ level: 'info', text: `Расчётная мощность ${nf(2, 2).format(powerKw)} кВт — нужен редуктор повышенной мощности и отдельная линия питания.` });
  }

  if (input.payload > 400) {
    out.push({ level: 'warn', text: `Грузоподъёмность ${nf(0, 0).format(input.payload)} кг выше типовой (400 кг) — требуется усиленная платформа.` });
  }

  return out;
}

/* ---------- Отрисовка ---------- */

const $ = (id) => document.getElementById(id);

function readInput() {
  const height = parseFloat($('height').value);
  const run = parseFloat($('run').value);
  const width = parseFloat($('width').value);
  const steps = parseInt($('steps').value, 10);
  const payload = parseFloat($('payload').value);

  if (![height, run, width, steps, payload].every(Number.isFinite)) return null;
  if (height <= 0 || run <= 0 || width <= 0 || steps < 2 || payload <= 0) return null;

  return { height, run, width, steps, payload, track: $('track').value, kind: $('kind').value };
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function render() {
  const input = readInput();
  const verdict = $('verdict');

  if (!input) {
    verdict.textContent = 'Проверьте введённые значения';
    verdict.className = 'verdict bad';
    return;
  }

  const r = compute(input);

  setText('out-angle', `${nf(1, 1).format(r.angleDeg)}°`);
  setText('out-slope', meters(r.slope));
  setText('out-rail', meters(r.rail));
  setText('out-supports', `${r.supports} шт.`);
  setText('out-step', `${nf(0, 0).format(r.stepHeight)} мм`);
  setText('out-clear', meters(r.clearance));
  setText('out-platform', `${nf(2, 2).format(r.platformLength)} × ${nf(2, 2).format(r.platformWidth)} м`);
  setText('out-speed', `${nf(2, 2).format(r.speed)} м/с`);
  setText('out-time', `${nf(1, 1).format(r.travelTime)} с`);
  setText('out-cycle', `${nf(1, 1).format(r.totalTime)} с`);
  setText('out-mass', `${nf(0, 0).format(r.movingMass)} кг`);
  setText('out-force', `${nf(0, 0).format(r.traction)} Н`);
  setText('out-power', `${nf(2, 2).format(r.powerKw)} кВт`);
  setText('out-load', `${nf(0, 0).format(r.loadPerSupport)} Н`);

  setText('p-base', rub(r.price.base));
  setText('p-extra', rub(r.price.extraRail));
  setText('p-turn', rub(r.price.turn));
  setText('p-wheel', rub(r.price.wheelchair));
  setText('p-install', rub(r.price.installation));
  setText('p-total', rub(r.price.total));

  verdict.textContent = r.feasible ? 'Проект выполним' : 'Проект не выполним в таком виде';
  verdict.className = r.feasible ? 'verdict' : 'verdict bad';

  const box = $('warnings');
  box.replaceChildren(...r.warnings.map((w) => {
    const p = document.createElement('p');
    p.className = w.level;
    p.textContent = w.text;
    return p;
  }));
}

/* ---------- События ---------- */

if (typeof document !== 'undefined') {
  const form = $('form');

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', (e) => e.preventDefault());

  $('reset').addEventListener('click', () => {
    window.setTimeout(render, 0);
  });

  $('print').addEventListener('click', () => window.print());

  render();
}

/* Для проверки расчёта в Node: модуль отдаёт compute. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { compute };
}
