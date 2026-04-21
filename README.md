# Electron Starter React — Spreadsheet Import

Мінімальний starter на Electron + React для тесту.

## Що вміє

- відкриває `.xlsx`, `.xls`, `.csv`
- кожен рядок таблиці перетворює на окремий post object
- назви колонок стають ключами об'єкта
- колонка `media_urls` обробляється окремо
- якщо в `media_urls` є абсолютні шляхи через `|`, файли читаються з диска
- для кожного поста збирається `FormData`
- усі звичайні поля таблиці додаються як текстові поля
- усі файли з `media_urls` додаються у `FormData` під ключем `media`
- є тестова відправка на endpoint

## Приклад `media_urls`

```txt
/Users/romansmihotur/Desktop/Характерник/aaa-2.jpg|/Users/romansmihotur/Desktop/Характерник/PixVerse.mp4
```

## Формат FormData

Для кожного поста збирається multipart payload такого типу:

- `owner`
- `title`
- `subtitle`
- `description`
- `media_type`
- `links`
- `premium_text`
- `tags`
- `priority`
- `media_urls`
- `media` -> file #1
- `media` -> file #2
- ...

Тобто всі колонки йдуть як текстові поля, а файли додаються окремо під однаковим ключем `media`.

## Запуск

```bash
npm install
npm run dev
```

## Збірка

```bash
npm run build
```

Окремо:

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

## Тестовий endpoint

За замовчуванням у UI стоїть:

```txt
https://httpbin.org/post
```

Можна замінити на свій backend endpoint.
