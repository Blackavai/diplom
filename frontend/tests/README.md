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
пользователи и токены искусственные. Проверяются 17 сценариев (12 авторизации/паролей и пять команд): анонимный переход,
ожидание сервера и подмена роли cookie, свои задачи/повреждённый кэш, 401 при
бизнес-запросе, временная ошибка/retry, доступ менеджера, повторный вход с тем же
токеном, 403 без logout и просроченная сессия при загрузке. Добавлены длинные
пароли во входе/сбросе/создании пользователя, блокировка двойной отправки и
отображение 429. Значения сверяются с исходными без печати паролей в результатах.
Флаг `--close-browser` закрывает только выделенный тестовый экземпляр Chrome
через CDP; используйте его исключительно с отдельным временным профилем.

Первая проверка — функциональная проверка React с искусственными ответами, не сквозной тест
браузер → рабочий backend/БД. Backend/CORS/транзакции отдельно проверяются
`backend/tests/access.integration.test.js`. Внешний доступ, TLS, proxy и все
визуальные состояния этим скриптом не подтверждаются; проверка реального proxy описана ниже.

Если флаг закрытия не использовался, завершите запущенный тестовый Chrome.
Затем уберите свой контейнер:

```sh
docker stop itrum-access-browser
docker rm itrum-access-browser
```

Volumes для браузерного контейнера не создаются. Результаты фактического запуска
согласованных этапов записаны в `docs/AUDIT.md`.

## Четвёртый этап

Оба Axios-клиента используют относительный `/api`. Браузерный перехват теперь
охватывает `<origin frontend>/api/*`; старый localhost:5001 не используется.
17 сценариев включают прежние 12 и пять проверок команд: один запрос создания,
блокировку двойной отправки, исключение существующих участников, обновление
состава/очистку выбора, повторное открытие, ошибку загрузки/retry и сохранение
черновика после ошибки создания. Условие ожидания сохранения проверяет доступность
кнопки после повторной загрузки состава, а не только количество строк.

### Реальная цепочка браузер → proxy → backend → тестовая БД

Запустите отдельный профиль `proxy` по инструкции
[backend/tests/README.md](../../backend/tests/README.md). Создайте только тестовую
учётную запись и определите временный порт Nginx:

```sh
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-proxy-check exec -T proxy-app node tests/proxy-smoke.js --seed-browser
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-proxy-check port proxy-nginx 80
```

С отдельным Chrome, запущенным по инструкции выше, выполните:

```sh
node frontend/tests/browser-proxy.mjs <порт-CDP> http://127.0.0.1:<порт-Nginx> browser-proxy-manager
```

Этот скрипт **не перехватывает API**: проверяет настоящий вход через форму,
проверку сессии, создание/удаление синтетической команды и то, что все запросы
`/api` идут к origin frontend. Допускает только loopback URL и фиксированные
синтетические имена пользователей. Он предназначен исключительно для тестовой
среды; не направляйте его на рабочий frontend. Пароль синтетической записи
задан в тесте. Стандартные browser-access тесты выполняйте отдельным запуском.

Для двух npm-процессов аналогично проверяется loopback-адрес Vite с отдельно
подготовленной синтетической БД и пользователем `host-proxy-manager`. В четвёртом
этапе это действительно выполнено на компьютере во временной копии репозитория,
с `npm ci` из lock-файлов, Node 24.20.0 и PostgreSQL 17 в отдельном Docker-проекте.
Порты frontend/backend/БД были случайными и отличались от стандартных. Рабочий
`.env`, существующий node_modules и рабочая БД не использовались.

По окончании закройте выделенный Chrome (или используйте поддержанный
browser-access.mjs флаг `--close-browser`), остановите свои npm-процессы и
удалите только контейнеры/сеть своего тестового проекта без `-v`.
