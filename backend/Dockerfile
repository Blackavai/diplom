FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5
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
