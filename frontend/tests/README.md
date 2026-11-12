# Проверки авторизации frontend

Новые зависимости не нужны: Node test runner, React, Axios и esbuild уже доступны
в существующем образе сборки frontend. Команды Docker выполняются из корня проекта.

## Клиент и guard

```sh
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-access-check build frontend-checks
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-access-check run --rm --no-deps frontend-checks node --test tests/access.test.mjs
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-access-check down
```

9 тестов проверяют передачу Bearer, публичные запросы без токена, 401/403,
поздний ответ старой сессии, безопасные логи, ожидание проверки и доступ по роли.
Axios adapter и cookie/toast заменены тестовыми объектами; запросов к API нет.
Guard проверяется React SSR; переходы и эффекты дополнительно проверяются в браузере.

## Собранный интерфейс в headless Chrome

Нужны локальные Chrome и Node >=22 (в проверке использовался Node 24). Используйте
только отдельный временный профиль Chrome, без личных cookie и открытых вкладок.
Выбранные имена контейнеров/проекта должны быть свободны.

После сборки образа выше можно раздать статику через существующий Vite preview:

```sh
docker run -d --name itrum-access-browser -p 127.0.0.1::5173 itrum-access-check-frontend-checks npm run preview -- --host 0.0.0.0 --port 5173
docker port itrum-access-browser 5173
```

Запустите отдельный Chrome с `--headless=new --no-first-run`,
`--disable-background-networking --disable-component-update --disable-sync`,
`--remote-debugging-port=0` и `--user-data-dir=<новый временный каталог>`.
Из строки `DevTools listening on ws://127.0.0.1:PORT/...` возьмите порт CDP.
Из `docker port` возьмите порт статики и выполните на хосте:

```sh
node frontend/tests/browser-access.mjs <порт-CDP> http://127.0.0.1:<порт-статики> --close-browser
```

Скрипт перехватывает **все** обращения к текущему адресу API до сети, поэтому
рабочий backend не вызывается. Внешние HTTPS-ресурсы блокируются. Cookie, ответы,
пользователи и токены искусственные. Проверяются 12 сценариев: анонимный переход,
ожидание сервера и подмена роли cookie, свои задачи/повреждённый кэш, 401 при
бизнес-запросе, временная ошибка/retry, доступ менеджера, повторный вход с тем же
токеном, 403 без logout и просроченная сессия при загрузке. Добавлены длинные
пароли во входе/сбросе/создании пользователя, блокировка двойной отправки и
отображение 429. Значения сверяются с исходными без печати паролей в результатах.
Флаг `--close-browser` закрывает только выделенный тестовый экземпляр Chrome
через CDP; используйте его исключительно с отдельным временным профилем.

Это функциональная проверка React с искусственными ответами, не сквозной тест
браузер → рабочий backend/БД. Backend/CORS/транзакции отдельно проверяются
`backend/tests/access.integration.test.js`. Внешний доступ, TLS, proxy и все
визуальные состояния этим не подтверждаются.

Если флаг закрытия не использовался, завершите запущенный тестовый Chrome.
Затем уберите свой контейнер:

```sh
docker stop itrum-access-browser
docker rm itrum-access-browser
```

Volumes для браузерного контейнера не создаются. Результаты фактического запуска
первых трёх этапов записаны в `docs/AUDIT.md`.
