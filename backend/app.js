const express = require("express");
const cors = require("cors");

const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const taskRoutes = require("./routes/taskRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const teamRoutes = require("./routes/teamRoutes");
const reportRoutes = require("./routes/reportRoutes");
const { apiNotFound, apiErrorHandler } = require('./middleware/errorMiddleware');

const app = express();

const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "OggettoDailly API",
            version: "1.1.0",
            description: "Бизнес-API принимает Bearer JWT или HttpOnly-cookie dailysync_session. Cookie-запросы изменения требуют X-Session-Id и X-CSRF-Token из /api/auth/protected; это относится и к старому GET удаления сотрудника. Менеджер (роль 1) управляет всеми командами, сотрудниками, задачами, отпусками и принимает отчёты. Работник (роль 2) читает только свои задачи, команду и отпуск. Обе роли отправляют отчёты только по своим задачам. Личная смена пароля доступна обеим ролям, сброс другого пользователя — менеджеру с подтверждением своего пароля. Старые публичные recovery-маршруты отвечают 410; данные вопроса/ответа сохраняются."
        },
        servers: [
            { url: "/", description: "Текущий сервер (напрямую или через frontend proxy)" }
        ],
        components: {
            parameters: {
                SessionIdHeader: { in: 'header', name: 'X-Session-Id', required: false,
                    description: 'Обязателен для изменения по cookie; sessionId из /api/auth/protected',
                    schema: { type: 'string', pattern: '^[a-f0-9]{32}$' } },
                CsrfHeader: { in: 'header', name: 'X-CSRF-Token', required: false,
                    description: 'Обязателен для изменения по cookie; csrfToken из /api/auth/protected',
                    schema: { type: 'string', pattern: '^[a-f0-9]{64}$' } }
            },
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT"
                },
                cookieAuth: { type: "apiKey", in: "cookie", name: "dailysync_session" }
            }
        },
        security: [{ bearerAuth: [] }, { cookieAuth: [] }]
    },
    apis: ["./routes/*.js"]
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

app.use(cors({ origin: 'http://localhost:8080', credentials: true }));
app.use(express.json());

app.use("/api/tasks", taskRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/reports", reportRoutes);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api', apiNotFound);
// Express 5 передаёт сюда также отклонённые Promise из async-маршрутов.
app.use(apiErrorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Документация доступна по http://localhost:${PORT}/api-docs`);
});
