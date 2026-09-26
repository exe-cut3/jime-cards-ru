# JiME Cards DB (RU)

Фанатская база карт настольной игры **«Властелин Колец: Странствия в Средиземье»**
(The Lord of the Rings: Journeys in Middle-earth, FFG, 2019) — на русском, с поиском и фильтрами.

Оригинал, с которого берутся сканы: <https://sites.google.com/view/jime-carddb/home>.
Текстовые данные карт: таблица «Character, Equipment, and Skill Cards Spreadsheet V1.10»
(автор Birdman137) с BoardGameGeek.

> This website is not produced, endorsed, supported, or affiliated with Fantasy Flight Games.
> Game elements are © Fantasy Flight Games. Middle-earth and The Lord of the Rings are
> trademarks of the Saul Zaentz Company. Сканы карт хранятся только локально и не входят в репозиторий.

## Структура

```
data/
  raw/                 # НЕ в git: сканы, HTML-дампы, OCR
    <раздел>/<подраздел>/<подраздел>-NN.png
    _html/             # сохранённые страницы Google Site
    manifest.json      # соответствие файл → страница / раздел / индекс (в git)
    ocr.json           # распознанный текст всех сканов
    bgg.xlsx           # таблица с BGG, кладётся руками (см. ниже)
  bgg.json             # разобранная таблица BGG
  bgg_fixes.json       # явные исправления таблицы с причинами (правится руками)
  cards.json           # сводная база: одна запись = одна карта
  build_report.md      # отчёт сведения: что не сошлось, что без скана, что проверить
  translations.json    # русские названия и тексты (этап 2, правятся руками)
scripts/
  scrape_site.py       # 1. краулер сайта-оригинала
  parse_bgg.py         # 2. xlsx → bgg.json (+ bgg_fixes.json)
  ocr_scans.py         # 3. OCR сканов → ocr.json
  build_cards.py       # 4. сведение → cards.json + build_report.md
```

## Требования

- Python 3.13+, `uv` (для OCR-зависимостей), `openpyxl`
- Node 22+ (для приложения, этап 3)

## Как обновить данные

Шаги независимы и перезапускаемы; менять что-то руками нужно только в `bgg_fixes.json`
и `translations.json`.

### 1. Сканы карт с сайта-оригинала

```bash
python scripts/scrape_site.py
```

Обходит все подстраницы сайта, скачивает картинки в оригинальном разрешении в
`data/raw/<раздел>/<подраздел>/` и пишет `data/raw/manifest.json`. Между запросами
делаются паузы (~1.5 с на страницу, ~0.7 с на картинку); уже скачанные файлы пропускаются.

Особенность Google Sites: ссылки на картинки подписаны и живут меньше минуты, поэтому
картинки каждой страницы качаются сразу после её загрузки, а при 403 страница
перезапрашивается ради свежих ссылок. Подписей к картинкам на сайте нет — порядок на
странице сохраняется как `index` в манифесте, названия и номера читаются OCR.

### 2. Таблица с BGG

Скачивание с BoardGameGeek требует логина, поэтому файл кладётся руками:

1. Открыть <https://boardgamegeek.com/filepage/203251/character-equipment-and-skill-cards-spreadsheet>
2. Скачать `JiME_Cards_List_V1.10.xlsx`
3. Сохранить как `data/raw/bgg.xlsx`

```bash
python scripts/parse_bgg.py
```

Текст сохраняется дословно (включая опечатки автора). Найденные ошибки таблицы исправляются
не в коде, а в `data/bgg_fixes.json` — каждая правка с указанием причины и скана-источника.
Фанатский контент (Glorfindel, Warrior, Ring-Bearer) уходит в отдельную ветку `custom`
и в базу не попадает.

### 3. OCR сканов

```bash
uv run --with rapidocr-onnxruntime --with pillow python scripts/ocr_scans.py
```

Сканы маленькие (320–930 px), поэтому перед распознаванием увеличиваются в 3 раза.
Около 0.6 с на скан, ~7 минут на всё; уже распознанные файлы пропускаются.
Tesseract не нужен.

