/* Логика повторяет platformcalc/calc.py. Меняя константы, правьте оба файла. */

const MAX_RISE_MM = 10000;
const MAX_ANGLE = 30;
const MIN_WIDTH_MM = 900;

const PLATFORM_BASE_MM = 1100;
const PLATFORM_MARGIN_MM = 100;
const MIN_PLATFORM_WIDTH_MM = 800;

const RAIL_TAIL_MM = 250;
const SUPPORT_SPACING_MM = 1500;
const SPEED_MPS = 0.1;
const BOARDING_S = 3.0;

const G = 9.81;
const FRICTION = 0.02;
const EFFICIENCY = 0.75;
const PLATFORM_MASS = 120;

const RAMP_DELTA = { normal: 0, ext50: 50, ext100: 100, ext150: 150, short_npu: -150 };
const RAMP_TITLES = {
  normal: 'Обычный пандус',
  ext50: 'Удлинённый пандус на 50 мм',
  ext100: 'Удлинённый пандус на 100 мм',
  ext150: 'Удлинённый пандус на 150 мм',
  short_npu: 'Укороченная площадка НПУ',
};

const MIN_STEPS = 2;
const MAX_STEPS = 30;

const num = (min, max) => new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: min,
  maximumFractionDigits: max,
});

const mmText = (v) => `${num(0, 0).format(Math.round(v))} мм`;
const mText = (v) => `${num(2, 2).format(v / 1000)} м`;

function compute(input) {
  const steps = input.steps;
  const count = steps.length;

  const rises = steps.map((s) => s.rise);
  const treads = steps.slice(0, -1).map((s) => s.tread);

  const rise = rises.reduce((a, b) => a + b, 0);
  const stepsRun = treads.reduce((a, b) => a + b, 0);
  const totalRun = input.lower + stepsRun + input.upper;

  const angleDeg = stepsRun > 0 ? (Math.atan2(rise, stepsRun) * 180) / Math.PI : 90;
  const slope = stepsRun > 0 ? Math.hypot(rise, stepsRun) : rise;

  const extension = RAMP_DELTA[input.ramp];
  const platformLength = Math.max(600, PLATFORM_BASE_MM + extension);
  const platformWidth = Math.max(MIN_PLATFORM_WIDTH_MM, input.width - PLATFORM_MARGIN_MM);

  const rail = slope + 2 * RAIL_TAIL_MM;
  const supports = Math.max(2, Math.ceil(rail / SUPPORT_SPACING_MM));

  const avgRise = rise / count;
  const spread = Math.max(...rises) - Math.min(...rises);

  const angleRad = (angleDeg * Math.PI) / 180;
  const movingMass = input.payload + PLATFORM_MASS;
  const traction = movingMass * G * (Math.sin(angleRad) + FRICTION * Math.cos(angleRad));
  const powerKw = (traction * SPEED_MPS) / EFFICIENCY / 1000;

  const travelTime = slope / 1000 / SPEED_MPS;
  const totalTime = travelTime + 2 * BOARDING_S;
  const loadPerSupport = (movingMass * G * Math.cos(angleRad)) / supports;

  const platform = {
    length: platformLength,
    width: platformWidth,
    ramp: input.ramp,
    rampTitle: RAMP_TITLES[input.ramp],
    extension,
  };

  const warnings = collectWarnings({
    input, rise, stepsRun, angleDeg, avgRise, spread, platform,
  });

  return {
    count, rise, stepsRun, totalRun, angleDeg, slope, rail, supports,
    platform, avgRise, spread, travelTime, totalTime,
    movingMass, traction, powerKw, loadPerSupport, warnings,
    feasible: !warnings.some((w) => w.level === 'error'),
  };
}

