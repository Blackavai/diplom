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
нагрузку scrypt в тестах. Без `RECOVERY_TEST_DATABASE=1` десять интеграционных
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
команды, восстановление, Swagger, logout/отзыв JWT, 401/403/404, 429/Retry-After. Секреты рабочей
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

## Седьмой этап: сессии и миграция

sessions.integration.test.js проверяет HTTP-вход, старые/неверные версии JWT,
отзыв всех устройств, сохранность другого пользователя, гонку logout/нового входа,
атомарность reset при SQL-ошибке, конкурентный reset/login и безопасный отказ БД.
migrateSessions.integration.test.js создаёт отдельную синтетическую БД
dailysync_session_migration_test и проверяет dry-run/target, сохранность данных,
DEFAULT/NOT NULL, повторный запуск без обнуления версии, отказ несовместимой схеме,
таймаут блокировки и безопасный CLI. Оба сценария входят в npm test.

Полный запуск после седьмого этапа: 93 проверки без пропусков. Для повторного
полного прогона нужна новая синтетическая PostgreSQL в tmpfs, поскольку фикстуры
и дополнительные тестовые БД остаются до остановки тестового контейнера. Используйте
новое свободное имя проекта либо сначала уберите только свою временную среду без -v.
Рабочие и чужие тестовые контейнеры не затрагивайте.

## Девятый этап: сотрудники

users.integration.test.js входит в npm test и проверяет реальные HTTP/SQL:
права менеджера, обязательные поля/типы/роли/id, Unicode 255/256, NUL/одиночные
суррогаты, совместимость предельного tg_id с login, 409 без изменения реквизитов,
safe DTO/хеш пароля, неизменность лишних полей при update и безопасные SQL-отказы.
Полный запуск после девятого этапа содержит 105 проверок без пропусков:
16 unit, 81 интеграционный подсценарий и 8 общих сценариев.
Входные данные и таблицы синтетические; рабочая БД не используется.

## Десятый этап: отправка отчёта

reports.integration.test.js входит в npm test и проверяет настоящие HTTP/SQL:
неверные тела/id/текст, отсутствие вызова модели при неверных данных,
невозможные даты, високосные годы и границы 0001/9999, ISO timestamp с Z/смещением,
границу смещения 15:59 PostgreSQL, Unicode 255/256, NUL/одиночные суррогаты,
сохранность пробелов и календарной части даты. Проверяются автор из JWT,
отказ чужой/отсутствующей задаче, откат INSERT при настоящем отказе завершения
задачи и сохранение существующего поведения нескольких параллельных отчётов.

Полный запуск после десятого этапа: 114 проверок без пропусков — 16 unit,
89 интеграционных подсценариев и 9 общих сценариев. Для повторного полного
запуска используйте новую синтетическую БД по инструкции выше.

proxy-smoke.js дополнительно проверяет через оба тестовых proxy отказ 400
невозможной дате, сохранение 255 Unicode-символов, календарной части ISO timestamp
и отсутствие завершённой задачи в GET. Режим --seed-browser создаёт также
собственную незавершённую задачу «Browser proxy report task» для синтетического
browser-proxy-manager. Повтор подготовки создаёт новую задачу, только если такой
незавершённой задачи ещё нет. Рабочие сервисы и их учётные записи не используются.

## Одиннадцатый этап: технические ошибки API и логи

errors.integration.test.js проверяет настоящий HTTP и синтетическую PostgreSQL.
Обработчики apiNotFound/apiErrorHandler подключены также к семи прежним
тестовым Express-приложениям после маршрутов, как в app.js. Старые проверки
не удалены и не ослаблены. Новые тесты проверяют:

- неверный и скалярный JSON в development/production без вызова auth-модели;
- прежний предел JSON 100 КиБ, включая размер после распаковки gzip;
- безопасные 400/413/415/404/500 и Cache-Control: no-store;
- неподдерживаемые charset/Content-Encoding и повреждённый gzip;
- исключение, отклонённый Promise, брошенную строку и сбой после заголовков;
- безопасный ответ/лог всех 16 изменённых обработчиков, включая прежнее поле error задач;
- настоящие SQL-отказы ввода/внешнего ключа, неизменность строк и прежние 401/403/400/404.

Модельные ошибки содержат только искусственные приватные маркеры. Проверяются
отсутствие этих значений в ответах/логах и постоянное серверное имя операции.
Тестовые error-fixture маршруты существуют только внутри файла теста и не
добавляются в app.js. При ошибке после заголовков проверяется закрытие соединения,
поскольку заменить уже начатый ответ на JSON невозможно.

Полный запуск: 142 passed, 0 failed, 0 skipped — 16 unit,
116 интеграционных подсценариев и 10 общих сценариев. proxy-smoke.js проверяет
настоящий app.js через оба proxy: JSON 400/413/415/404, прежние API/Swagger,
401/403/429/Retry-After и logout. Логи только собственного тестового proxy-app
можно проверить на отсутствие synthetic-private-proxy; реальные секреты не нужны.
