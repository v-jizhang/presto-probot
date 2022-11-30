const { Client } = require('pg');

async function getDatabaseClient() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    await client.connect();
    return client;
}

async function closeClient(client) {
    client.end();
}

function rollback(client) {
    client.query('ROLLBACK', () => {
        client.end();
    });
}

module.exports = { getDatabaseClient, closeClient, rollback }