function collectWarnings({ input, rise, stepsRun, angleDeg, avgRise, spread, platform }) {
  const out = [];

  if (stepsRun <= 0) {
    out.push({ level: 'error', text: 'Сумма проступей равна нулю: угол подъёма 90°, платформа невозможна.' });
  }

  if (angleDeg > MAX_ANGLE) {
    out.push({ level: 'error', text: `Угол подъёма ${num(1, 1).format(angleDeg)}° больше допустимых ${MAX_ANGLE}°.` });
  }

  if (rise > MAX_RISE_MM) {
    out.push({ level: 'error', text: `Высота подъёма ${num(2, 2).format(rise / 1000)} м больше допустимых ${MAX_RISE_MM / 1000} м.` });
  }

  if (input.width < MIN_WIDTH_MM) {
    out.push({ level: 'warn', text: `Ширина марша ${num(2, 2).format(input.width / 1000)} м меньше ${num(2, 2).format(MIN_WIDTH_MM / 1000)} м: платформа будет уже типовой.` });
  }

  if (platform.width < 800) {
    out.push({ level: 'error', text: `Расчётная ширина платформы ${num(0, 0).format(platform.width)} мм меньше минимальных 800 мм.` });
  }

  if (spread > 5) {
    out.push({ level: 'warn', text: `Высоты ступеней различаются на ${num(0, 0).format(spread)} мм: направляющая получит излом, проверьте геометрию.` });
  }

  if (avgRise > 200) {
    out.push({ level: 'warn', text: `Средняя высота ступени ${num(0, 0).format(avgRise)} мм выше 200 мм — неудобно для коляски.` });
  } else if (avgRise < 100) {
    out.push({ level: 'warn', text: `Средняя высота ступени ${num(0, 0).format(avgRise)} мм ниже 100 мм — проверьте число ступеней.` });
  }

  const shortTreads = [];
  input.steps.slice(0, -1).forEach((s, i) => {
    if (s.tread < 250) shortTreads.push(i + 1);
  });
  if (shortTreads.length) {
    const listed = shortTreads.slice(0, 6).join(', ');
    const tail = shortTreads.length > 6 ? ' и др.' : '';
    out.push({ level: 'warn', text: `Проступь меньше 250 мм у ступеней ${listed}${tail}: платформе не хватит места для безопасного проезда.` });
  }

  if (input.steps[input.steps.length - 1].tread > 0) {
    out.push({ level: 'info', text: 'Длина проступи последней ступени не учитывается: её роль играет верхняя площадка.' });
  }

  if (platform.extension < 0) {
    out.push({ level: 'info', text: `${platform.rampTitle}: длина платформы уменьшена на ${num(0, 0).format(Math.abs(platform.extension))} мм, проверьте угол въезда.` });
  }

  return out;
}

/* ---------- Состояние ---------- */

const $ = (id) => document.getElementById(id);

const DEFAULT_STEPS = Array.from({ length: 12 }, () => ({ rise: 160, tread: 320 }));
let steps = DEFAULT_STEPS.map((s) => ({ ...s }));

