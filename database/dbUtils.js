const { getDatabaseClient} = require('../database/postgresql')

const selectLastPingLog = `SELECT * FROM logs
    WHERE event = 'ping'
    ORDER BY event_time DESC LIMIT 1;`;
const insertIntoLogs = `INSERT INTO logs ("event", "event_time")
    VALUES($1, $2);`;

async function lastPingOneDayAgo(app)
{
    const client = await getDatabaseClient();
    try {
        const res = await client.query(selectLastPingLog);
        if (res.rowCount == 0) {
            return true;
        }
        const lastPing = res.rows[0];
        let yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (lastPing.event_time < yesterday) {
            return true;
        }
    } catch (err) {
        app.log.error(err);
        return false;
    }
    finally {
        client.end();
    }

    return false;
}

async function pinUpdateLogs(app)
{
    const client = await getDatabaseClient();
    client.query(insertIntoLogs, ['ping', new Date()], (err, res) => {
        if (err) {
            app.log.error();
        }
        client.end();
    });
}

module.exports = { lastPingOneDayAgo, pinUpdateLogs }
