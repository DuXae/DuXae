/*
 * Смоук-тест интерфейса без браузера: минимальная DOM-заглушка + app.js.
 * Проверяет, что форма строится на 30 строк, результат считается и рисуется,
 * карточка модели открывается, «Сброс» очищает поля.
 *
 *   node tests/ui.smoke.js
 */
const path = require('path');

const ROWS = 30;
const ROOT = path.join(__dirname, '..');

function makeElement(id) {
  const handlers = {};
  return {
    id,
    innerHTML: '',
    value: '',
    checked: false,
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(type, fn) { handlers[type] = fn; },
    fire(type, event) { if (handlers[type]) handlers[type](event || { preventDefault() {} }); },
    getAttribute(name) { return this.attrs ? this.attrs[name] : null; },
  };
}

const byId = {};
function element(id) {
  if (!byId[id]) byId[id] = makeElement(id);
  return byId[id];
}

const heights = [];
const lengths = [];
const ramps = [];
for (let i = 0; i < ROWS; i++) {
  const height = makeElement('h' + i);
  height.attrs = { 'data-role': 'height', 'data-index': String(i) };
  heights.push(height);

  const length = makeElement('l' + i);
  length.attrs = { 'data-role': 'length', 'data-index': String(i) };
  lengths.push(length);
}
for (const value of ['0', '50', '100', '150']) {
  const radio = makeElement('ramp' + value);
  radio.value = value;
  radio.attrs = { name: 'ramp' };
  ramps.push(radio);
}
ramps[0].checked = true;

const allInputs = [...heights, ...lengths];

global.document = {
  readyState: 'complete',
  getElementById: element,
  addEventListener() {},
  querySelector(selector) {
    return selector === 'input[name="ramp"]' ? ramps[0] : null;
  },
  querySelectorAll(selector) {
    if (selector === '[data-role="height"]') return heights;
    if (selector === '[data-role="length"]') return lengths;
    if (selector === 'input[name="ramp"]') return ramps;
    if (selector === 'input[name="ramp"]:checked') return ramps.filter((radio) => radio.checked);
    if (selector === 'input[data-role]') return allInputs;
    return [];
  },
};

const windowHandlers = {};
global.window = {
  Lesenka: require(path.join(ROOT, 'js', 'engine.js')),
  addEventListener(type, fn) { windowHandlers[type] = fn; },
};

let currentHash = '#/';
global.location = {
  get hash() { return currentHash; },
  set hash(value) {
    if (currentHash === value) return;
    currentHash = value;
    if (windowHandlers.hashchange) windowHandlers.hashchange();
  },
};

const storage = new Map();
global.sessionStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

require(path.join(ROOT, 'js', 'app.js'));

let failures = 0;
function check(condition, message) {
  if (condition) {
    console.log('ok:', message);
  } else {
    failures += 1;
    console.error('FAIL:', message);
  }
}

check(element('steps-body').innerHTML.includes('data-role="height"'), 'таблица ступеней отрисована');
check((element('steps-body').innerHTML.match(/data-role="height"/g) || []).length === ROWS, 'ровно 30 строк');

for (let i = 0; i < 9; i++) heights[i].value = '150';
for (let i = 0; i < 8; i++) lengths[i].value = '300';
element('down-floor').value = '3000';
element('width-stair').value = '1500';
element('upper-floor').value = '1000';

element('stair-form').fire('submit');
const resultHtml = element('result-content').innerHTML;
check(resultHtml.includes('Угол лестницы'), 'результат: блок угла лестницы');
check(resultHtml.includes('26,6'), 'результат: угол 26,6');
check(resultHtml.includes('EasyTrap'), 'результат: таблица EasyTrap');
check(resultHtml.includes('НПУ'), 'результат: таблица НПУ');
check((resultHtml.match(/class="status-yes"/g) || []).length === 12, 'результат: 12 «ДА»');
check(resultHtml.includes('1639') && resultHtml.includes('3015'), 'результат: площадки и путь');

location.hash = '#/npu_side_to_wall';
const detailHtml = element('detail-content').innerHTML;
check(detailHtml.includes('Боковой к стене'), 'карточка: заголовок модели');
check(detailHtml.includes('Длина пути подъёма'), 'карточка: параметры');
check(detailHtml.includes('<svg'), 'карточка: схема');

element('reset-button').fire('click');
check(heights[0].value === '', 'сброс очищает ступени');
check(element('width-stair').value === '', 'сброс очищает ширину');

console.log(failures === 0 ? '\nСмоук интерфейса пройден' : `\nПровалов: ${failures}`);
process.exitCode = failures === 0 ? 0 : 1;
