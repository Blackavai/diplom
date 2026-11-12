# Проверки первых двух этапов: доступ, восстановление, безопасные поля и отчёты

Все команды Docker ниже выполняются из корня проекта. Используется **отдельный**
`docker-compose.recovery-test.yml`, без объединения с production Compose.
Уникальное имя проекта исключает пересечение с другими запусками.

## Модульные тесты без зависимостей и БД

```sh
node --test backend/tests/passwordRecovery.test.js
```

`npm test` из `backend` также запускает эти проверки; оба интеграционных сценария
без явного `RECOVERY_TEST_DATABASE=1` будут отмечены как пропущенные.

## HTTP и PostgreSQL

```sh
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-recovery-check up --build --abort-on-container-exit --exit-code-from backend-tests backend-tests
docker compose --env-file /dev/null -f docker-compose.recovery-test.yml -p itrum-recovery-check down
```

Перед запуском убедитесь, что выбранное имя проекта не занято другим тестовым
запуском. В этой конфигурации нет публикации портов, `env_file`, ссылок на
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