function svgEl(name, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function renderRows() {
  const holder = $('rows');
  holder.replaceChildren();

  steps.forEach((step, index) => {
    const row = document.createElement('div');
    row.className = 'step-row';

    const numCell = document.createElement('span');
    numCell.className = 'num';
    numCell.textContent = String(index + 1);

    const rise = document.createElement('input');
    rise.type = 'number';
    rise.min = '1';
    rise.max = '400';
    rise.step = '1';
    rise.value = String(step.rise);
    rise.setAttribute('aria-label', `Высота ступени ${index + 1}, мм`);
    rise.addEventListener('input', () => {
      step.rise = Number(rise.value);
      render();
    });

    const tread = document.createElement('input');
    tread.type = 'number';
    tread.min = '0';
    tread.max = '1200';
    tread.step = '1';
    tread.value = String(index === steps.length - 1 ? 0 : step.tread);
    tread.disabled = index === steps.length - 1;
    tread.setAttribute('aria-label', `Длина проступи ${index + 1}, мм`);
    tread.addEventListener('input', () => {
      step.tread = Number(tread.value);
      render();
    });

    row.append(numCell, rise, tread);
    holder.append(row);
  });

  $('add-step').disabled = steps.length >= MAX_STEPS;
  $('remove-step').disabled = steps.length <= MIN_STEPS;
}

function readInput() {
  const lower = parseFloat($('lower').value);
  const upper = parseFloat($('upper').value);
  const width = parseFloat($('width').value);
  const payload = parseFloat($('payload').value);

  if (![lower, upper, width, payload].every(Number.isFinite)) return null;
  if (steps.length < MIN_STEPS) return null;
  if (steps.some((s) => !Number.isFinite(s.rise) || s.rise <= 0)) return null;
  if (steps.some((s, i) => i < steps.length - 1 && (!Number.isFinite(s.tread) || s.tread < 0))) return null;

  return { steps: steps.map((s) => ({ ...s })), lower, upper, width, payload, ramp: $('ramp').value };
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function drawScheme(r) {
  const svg = $('scheme');
  svg.replaceChildren();

  const W = 480;
  const H = 260;
  const pad = 46;

  const run = Math.max(r.stepsRun, 1);
  const rise = Math.max(r.rise, 1);
  const scale = Math.min((W - 2 * pad) / run, (H - 2 * pad) / rise);

  const x0 = pad;
  const y0 = H - pad;
  const xEnd = x0 + run * scale;
  const yEnd = y0 - rise * scale;

  // Ступени
  const points = [[x0, y0]];
  let x = x0;
  let y = y0;
  r.stepsData.forEach((step, i) => {
    y -= step.rise * scale;
    points.push([x, y]);
    if (i < r.stepsData.length - 1) {
      x += step.tread * scale;
      points.push([x, y]);
    }
  });
  points.push([xEnd, yEnd]);

  svg.append(svgEl('polyline', {
    points: points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' '),
    fill: 'none',
    stroke: '#0f766e',
    'stroke-width': 2,
    'stroke-linejoin': 'round',
  }));

  // Линия подъёма
  svg.append(svgEl('line', {
    x1: x0, y1: y0, x2: xEnd, y2: yEnd,
    stroke: '#b42318',
    'stroke-width': 1.5,
    'stroke-dasharray': '6 4',
  }));

  // Дуга угла
  const arcR = 42;
  const ax = x0 + arcR;
  const ay = y0;
  svg.append(svgEl('path', {
    d: `M ${ax} ${ay} A ${arcR} ${arcR} 0 0 1 ${x0 + arcR * Math.cos(Math.atan2(rise, run))} ${y0 - arcR * Math.sin(Math.atan2(rise, run))}`,
    fill: 'none',
    stroke: '#b42318',
    'stroke-width': 1,
  }));

  const label = svgEl('text', {
    x: x0 + 52, y: y0 - 12, fill: '#b42318', 'font-size': 13, 'font-family': 'inherit',
  });
  label.textContent = `${num(1, 1).format(r.angleDeg)}°`;
  svg.append(label);

  // Подписи размеров
  const hLabel = svgEl('text', { x: x0 - 8, y: (y0 + yEnd) / 2, fill: '#62707d', 'font-size': 12, 'text-anchor': 'end', 'font-family': 'inherit' });
  hLabel.textContent = `${num(0, 0).format(r.rise)} мм`;
  svg.append(hLabel);

  const runLabel = svgEl('text', { x: (x0 + xEnd) / 2, y: y0 + 22, fill: '#62707d', 'font-size': 12, 'text-anchor': 'middle', 'font-family': 'inherit' });
  runLabel.textContent = `${num(0, 0).format(r.stepsRun)} мм`;
  svg.append(runLabel);

  // Основание
  svg.append(svgEl('line', {
    x1: x0 - 12, y1: y0, x2: xEnd + 12, y2: y0, stroke: '#c8d3dc', 'stroke-width': 1.5,
  }));
}

function render() {
  const input = readInput();
  const verdict = $('verdict');

  if (!input) {
    verdict.textContent = 'Проверьте введённые значения';
    verdict.className = 'verdict bad';
    return;
  }

  const result = compute(input);
  result.stepsData = input.steps;

  setText('out-rise', mmText(result.rise));
  setText('out-run', mmText(result.stepsRun));
  setText('out-angle', `${num(1, 1).format(result.angleDeg)}°`);
  setText('out-slope', mmText(result.slope));
  setText('out-rail', mmText(result.rail));
  setText('out-supports', `${result.supports} шт.`);
  setText('out-plat-len', mmText(result.platform.length));
  setText('out-plat-width', mmText(result.platform.width));
  setText('out-ramp', result.platform.rampTitle);
  setText('out-avg-rise', `${num(0, 0).format(result.avgRise)} мм`);
  setText('out-time', `${num(1, 1).format(result.travelTime)} с`);
  setText('out-cycle', `${num(1, 1).format(result.totalTime)} с`);
  setText('out-force', `${num(0, 0).format(result.traction)} Н`);
  setText('out-power', `${num(2, 2).format(result.powerKw)} кВт`);
  setText('out-load', `${num(0, 0).format(result.loadPerSupport)} Н`);
  setText('out-mass', `${num(0, 0).format(result.movingMass)} кг`);

  verdict.textContent = result.feasible ? 'Расчёт проходит' : 'Не проходит по ограничениям';
  verdict.className = result.feasible ? 'verdict' : 'verdict bad';

  const box = $('warnings');
  box.replaceChildren(...result.warnings.map((w) => {
    const p = document.createElement('p');
    p.className = w.level;
    p.textContent = w.text;
    return p;
  }));

  drawScheme(result);
}

/* ---------- События ---------- */

if (typeof document !== 'undefined') {
  $('add-step').addEventListener('click', () => {
    if (steps.length >= MAX_STEPS) return;
    const last = steps[steps.length - 1];
    steps.push({ rise: last.rise, tread: last.tread });
    renderRows();
    render();
  });

  $('remove-step').addEventListener('click', () => {
    if (steps.length <= MIN_STEPS) return;
    steps.pop();
    renderRows();
    render();
  });

  $('form').addEventListener('input', (event) => {
    if (event.target.closest('#rows')) return; // строки обрабатывают себя сами
    render();
  });
  $('form').addEventListener('change', render);
  $('form').addEventListener('submit', (e) => e.preventDefault());

  $('print').addEventListener('click', () => window.print());

  $('reset').addEventListener('click', () => {
    window.setTimeout(() => {
      steps = DEFAULT_STEPS.map((s) => ({ ...s }));
      $('lower').value = '1000';
      $('upper').value = '1000';
      $('width').value = '1100';
      $('payload').value = '250';
      $('ramp').value = 'normal';
      renderRows();
      render();
    }, 0);
  });

  renderRows();
  render();
}

/* Для проверки расчёта в Node: модуль отдаёт compute. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { compute };
}
