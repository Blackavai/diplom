FROM node:20-alpine
WORKDIR /app

# Устанавливаем инструменты для компиляции бинарных C++ зависимостей (нужно для bcrypt)
RUN apk add --no-cache make gcc g++ python3

# Копируем файлы манифестов
COPY package*.json ./

# Чистая установка зависимостей ОДОБРЕННАЯ для Linux alpine
RUN npm ci

# Копируем остальной код (без локального node_modules благодаря .dockerignore)
COPY . .

CMD ["node", "app.js"]
