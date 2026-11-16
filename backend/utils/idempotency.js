const { createHash } = require('node:crypto');

function requestKey(req) {
    const key = req.get('Idempotency-Key');
    if (!key) return req.authMode === 'cookie' ? false : null;
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(key) ? key : false;
}

async function beginOperation(client, userId, operation, key, payload) {
    if (!key) return null;
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const inserted = await client.query(`INSERT INTO request_idempotency(user_id, operation, request_key, request_hash)
        VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, operation, request_key) DO NOTHING RETURNING request_key`,
    [userId, operation, key, hash]);
    if (inserted.rowCount) return null;
    // Конкурирующий INSERT дождётся commit/rollback первой операции.
    const previous = (await client.query(`SELECT request_hash, result FROM request_idempotency
        WHERE user_id=$1 AND operation=$2 AND request_key=$3 FOR UPDATE`, [userId, operation, key])).rows[0];
    if (!previous || previous.request_hash !== hash) {
        const error = new Error('Ключ запроса уже использован с другими данными');
        error.code = 'IDEMPOTENCY_CONFLICT';
        throw error;
    }
    if (!previous.result) throw new Error('Incomplete idempotency record');
    return previous.result;
}

async function finishOperation(client, userId, operation, key, result) {
    if (!key) return;
    const updated = await client.query(`UPDATE request_idempotency SET result=$4::jsonb
        WHERE user_id=$1 AND operation=$2 AND request_key=$3`, [userId, operation, key, JSON.stringify(result)]);
    if (updated.rowCount !== 1) throw new Error('Idempotency result not saved');
}

module.exports = { requestKey, beginOperation, finishOperation };
