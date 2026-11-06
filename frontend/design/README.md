# RP Gant — UI/UX prototype package

Визуальный прототип для согласования UI/UX. Не является production-кодом.

## Файлы

| Файл | Назначение |
|---|---|
| `tokens.css` | Дизайн-токены: цвета, типографика, отступы, радиусы, тени, размеры |
| `prototype.css` | Стили компонентов и экранов |
| `prototype.html` | Интерактивный прототип 6 экранов |
| `ui-kit.html` | Палитра, типографика, controls, badges, modal, toast, alert |

Скриншоты в репозитории не хранятся: их можно сгенерировать локально по инструкции ниже.

## Как открыть

Открыть `prototype.html` в браузере. Переключатель экранов — в правом нижнем углу.

Прямые ссылки:

- `prototype.html?screen=auth`
- `prototype.html?screen=projects`
- `prototype.html?screen=gantt`
- `prototype.html?screen=notifications`
- `prototype.html?screen=audit`
- `prototype.html?screen=admin`

Для скриншота без переключателя добавить `&shot=1`.

UI kit: `ui-kit.html`.

## Скриншоты

Скриншоты не входят в git. При необходимости их можно сгенерировать локально:

```powershell
New-Item -ItemType Directory -Force screenshots
$html = "file:///D:/path/to/prototype.html"
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --headless=new --disable-gpu --hide-scrollbars `
  --force-device-scale-factor=1 --window-size=1440,1024 `
  --virtual-time-budget=2200 `
  --screenshot="screenshots/02-projects.png" `
  "$html?screen=projects&shot=1"
```

Для UI kit: `--window-size=1440,2700`, URL `ui-kit.html`.

## Ограничения

- Статический прототип, без API и WebSocket.
- Нет мобильной версии и dark theme.
- Это не production-код: рабочая реализация находится в `apps/frontend`, стили и токены перенесены в `apps/frontend/public/design-system.css`.
- Исходная визуальная спецификация может вестись в отдельном рабочем каталоге; этот каталог — архив прототипа.
