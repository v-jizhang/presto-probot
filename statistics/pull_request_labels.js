const { getDatabaseClient, rollback} = require('../database/postgresql')

async function pullrequestLabeled(context, app) {
    const client = await getDatabaseClient();
    const id = context.payload.label.id;
    const pullRequestId = context.payload.pull_request.number;
    const label = context.payload.label.name;

    let insertIntoPrLabels = `INSERT INTO "pr_labels"
        ("id", "pull_request_id", "label")
        VALUES($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET
        id=EXCLUDED.id,
        pull_request_id=EXCLUDED.pull_request_id,
        label=EXCLUDED.label;`;
    
    client.query(insertIntoPrLabels,
        [id, pullRequestId, label], async (err, res) => {
            if (err) {
                app.log.error(`Insert into pr_labels failed:
                    ${err.message}. 
                    ${insertIntoPrLabels}`);
            }
            client.end();
        }
    );
}

module.exports = { pullrequestLabeled }
