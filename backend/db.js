const { Pool, types } = require('pg');
// PostgreSQL DATE — календарный день, а не момент времени. TIMESTAMP не меняем.
types.setTypeParser(1082, (value) => value);
require('dotenv').config();

if (process.env.APP_DB_USER && !process.env.APP_DB_PASSWORD) {
    throw new Error('Для APP_DB_USER требуется отдельный APP_DB_PASSWORD');
}

const postgree = new Pool({
    host: process.env.DB_HOST,
    user: process.env.APP_DB_USER || process.env.DB_USER,
    password: process.env.APP_DB_USER ? process.env.APP_DB_PASSWORD : process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 5432),
});

module.exports = postgree;