### 4. Сведение в `data/cards.json`

```bash
python scripts/build_cards.py
```

- Карты героев: лицевая сторона определяется по пяти характеристикам, оборот — по тексту
  BACKGROUND / ALTERNATE FORM. Предыстория берётся из OCR оборота и помечена на вычитку.
- Навыки героев, ролей, базовые и титулы: по подвалу карты («Burglar 3»); если подвал не
  читается, берётся порядок на странице со сдвигом.
- Слабости, предметы, террейн, урон, страх, состояния: по названию через нечёткое
  сравнение с таблицей. Предметы-перепечатки (Sword в базе и в Spreading War) делят один скан.
- Всё, чего нет ни в одном источнике, попадает в `todo` записи и в `build_report.md`.

## Этап 2: русские названия и тексты (издание Hobby World)

Источники русской терминологии:

- `data/raw/rules/*.pdf` (не в git): справочник, правила базы, «Тёмных троп», «Ветра войны».
  Текст извлекается в `data/raw/rules/*.txt`, из него собран [glossary.md](glossary.md).
- Сканы русского издания из мода Tabletop Simulator (Steam Workshop 3353638862): все 820 карт
  с русскими названиями в метаданных. Сканы хранятся в `data/raw/tts/` (не в git).

```bash
uv run --with pymongo python -c "..."                        # см. scripts/tts_fetch.py, шапка
uv run --with pillow python scripts/tts_fetch.py            # листы карт → data/raw/tts/cards/*.png
uv run --with rapidocr-onnxruntime --with pillow python scripts/ocr_ru.py --shard 0/4   # ×4 параллельно
python scripts/build_translations.py                        # → data/translations.json + отчёт
python scripts/build_cards.py                               # подмешивает переводы в cards.json
```

- `data/ru_names.json` — словарь EN → RU для карт без номера (снаряжение, слабости, урон,
  страх, местность, состояния, герои). Нумерованные навыки сопоставляются по позиции на листе.
- `data/translations.json` — результат: `name_ru`, `text_ru`, `traits_ru`, `background_ru`,
  русские сканы. Сырой OCR лежит в `text_ru_ocr`; правится руками, при
  `verified: true` запись переживает пересборку.
- `data/fixes/NN.json` — вычитка OCR по английскому оригиналу (пакеты, сделаны Claude):
  восстановленные обрывки помечены `_note`. `data/translations_fixes.json` — ручные правки
  с высшим приоритетом. Пакеты на вычитку генерирует `scripts/export_proofread.py`.
- OCR кириллицы: rapidocr находит строки, tesseract (`rus`, модель в `data/raw/tessdata/`)
  распознаёт их построчно (названия, подвалы) и блоками (текст).
- Иконки в русском тексте записываются токенами `{success}`, `{fate}`, `{fear}`, `{damage}`,
  `{might}` … — приложение рисует их глифами.

## Приложение (`app/`)

Статический сайт без бэкенда (PWA): Vite + React + TypeScript, поиск через MiniSearch,
состояние фильтров в URL, закладки и билды в localStorage. Данные и картинки берутся из
`app/public/` (не в git), куда их кладёт `scripts/prepare_app.py`.

```bash
uv run --with pillow python scripts/prepare_app.py   # png → webp в app/public/img + миниатюры в app/public/thumb, копия cards.json
python scripts/fetch_fonts.py                        # шрифты Alegreya (OFL) в app/public/fonts — один раз, файлы в git
uv run --with pillow python scripts/make_icons.py    # favicon и иконки PWA — один раз, файлы в git
cd app
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc + vite build → app/dist (+ sw.js и manifest от vite-plugin-pwa)
```

Сетка показывает миниатюры (`/thumb`, 320 px, для планшетов героев 640 px), полный скан
открывается в карточке. Сайт работает офлайн: сервис-воркер заранее кэширует приложение,
шрифты и `cards.json`, а сканы — по мере просмотра (до 3000 файлов, 60 дней). Шрифты лежат
рядом с сайтом, внешних запросов нет. На телефоне разделы переключаются нижней панелью,
фильтры выезжают панелью снизу, карты в карточке листаются свайпом (на компьютере стрелками),
тап по скану открывает его во весь экран.

