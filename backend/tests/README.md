# Проверки согласованных этапов: доступ, восстановление, отчёты, пароли и команды

Все команды Docker ниже выполняются из корня проекта. Используется **отдельный**
`docker-compose.recovery-test.yml`, без объединения с production Compose.
Уникальное имя проекта исключает пересечение с другими запусками.

## Модульные тесты без зависимостей и БД

```sh
node --test backend/tests/passwordRecovery.test.js
node --test backend/tests/passwords.test.js backend/tests/loginAttempts.test.js
```

`npm test` из `backend` запускает файлы последовательно, ограничивая суммарную
нагрузку scrypt в тестах. Без `RECOVERY_TEST_DATABASE=1` пять интеграционных
сценариев будут пропущены; это не полный результат проверки HTTP/БД.

## HTTP и PostgreSQL

```sh
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-recovery-check up --build --abort-on-container-exit --exit-code-from backend-tests backend-tests
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-recovery-check down
```

Перед запуском убедитесь, что выбранное имя проекта не занято другим тестовым
запуском. В базовом запуске этой конфигурации нет публикации портов, `env_file`, ссылок на
существующий `pgdata` или настоящий SQL-дамп. PostgreSQL 17 хранит данные в
`tmpfs`; начальная схема содержит `role`, `users`, команды, задачи, отчёты,
отпуска и синтетические роли.
Пользователи создаются самими тестами. При остановке тестовой БД эти временные
данные исчезают. Команда `down` удаляет только ресурсы указанного проекта;
опция удаления volumes не используется.

Тесты проверяют конфигурацию подключения до загрузки `db.js`, затем имя БД через
SQL. HTTP-сервер поднимается внутри тестового контейнера на loopback и свободном
порту. Текущий backend не вызывается. Время разрешений подменяется только внутри
тестового процесса; production TTL остаётся пять минут. Ошибки восстановления
имитируются в модели; откат отчёта проверяется реальным отказом UPDATE через
trigger, создаваемый и удаляемый только в тестовой БД. Остальные операции
выполняются на настоящем тестовом PostgreSQL.

`access.integration.test.js` проверяет все 25 защищённых операций без JWT,
с поддельным/просроченным JWT, запрет управления для работника, собственные
и чужие объекты, актуальную роль в БД, авторство и атомарность отчёта,
положительные сценарии менеджера и минимальную валидацию входа. Первоначальные
проверки DTO теперь выполняют запросы от синтетического менеджера; проверки
восстановления остаются анонимными.

`passwords.integration.test.js` проверяет scrypt, длинные Unicode-пароли,
временный plaintext-переход, условное обновление при конкурентном reset,
одинаковые ошибки и лимиты входа. `migratePasswords.integration.test.js`
создаёт **дополнительную синтетическую БД** внутри того же тестового PostgreSQL,
чтобы преобразование не меняло данные других проверок. Тесты не задают срок
совместимости рабочему backend. Процедура и условия включения новой версии —
в [scripts/README.md](../scripts/README.md).

## Frontend

```sh
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-recovery-check build frontend-checks
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-recovery-check run --rm --no-deps frontend-checks
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-recovery-check run --rm --no-deps frontend-checks ./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-recovery-check run --rm --no-deps frontend-checks ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-recovery-check run --rm --no-deps frontend-checks ./node_modules/.bin/eslint src/pages/LoginPage.tsx
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-recovery-check run --rm --no-deps frontend-checks node --test tests/access.test.mjs
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-recovery-check down
```

Сборка использует существующий Dockerfile и target `frontend-builder`, включая
`npm ci` по lock-файлу и `vite build`. Каждый шаг запускается отдельно: известные
ошибки общего lint/typecheck не должны скрывать результат остальных проверок.
Результаты согласованного этапа записаны в `docs/AUDIT.md`.
Браузерные проверки описаны в `frontend/tests/README.md`.

## Четвёртый этап: команды и два proxy

`teams.integration.test.js` входит в `npm test`: создание/редактирование с
участниками, проверка входных данных, повторные и параллельные добавления,
сохранность исторических дублей, удаление заполненной команды и реальные
SQL-сбои с полным откатом. Схема тестовой БД не требует миграции.

Для настоящей цепочки Nginx/Vite → Express → PostgreSQL есть необязательный
профиль `proxy`. Он публикует **только случайные loopback-порты** тестовых
сервисов; базовые backend-тесты портов по-прежнему не публикуют.
Выбранное имя проекта должно быть свободно.

```sh
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-proxy-check --profile proxy up -d --build proxy-app proxy-nginx proxy-vite
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-proxy-check exec -T proxy-nginx nginx -t
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-proxy-check exec -T proxy-app node tests/proxy-smoke.js
```

Скрипт проверяет имя/хост/роль тестовой БД до записи, создаёт синтетического
пользователя с scrypt и проверяет оба proxy: SPA deep link, вход, cookie/Bearer,
команды, восстановление, Swagger, 401/403/404, 429/Retry-After. Секреты рабочей
среды не используются. Дополнительное разрешённое имя Vite `proxy-vite` задано
только в тестовом профиле; unrestricted allowedHosts не используется.

Браузерная проверка реальной цепочки описана в
[frontend/tests/README.md](../../frontend/tests/README.md).
Проверить временную недоступность backend можно остановкой **только** `proxy-app`:
Nginx должен вернуть 502, Vite — 500, а `/teams` продолжить отдавать HTML с 200.
Затем запустите `proxy-app` снова. Рабочий `app` останавливать для теста нельзя.

После проверки:

```sh
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-proxy-check --profile proxy down
```

Опция удаления volumes не применяется. Все данные тестовой PostgreSQL временные.
