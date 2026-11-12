const express = require("express");
const cors = require("cors");

const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const taskRoutes = require("./routes/taskRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const teamRoutes = require("./routes/teamRoutes");
const reportRoutes = require("./routes/reportRoutes");

const app = express();

const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "OggettoDailly API",
            version: "1.1.0",
            description: "Бизнес-API требует Bearer JWT. Менеджер (роль 1) управляет всеми командами, сотрудниками, задачами, отпусками и принимает отчёты. Работник (роль 2) читает только свои задачи, команду и отпуск. Обе роли отправляют отчёты только по своим задачам. Вход и восстановление пароля публичны."
        },
        servers: [
            { url: "http://localhost:5000", description: "Local server" }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT"
                }
            }
        },
        security: [{ bearerAuth: [] }]
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Документация доступна по http://localhost:${PORT}/api-docs`);
});
