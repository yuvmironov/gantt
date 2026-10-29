# SMART OATI — UI/UX prototype package

Визуальный прототип для согласования UI/UX. Не является production-кодом.

## Файлы

| Файл | Назначение |
|---|---|
| `tokens.css` | Дизайн-токены: цвета, типографика, отступы, радиусы, тени, размеры |
| `prototype.css` | Стили компонентов и экранов |
| `prototype.html` | Интерактивный прототип 6 экранов |
| `ui-kit.html` | Палитра, типографика, controls, badges, modal, toast, alert |
| `screenshots/` | PNG-скриншоты для согласования |

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

| Файл | Экран |
|---|---|
| `screenshots/01-auth.png` | Auth |
| `screenshots/02-projects.png` | Проекты |
| `screenshots/03-gantt-comments.png` | Гант + комментарии |
| `screenshots/04-notifications.png` | Уведомления |
| `screenshots/05-audit.png` | Аудит + детали |
| `screenshots/06-admin.png` | Админка: пользователи |
| `screenshots/07-ui-kit.png` | UI kit |

## Перегенерация скриншотов

Требуется Chrome или Edge. Пример для Chrome:

```powershell
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
- Не production CSS; компоненты нужно перенести в Nuxt/Tailwind.
- Скриншоты и визуальные спецификации: `..\..\..\Системные постановки\UI_UX_Visual_Design_SMART_OATI.md`.
