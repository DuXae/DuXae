/* Интерфейс программы: таблица ступеней, расчёт, схема, сохранение и параметры. */
(function () {
  'use strict';

  const E = window.PlatformEngine;
  const STEPS = 30;
  const STORE_STATE = 'platform-app-state';
  const STORE_SETTINGS = 'platform-app-settings';

  const nf = (min, max) => new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });

  const mmText = (v) => `${nf(0, 0).format(Math.round(v))} мм`;
  const mText = (v) => `${nf(2, 2).format(v / 1000)} м`;

  const byId = (id) => document.getElementById(id);

  /* ---------- Настройки ---------- */

  const SETTING_FIELDS = [
    { key: 'maxRiseMm', label: 'Максимальная длина подъёма, м', scale: 1000, step: 0.5, min: 1 },
    { key: 'maxAngleDeg', label: 'Максимальный угол подъёма, °', scale: 1, step: 1, min: 1 },
    { key: 'minWidthMm', label: 'Минимальная ширина марша, мм', scale: 1, step: 50, min: 400 },
    { key: 'platformBaseMm', label: 'Длина платформы, мм', scale: 1, step: 10, min: 400 },
    { key: 'npuDeltaMm', label: 'Укороченная площадка НПУ, мм', scale: 1, step: 10, min: -500 },
    { key: 'supportSpacingMm', label: 'Шаг точек крепления, мм', scale: 1, step: 100, min: 300 },
    { key: 'speedMps', label: 'Скорость платформы, м/с', scale: 1, step: 0.01, min: 0.01 },
    { key: 'payloadKg', label: 'Грузоподъёмность, кг', scale: 1, step: 10, min: 60 },
  ];

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORE_SETTINGS);
      return raw ? Object.assign({}, E.DEFAULTS, JSON.parse(raw)) : Object.assign({}, E.DEFAULTS);
    } catch (err) {
      return Object.assign({}, E.DEFAULTS);
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(STORE_SETTINGS, JSON.stringify(settings));
    } catch (err) {
      /* приватный режим — просто не сохраняем */
    }
  }

  let settings = loadSettings();

  /* ---------- Таблица ступеней ---------- */

  const rows = Array.from({ length: STEPS }, () => ({ rise: '', tread: '' }));

  function buildRows() {
    const body = byId('steps-body');
    const fragment = document.createDocumentFragment();

    rows.forEach((row, index) => {
      const tr = document.createElement('tr');

      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = String(index + 1);

      const tdRise = document.createElement('td');
      const rise = document.createElement('input');
      rise.type = 'number';
      rise.inputMode = 'numeric';
      rise.min = '0';
      rise.step = '1';
      rise.value = row.rise;
      rise.setAttribute('aria-label', `Высота ступени ${index + 1}, мм`);
      rise.addEventListener('input', () => {
        row.rise = rise.value;
        onInput();
      });

      const tdTread = document.createElement('td');
      const tread = document.createElement('input');
      tread.type = 'number';
      tread.inputMode = 'numeric';
      tread.min = '0';
      tread.step = '1';
      tread.value = row.tread;
      tread.disabled = index === STEPS - 1;
      tread.setAttribute('aria-label', `Длина проступи ${index + 1}, мм`);
      tread.addEventListener('input', () => {
        row.tread = tread.value;
        onInput();
      });

      tdRise.append(rise);
      tdTread.append(tread);
      tr.append(th, tdRise, tdTread);
      fragment.append(tr);
    });

    body.replaceChildren(fragment);
  }

  function syncInputs() {
    const inputs = byId('steps-body').querySelectorAll('input');
    inputs.forEach((input, i) => {
      const rowIndex = Math.floor(i / 2);
      const isTread = i % 2 === 1;
      input.value = isTread ? rows[rowIndex].tread : rows[rowIndex].rise;
      if (isTread) input.disabled = rowIndex === STEPS - 1;
    });
  }

  function currentRamp() {
    const checked = document.querySelector('input[name="ramp"]:checked');
    return checked ? checked.value : '0';
  }

  function readInput() {
    return {
      rows: rows.map((row) => ({ rise: row.rise, tread: row.tread })),
      lower: byId('lower').value,
      upper: byId('upper').value,
      width: byId('width').value,
      ramp: currentRamp(),
      npu: byId('npu').checked,
    };
  }

  /* ---------- Отрисовка результата ---------- */

  function renderParams(result) {
    const list = byId('result-list');
    const items = [
      ['Ступеней', String(result.stepsCount)],
      ['Длина подъёма', `${mmText(result.rise)} (${mText(result.rise)})`],
      ['Угол подъёма', `${nf(1, 1).format(result.angleDeg)}°`],
      ['Длина по наклону', mmText(result.slope)],
      ['Направляющая', mmText(result.rail)],
      ['Точек крепления', `${result.supports} шт.`],
      ['Платформа', `${nf(0, 0).format(result.platform.length)} × ${nf(0, 0).format(result.platform.width)} мм`],
      ['Въездной пандус', result.platform.rampTitle + (result.platform.npu ? ', НПУ' : '')],
      ['Тяговое усилие', `${nf(0, 0).format(result.traction)} Н`],
      ['Мощность привода', `${nf(2, 2).format(result.powerKw)} кВт`],
      ['Время подъёма', `${nf(1, 1).format(result.travelTime)} с`],
    ];

    const fragment = document.createDocumentFragment();
    items.forEach(([label, value]) => {
      const li = document.createElement('li');
      const l = document.createElement('span');
      l.className = 'label';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'value';
      v.textContent = value;
      li.append(l, v);
      fragment.append(li);
    });
    list.replaceChildren(fragment);

    const head = byId('result-head');
    head.textContent = result.feasible ? 'Результат' : 'Не проходит по ограничениям';
    head.className = result.feasible ? 'result-head' : 'result-head bad';

    const alerts = byId('alerts');
    alerts.replaceChildren(...result.warnings.map((w) => {
      const p = document.createElement('p');
      p.className = w.level;
      p.textContent = w.text;
      return p;
    }));
  }

  /* ---------- Схема ---------- */

  const svgNS = 'http://www.w3.org/2000/svg';

  function el(name, attrs) {
    const node = document.createElementNS(svgNS, name);
    Object.keys(attrs || {}).forEach((key) => node.setAttribute(key, attrs[key]));
    return node;
  }

  function drawScheme(result) {
    const svg = byId('scheme');
    svg.replaceChildren();

    const W = 420;
    const H = 240;
    const pad = 44;

    const steps = result.steps;
    if (!steps.length) {
      const hint = el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', fill: '#6c757d', 'font-size': 13 });
      hint.textContent = 'Заполните высоты ступеней';
      svg.append(hint);
      return;
    }

    const run = Math.max(result.stepsRun, 1);
    const rise = Math.max(result.rise, 1);
    const scale = Math.min((W - 2 * pad) / run, (H - 2 * pad) / rise);

    const x0 = pad;
    const y0 = H - pad;
    const xEnd = x0 + run * scale;
    const yEnd = y0 - rise * scale;

    const points = [[x0, y0]];
    let x = x0;
    let y = y0;
    steps.forEach((step, i) => {
      y -= step.rise * scale;
      points.push([x, y]);
      if (i < steps.length - 1) {
        x += step.tread * scale;
        points.push([x, y]);
      }
    });
    points.push([xEnd, yEnd]);

    svg.append(el('polyline', {
      points: points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' '),
      fill: 'none',
      stroke: '#0f4c81',
      'stroke-width': 2,
      'stroke-linejoin': 'round',
    }));

    svg.append(el('line', {
      x1: x0, y1: y0, x2: xEnd, y2: yEnd,
      stroke: '#c62828', 'stroke-width': 1.5, 'stroke-dasharray': '6 4',
    }));

    const arcR = 40;
    const angle = Math.atan2(rise, run);
    svg.append(el('path', {
      d: `M ${x0 + arcR} ${y0} A ${arcR} ${arcR} 0 0 1 ${x0 + arcR * Math.cos(angle)} ${y0 - arcR * Math.sin(angle)}`,
      fill: 'none', stroke: '#c62828', 'stroke-width': 1,
    }));

    const angleLabel = el('text', { x: x0 + 48, y: y0 - 12, fill: '#c62828', 'font-size': 13 });
    angleLabel.textContent = `${nf(1, 1).format(result.angleDeg)}°`;
    svg.append(angleLabel);

    const heightLabel = el('text', {
      x: x0 - 8, y: (y0 + yEnd) / 2, fill: '#6c757d', 'font-size': 12, 'text-anchor': 'end',
    });
    heightLabel.textContent = `${nf(0, 0).format(result.rise)} мм`;
    svg.append(heightLabel);

    const runLabel = el('text', {
      x: (x0 + xEnd) / 2, y: y0 + 22, fill: '#6c757d', 'font-size': 12, 'text-anchor': 'middle',
    });
    runLabel.textContent = `${nf(0, 0).format(result.stepsRun)} мм`;
    svg.append(runLabel);

    svg.append(el('line', { x1: x0 - 12, y1: y0, x2: xEnd + 12, y2: y0, stroke: '#c9d3de', 'stroke-width': 1.5 }));
  }

  /* ---------- Общий пересчёт ---------- */

  function computeNow() {
    const input = readInput();
    const result = E.compute(input, settings);
    renderParams(result);
    drawScheme(result);
    return result;
  }

  let timer = null;
  function onInput() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const result = computeNow();
      persistState(result);
    }, 120);
  }

  function persistState(result) {
    try {
      const state = readInput();
      state.result = { feasible: result.feasible, angleDeg: result.angleDeg };
      localStorage.setItem(STORE_STATE, JSON.stringify(state));
    } catch (err) {
      /* игнорируем */
    }
  }

  function applyState(state) {
    if (!state || !Array.isArray(state.rows)) return false;
    state.rows.slice(0, STEPS).forEach((row, i) => {
      rows[i] = { rise: row && row.rise !== undefined ? String(row.rise) : '', tread: row && row.tread !== undefined ? String(row.tread) : '' };
    });
    byId('lower').value = state.lower !== undefined ? state.lower : '1000';
    byId('upper').value = state.upper !== undefined ? state.upper : '1000';
    byId('width').value = state.width !== undefined ? state.width : '1100';
    byId('npu').checked = Boolean(state.npu);
    const ramp = document.querySelector(`input[name="ramp"][value="${state.ramp}"]`);
    if (ramp) ramp.checked = true;
    syncInputs();
    return true;
  }

  function sampleState() {
    const sample = Array.from({ length: STEPS }, () => ({ rise: '', tread: '' }));
    for (let i = 0; i < 12; i += 1) sample[i] = { rise: '160', tread: i === 11 ? '' : '320' };
    return { rows: sample, lower: '1000', upper: '1000', width: '1100', ramp: '0', npu: false };
  }

  /* ---------- Файл ---------- */

  function saveFile() {
    const payload = {
      format: 'platform-app/1',
      savedAt: new Date().toISOString(),
      settings,
      input: readInput(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    link.href = url;
    link.download = `platform-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const input = data && data.input ? data.input : data;
        if (data && data.settings) {
          settings = Object.assign({}, E.DEFAULTS, data.settings);
          saveSettings(settings);
          buildSettings();
        }
        if (!applyState(input)) {
          window.alert('В файле нет данных расчёта.');
          return;
        }
        computeNow();
      } catch (err) {
        window.alert('Не удалось прочитать файл: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  /* ---------- Окно параметров ---------- */

  function buildSettings() {
    const holder = byId('settings-fields');
    const fragment = document.createDocumentFragment();

    SETTING_FIELDS.forEach((field) => {
      const col = document.createElement('div');
      col.className = 'col-sm-6';

      const label = document.createElement('label');
      label.className = 'form-label';
      label.textContent = field.label;

      const input = document.createElement('input');
      input.className = 'form-control';
      input.type = 'number';
      input.step = String(field.step);
      input.min = String(field.min);
      input.value = String(Number((settings[field.key] / field.scale).toFixed(3)));

      const id = `setting-${field.key}`;
      input.id = id;
      label.setAttribute('for', id);

      input.addEventListener('input', () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        settings[field.key] = value * field.scale;
        saveSettings(settings);
        computeNow();
      });

      col.append(label, input);
      fragment.append(col);
    });

    holder.replaceChildren(fragment);
  }

  /* ---------- Инициализация ---------- */

  function init() {
    buildRows();

    let restored = false;
    try {
      const raw = localStorage.getItem(STORE_STATE);
      if (raw) restored = applyState(JSON.parse(raw));
    } catch (err) {
      restored = false;
    }
    if (!restored) applyState(sampleState());

    buildSettings();
    computeNow();

    byId('form').addEventListener('input', (event) => {
      if (event.target.closest('#steps-body')) return;
      onInput();
    });
    byId('form').addEventListener('change', onInput);
    byId('form').addEventListener('submit', (event) => {
      event.preventDefault();
      computeNow();
    });

    byId('reset').addEventListener('click', () => {
      applyState({ rows: Array.from({ length: STEPS }, () => ({ rise: '', tread: '' })), lower: '1000', upper: '1000', width: '1100', ramp: '0', npu: false });
      computeNow();
    });

    byId('menu-save').addEventListener('click', saveFile);
    byId('menu-load').addEventListener('click', () => byId('file-input').click());
    byId('menu-reset').addEventListener('click', () => byId('reset').click());
    byId('file-input').addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) loadFile(file);
      event.target.value = '';
    });

    byId('settings-reset').addEventListener('click', () => {
      settings = Object.assign({}, E.DEFAULTS);
      saveSettings(settings);
      buildSettings();
      computeNow();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
