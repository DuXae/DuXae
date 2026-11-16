/* Интерфейс: форма ввода, страница результата и карточки моделей. */
(function () {
  'use strict';

  var MAX_ROWS = 30;
  var STORAGE_KEY = 'lesenka:last';
  var engine = window.Lesenka;

  var state = { result: null, form: null };

  function el(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function num(value) {
    if (value === null || value === undefined || value === '') return '';
    return String(value);
  }

  function fmtInt(value) {
    if (!isFinite(value)) return '—';
    return String(Math.round(value));
  }

  function fmtAngle(value) {
    if (!isFinite(value)) return '—';
    return value.toFixed(1).replace('.', ',');
  }

  /* ------------------------------ Форма ------------------------------ */

  function renderFormRows() {
    var body = el('steps-body');
    if (!body) return;
    var html = '';
    for (var i = 1; i <= MAX_ROWS; i++) {
      var index = i - 1;
      var right = '';
      if (i < MAX_ROWS) {
        right = '<td><input class="form-control" type="number" step="1" min="1" max="10000"' +
          ' data-role="length" data-index="' + index + '" value=""></td>';
      } else {
        right = '<td></td>';
      }
      html += '<tr>' +
        '<th>' + i + '</th>' +
        '<td><input class="form-control" type="number" step="1" min="1" max="500"' +
        ' data-role="height" data-index="' + index + '" value=""></td>' +
        right +
        '</tr>';
    }
    body.innerHTML = html;
  }

  function readFormValues() {
    var heights = [];
    var lengths = [];
    var heightInputs = document.querySelectorAll('[data-role="height"]');
    var lengthInputs = document.querySelectorAll('[data-role="length"]');

    for (var i = 0; i < MAX_ROWS; i++) heights.push(null);
    for (var j = 0; j < MAX_ROWS; j++) lengths.push(null);

    Array.prototype.forEach.call(heightInputs, function (input) {
      var idx = Number(input.getAttribute('data-index'));
      heights[idx] = input.value === '' ? null : Number(input.value);
    });
    Array.prototype.forEach.call(lengthInputs, function (input) {
      var idx = Number(input.getAttribute('data-index'));
      lengths[idx] = input.value === '' ? null : Number(input.value);
    });

    var checked = document.querySelector('input[name="ramp"]:checked');

    return {
      heights: heights,
      lengths: lengths,
      downFloor: Number(el('down-floor').value),
      widthStair: Number(el('width-stair').value),
      upperFloor: Number(el('upper-floor').value),
      ramp: checked ? Number(checked.value) : 0,
      shortNpu: el('short-npu').checked
    };
  }

  function writeFormValues(data) {
    if (!data) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-role="height"]'), function (input) {
      var idx = Number(input.getAttribute('data-index'));
      input.value = num(data.heights[idx]);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-role="length"]'), function (input) {
      var idx = Number(input.getAttribute('data-index'));
      input.value = num(data.lengths[idx]);
    });
    el('down-floor').value = num(data.downFloor);
    el('width-stair').value = num(data.widthStair);
    el('upper-floor').value = num(data.upperFloor);
    var radios = document.querySelectorAll('input[name="ramp"]');
    Array.prototype.forEach.call(radios, function (radio) {
      radio.checked = Number(radio.value) === Number(data.ramp);
    });
    el('short-npu').checked = !!data.shortNpu;
  }

  function clearForm() {
    Array.prototype.forEach.call(document.querySelectorAll('input[data-role]'), function (input) {
      input.value = '';
    });
    el('down-floor').value = '';
    el('width-stair').value = '';
    el('upper-floor').value = '';
    var first = document.querySelector('input[name="ramp"]');
    if (first) first.checked = true;
    el('short-npu').checked = true;
    state.result = null;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    location.hash = '#/';
  }

  function submitForm(event) {
    event.preventDefault();
    var values = readFormValues();
    var result = engine.compute(values);
    state.result = result;
    state.form = values;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ result: result, form: values })); } catch (e) { /* noop */ }
    location.hash = '#/result';
  }

  /* ---------------------------- Результат ---------------------------- */

  function statusCell(family, variant, passed) {
    var label = passed ? 'ДА' : 'НЕТ';
    var cls = passed ? 'status-yes' : 'status-no';
    return '<a href="#/' + family + '_' + variant + '"><b class="' + cls + '">' + label + '</b></a>';
  }

  function matrixTable(family, result) {
    var rows = [
      { title: 'К стене', variants: ['to_wall', 'to_wall', 'to_wall'], suffix: 'to_wall' },
      { title: 'На опорах', variants: ['on_supports', 'on_supports', 'on_supports'], suffix: 'on_supports' }
    ];
    var columns = ['passage', 'side', '3side'];
    var html = '<table class="table table-bordered matrix">' +
      '<tr><th colspan="4" class="matrix-title ' + family + '-color">' + (family === 'et' ? 'EasyTrap' : 'НПУ') + '</th></tr>' +
      '<tr><td></td><td>Проходной</td><td>Боковой</td><td>3 стороны</td></tr>';

    rows.forEach(function (row) {
      html += '<tr><td>' + row.title + '</td>';
      columns.forEach(function (column) {
        var key = column + '_' + row.suffix;
        html += '<td>' + statusCell(family, key, result.pass[family + '_' + key]) + '</td>';
      });
      html += '</tr>';
    });

    return html + '</table>';
  }

  function paramsBlock(params, options) {
    var lines = [
      '<b class="param-angle">' + fmtAngle(params.angle) + '</b>° - Угол подъема платформы',
      '<b>' + fmtInt(params.path) + '</b> мм - Длинна пути подъема платформы',
      '<b>' + fmtInt(params.minPass) + '</b> мм - Минимальная нижняя площадка(проходной и на 3 стороны)',
      '<b>' + fmtInt(params.minSide) + '</b> мм - Минимальная нижняя площадка(боковой)'
    ];
    if (options && options.extra) lines.push(options.extra);
    return lines.map(function (line) { return '<p>' + line + '</p>'; }).join('');
  }

  function renderResult() {
    var result = state.result;
    var host = el('result-content');
    if (!host) return;
    if (!result) {
      host.innerHTML = '<p class="empty-note">Нет расчёта. Вернитесь к форме и нажмите «Расчитать».</p>';
      return;
    }

    var html = '<div class="result-head">' +
      '<p><b>' + fmtAngle(result.stairAngle) + '</b>° - Угол лестницы</p>' +
      '<p><b>' + fmtInt(result.rise) + '</b> мм - Высота подъема платформы</p>' +
      '<p><b>' + fmtInt(result.along) + '</b> мм - Длина подъёма (как в опросном листе)</p>' +
      '</div>' +
      '<hr class="result-rule"><br>' +
      '<table class="table table-bordered result-grid"><colgroup>' +
      '<col style="width:40%"><col style="width:20%"><col style="width:40%"></colgroup><tr>' +
      '<td>' + matrixTable('et', result) + '</td>' +
      '<td class="pictogram">' + pictogram('et') + '</td>' +
      '<td>' + paramsBlock(result.et) + '</td>' +
      '</tr><tr>' +
      '<td>' + matrixTable('npu', result) + '</td>' +
      '<td class="pictogram">' + pictogram('npu') + '</td>' +
      '<td>' + paramsBlock(result.npu, { extra: result.shortNpu ? '<span class="short-note">Площадка укорочена на 100 мм</span>' : '' }) + '</td>' +
      '</tr></table>' +
      '<div class="result-notes"><ol>' +
      '<li>Если подъёмник проходит, считаем его стандартным.</li>' +
      '<li>Если программа выдала «не проходит», нужен инженер: он проверит остальные варианты.</li>' +
      '<li>Частая причина — сложная траектория: высота над ступенями больше 500 мм, не хватает пандуса.</li>' +
      '<li>Угол подъёма и длина пути «ноль» означают, что траектория сложная.</li>' +
      '</ol></div>';

    host.innerHTML = html;
  }

  /* --------------------------- Карточка модели --------------------------- */

  var MODEL_META = {
    et_passage_to_wall: { family: 'et', title: 'Проходной к стене', mount: 'к стене' },
    et_side_to_wall: { family: 'et', title: 'Боковой к стене', mount: 'к стене' },
    et_3side_to_wall: { family: 'et', title: '3 стороны к стене', mount: 'к стене' },
    et_passage_on_supports: { family: 'et', title: 'Проходной на опорах', mount: 'на опорах' },
    et_side_on_supports: { family: 'et', title: 'Боковой на опорах', mount: 'на опорах' },
    et_3side_on_supports: { family: 'et', title: '3 стороны на опорах', mount: 'на опорах' },
    npu_passage_to_wall: { family: 'npu', title: 'Проходной к стене', mount: 'к стене' },
    npu_side_to_wall: { family: 'npu', title: 'Боковой к стене', mount: 'к стене' },
    npu_3side_to_wall: { family: 'npu', title: '3 стороны к стене', mount: 'к стене' },
    npu_passage_on_supports: { family: 'npu', title: 'Проходной на опорах', mount: 'на опорах' },
    npu_side_on_supports: { family: 'npu', title: 'Боковой на опорах', mount: 'на опорах' },
    npu_3side_on_supports: { family: 'npu', title: '3 стороны на опорах', mount: 'на опорах' }
  };

  function renderDetail(modelKey) {
    var host = el('detail-content');
    if (!host) return;
    var meta = MODEL_META[modelKey];
    var result = state.result;
    if (!meta || !result) {
      host.innerHTML = '<p class="empty-note">Сначала выполните расчёт на главной странице.</p>';
      return;
    }
    var params = result[meta.family];
    var passed = result.pass[modelKey];

    var list = [
      { label: 'Вариант', value: (meta.family === 'et' ? 'EasyTrap' : 'НПУ') + ' — ' + meta.title },
      { label: 'Крепление', value: meta.mount },
      { label: 'Угол лестницы', value: fmtAngle(result.stairAngle) + '°' },
      { label: 'Длина подъёма по проступям', value: fmtInt(result.along) + ' мм' },
      { label: 'Угол подъёма платформы', value: fmtAngle(params.angle) + '°' },
      { label: 'Длина пути подъёма', value: fmtInt(params.path) + ' мм' },
      { label: 'Минимальная нижняя площадка (проходной / 3 стороны)', value: fmtInt(params.minPass) + ' мм' },
      { label: 'Минимальная нижняя площадка (боковой)', value: fmtInt(params.minSide) + ' мм' }
    ];

    host.innerHTML = '<p class="detail-title ' + meta.family + '-color"><b>' + escapeHtml(meta.title) + '</b></p>' +
      '<div class="detail-figure">' + schematic(result, params, meta.family) + '</div>' +
      '<div class="detail-status ' + (passed ? 'ok' : 'bad') + '">' +
      (passed ? 'Проходит при заданных размерах' : 'Не проходит при заданных размерах') + '</div>' +
      '<dl class="detail-list">' + list.map(function (item) {
        return '<dt>' + escapeHtml(item.label) + '</dt><dd>' + escapeHtml(item.value) + '</dd>';
      }).join('') + '</dl>';
  }

  /* ------------------------------ Рисунки ------------------------------ */

  function pictogram(family) {
    var color = family === 'et' ? '#0f4c81' : '#4a4a4a';
    return '<svg viewBox="0 0 120 140" width="110" height="130" role="img" aria-label="Схема">' +
      '<g stroke="' + color + '" fill="none" stroke-width="3">' +
      '<path d="M20 120 H100"/>' +
      '<path d="M20 120 V108 H34 V96 H48 V84 H62 V72 H76 V60 H90 V48"/>' +
      '</g>' +
      '<line x1="18" y1="126" x2="98" y2="42" stroke="' + color + '" stroke-width="4"/>' +
      '<rect x="40" y="74" width="30" height="16" fill="' + color + '" opacity="0.75"/>' +
      '</svg>';
  }

  function schematic(result, params, family) {
    var w = 860;
    var h = 460;
    var pad = 60;
    var rise = result.rise || 1;
    var run = result.run || 1;
    var scale = Math.min((w - 2 * pad) / Math.max(run, 1), (h - 2 * pad) / Math.max(rise, 1));
    var baseY = h - pad;
    var baseX = pad;

    var path = '';
    var x = 0;
    var y = 0;
    for (var i = 0; i < result.steps; i++) {
      var height = result.input.heights[i] || 0;
      var tread = result.input.lengths[i] || 0;
      path += 'M' + (baseX + x * scale) + ' ' + (baseY - y * scale) +
        ' v' + (-height * scale) +
        ' h' + (tread * scale) + ' ';
      y += height;
      x += tread;
    }

    var platformDx = Math.cos((params.angle || 1) * Math.PI / 180) * run * 0.42;
    var platformDy = Math.sin((params.angle || 1) * Math.PI / 180) * run * 0.42;
    var px = baseX + run * scale * 0.08;
    var py = baseY - rise * scale * 0.9;

    var color = family === 'et' ? '#0f4c81' : '#a83232';

    return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="scheme" role="img" aria-label="Схема лестницы и трассы">' +
      '<line x1="' + baseX + '" y1="' + baseY + '" x2="' + (w - pad) + '" y2="' + baseY + '" stroke="#bbb"/>' +
      '<line x1="' + baseX + '" y1="' + pad + '" x2="' + baseX + '" y2="' + baseY + '" stroke="#bbb"/>' +
      '<path d="' + path + '" fill="none" stroke="#555" stroke-width="2.5"/>' +
      '<line x1="' + px + '" y1="' + py + '" x2="' + (px + platformDx * scale) + '" y2="' + (py + platformDy * scale) + '" stroke="' + color + '" stroke-width="5"/>' +
      '<rect x="' + (px - 8) + '" y="' + (py - 8) + '" width="16" height="16" fill="' + color + '"/>' +
      '<text x="' + (baseX + 8) + '" y="' + (baseY - 10) + '" font-size="13" fill="#666">нижняя площадка: ' + fmtInt(result.input.downFloor) + ' мм</text>' +
      '<text x="' + (w - pad - 210) + '" y="' + (baseY - 10) + '" font-size="13" fill="#666">верхняя площадка: ' + fmtInt(result.input.upperFloor) + ' мм</text>' +
      '<text x="' + (px + 14) + '" y="' + (py - 14) + '" font-size="14" fill="' + color + '">' + fmtAngle(params.angle) + '° · путь ' + fmtInt(params.path) + ' мм</text>' +
      '<text x="' + (baseX + 8) + '" y="' + (pad + 10) + '" font-size="13" fill="#666">высота ' + fmtInt(result.rise) + ' мм · прогон ' + fmtInt(result.run) + ' мм</text>' +
      '</svg>';
  }

  /* ------------------------------- Роутер ------------------------------- */

  function showView(name) {
    ['form', 'result', 'detail'].forEach(function (view) {
      var node = el('view-' + view);
      if (node) node.classList.toggle('is-hidden', view !== name);
    });
  }

  function route() {
    var hash = location.hash.replace(/^#\/?/, '');
    if (!hash || hash === 'form') {
      showView('form');
      return;
    }
    if (hash === 'result') {
      renderResult();
      showView('result');
      return;
    }
    if (MODEL_META[hash]) {
      renderDetail(hash);
      showView('detail');
      return;
    }
    showView('form');
  }

  function restore() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      state.result = saved.result;
      state.form = saved.form;
      writeFormValues(saved.form);
    } catch (e) { /* noop */ }
  }

  function init() {
    renderFormRows();
    restore();
    renderResult();
    el('stair-form').addEventListener('submit', submitForm);
    el('reset-button').addEventListener('click', clearForm);
    window.addEventListener('hashchange', route);
    route();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
