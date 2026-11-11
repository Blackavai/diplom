# Веб-панель для автоматизации ежедневных встреч

## Описание проекта



## Инструкция для запуска проекта

### Способ 1 - ручной запуск

Необходимо иметь установленные: 
 - Node.js (20.17 и выше)
 - PostgreSQL (17)

Клонируем репозитории в корневую папку проекта

```
./frontend
git clone https://github.com/Blackavai/OggetoDailyBot

./backend
git clone https://github.com/Blackavai/Oggetto-backend
```

Прописываем `npm install` для установки необходимых пакетов

Запуск проекта - `npm run build`

Вывод в терминале при успешном старте

Backend:
```
Сервер запущен на порту 5000
Документация доступна по http://localhost:5000/api-docs
```

Frontend:
```
  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```
### Способ 2 - использование Docker

Клонируем репозитории в корневую папку проекта

```
./frontend
git clone https://github.com/Blackavai/OggetoDailyBot

./backend
git clone https://github.com/Blackavai/Oggetto-backend
```

В общей папке проекта вставить файл `docker-compose.yml`
```dockerfile
version: '3'
services:
  backend:
    build:
      context: ./backend
    ports:
      - "5000:5000"
    networks:
      - mynetwork
  
  frontend:
    build:
      context: ./frontend
    ports:
      - "5173:80"
    networks:
      - mynetwork

networks:
  mynetwork:
```

Запуск проекта
`docker-compose up --build -d`

## Стек технологий



