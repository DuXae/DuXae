# platformcalc — ядро и консоль на Python

Независимая реализация того же расчёта, что и в `platform-app`, для отчётов, выгрузки
в JSON и использования как библиотека.

```bash
# из корня репозитория
python -m platformcalc.cli --steps 12 --rise 160 --tread 320
python -m platformcalc.cli --step 170:300 --step 175:295 --width 1100 --ramp ext100
python -m platformcalc.cli --steps 12 --rise 160 --tread 320 --json --out report.json
```

Без аргументов программа спрашивает данные построчно.

```python
from platformcalc import StairInput, Step, compute

data = StairInput(steps=(Step(160, 320), Step(160, 320), Step(160, 0)))
print(compute(data).to_dict())
```

Модель: высота подъёма — сумма подступенков, горизонтальная длина — сумма проступей
без последней, угол — `arctg(H/L)`. Ограничения: подъём до 10 м, угол до 30°.
Пандусы задаются кодом: `normal`, `ext50`, `ext100`, `ext150`, `short_npu`.

- `calc.py` — модель и расчёт;
- `report.py` — текстовый отчёт;
- `cli.py` — командная строка;
- `web/` — прежняя веб-страница этого расчёта (ей на смену пришёл проект `platform-app`).

Тесты:

```bash
python -m unittest discover -s tests -t .
```