### Планировщик колоды («Колода» в шапке, `?view=deck`)

Собирает колоду навыков героя по правилам справочника и считает опыт:

- стартовая колода — базовые 1–6, навыки героя 1–5, карты роли 1–3 (§34.1); карта роли 1
  сразу подготовлена (§57.3); слабости и прозвища добавляются вручную по ходу кампании;
- опыт вводится отдельно по каждой роли (§76.7); покупка и продажа карт ролей по их
  стоимости (§52.3), купленные карты остаются при смене роли (§76.6); подготовленных
  карт не больше четырёх (§57.4);
- «план прокачки» — список желаемых карт с расчётом, сколько опыта не хватает;
  впишите ожидаемый опыт, чтобы смоделировать следующие приключения;
- снаряжение с проверкой лимитов (одна броня, две руки, одна вещь — §37.4; одно верховое
  животное — правила «Ветра войны»); стартовое снаряжение подставляется с карты героя;
  «Улучшить» показывает карты той же линейки (`family`) с порогами сведений и текстом;
- статистика: символы успеха и судьбы в колоде, для каждой характеристики героя точная
  вероятность вытянуть хотя бы 1 и хотя бы 2 успеха (гипергеометрически по картам с 0/1/2
  символами) и ожидаемое число успехов.

Билды хранятся в localStorage браузера (`jime.builds`); «Ссылка на билд» кодирует билд
в параметр `b` и при открытии добавляет его копию в список. Логика — в `app/src/deck.ts`,
интерфейс — в `app/src/components/deck/`.

### GitHub Pages

Сайт живёт на <https://exe-cut3.github.io/jime-cards-ru/>. Деплой одной командой:

```bash
bash scripts/deploy_pages.sh
```

Скрипт собирает `app/dist` с базовым путём `/jime-cards-ru/`, добавляет `.nojekyll` и
пушит содержимое (включая картинки) в ветку `gh-pages`. В `main` сканов нет, они только
в `gh-pages`. Перед деплоем должны быть готовы `app/public/img` и `app/public/data`
(`scripts/prepare_app.py`).

### Docker

Образ собирает сайт (node) и раздаёт его nginx'ом. Перед сборкой в `app/public/` должны лежать
картинки и данные (`scripts/prepare_app.py`), они попадают в образ.

```bash
docker compose up -d --build     # http://localhost:8080
docker compose down
```

Или без compose:

```bash
docker build -t jime-cards-ru ./app
docker run -d --name jime-cards -p 8080:80 jime-cards-ru
```

```
app/src/
  App.tsx            # состояние, поиск, фильтрация, модалка
  data.ts            # загрузка cards.json, фасеты фильтров, закладки
  search.ts          # индекс MiniSearch (EN + RU поля)
  url.ts             # фильтры ↔ query string
  i18n.ts            # подписи интерфейса; игровые термины пока EN (до glossary.md)
  deck.ts            # планировщик колоды: билды, опыт по ролям, лимиты снаряжения, ссылка
  components/        # Filters, CardTile, CardModal, CardText, Badges, Icons, deck/ (планировщик)
  styles/tokens.css  # палитра: цвета типов карт, характеристик, дополнений
  styles/app.css     # вёрстка, адаптив от 375px (нижняя навигация, панель фильтров)
  styles/deck.css    # планировщик колоды
```

## Статус

- [x] Этап 1a — сканы с сайта-оригинала (660 файлов, manifest.json)
- [x] Этап 1b — разбор таблицы BGG (bgg.json, 6 правок в bgg_fixes.json)
- [x] Этап 1c — сводный `cards.json` (649 карт)
- [x] Этап 2 — перевод: glossary.md по официальным правилам; названия и тексты всех 649 карт
      со сканов русского издания, вычитаны по EN (осталась сверка человеком, см. `_note`)
- [x] Этап 3 — приложение: поиск, фильтры, сетка, модалка, закладки, URL, русские сканы,
      планировщик колоды; Docker и GitHub Pages
