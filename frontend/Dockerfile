# Этап 1: Сборка статики фронтенда
FROM node:20-alpine AS frontend-builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Копируем исходный код (теперь без локального node_modules благодаря .dockerignore)
COPY . .

# Переключаемся на root и чиним права доступа к исполняемым файлам npm
USER root
RUN chmod -R +x node_modules/.bin

# Запускаем сборку проекта
RUN npm run build

# Этап 2: Раздача через Nginx
FROM nginx:stable-alpine
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
ENV API_UPSTREAM=http://app:5000
ENV NGINX_ENVSUBST_FILTER=^API_UPSTREAM$
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
