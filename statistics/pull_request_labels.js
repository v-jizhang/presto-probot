const { getDatabaseClient, rollback} = require('../database/postgresql')
const { insertIntoPullRequest, selectPullRequestBynumber } = require('./pull_request_event_received')

const insertIntoPrLabels = `INSERT INTO "pr_labels"
        ("id", "pull_request_id", "label")
        VALUES($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET
        id=EXCLUDED.id,
        pull_request_id=EXCLUDED.pull_request_id,
        label=EXCLUDED.label;`;
const deleteFromPrLabels = `DELETE FROM "pr_labels"
        WHERE "pull_request_id" = $1 and "label" = $2`;

async function pullrequestLabeled(context, app) {
    const client = await getDatabaseClient();
    const id = context.payload.label.id;
    const pullRequestId = context.payload.pull_request.number;
    const label = context.payload.label.name;

    const pullRequestTitle = context.payload.pull_request.title;
    const pullRequestCreatedAt = context.payload.pull_request.created_at;
    const pullRequestClosedAt = context.payload.pull_request.closed_at;
    const pullRequestMergedAt = context.payload.pull_request.merged_at;
    const pullReqestStatus = context.payload.pull_request.state;
    
    client.query('BEGIN', (err, res) => {
        if (err) {
            return rollback(client);
        }
        client.query(selectPullRequestBynumber,
            [pullRequestId],
            (err, res) => {
                if (err) {
                    return rollback(client);
                }
                if (res.rowCount == 0) {
                    client.query(insertIntoPullRequest,
                        [pullRequestId, pullRequestTitle, pullRequestCreatedAt, pullRequestClosedAt, pullRequestMergedAt, pullReqestStatus],
                        (err, res) => {
                            if (err) {
                                return rollback(client);
                            }
                        }
                    );
                }
                client.query(insertIntoPrLabels,
                    [id, pullRequestId, label],
                    (err, res) => {
                        if (err) {
                            app.log.error(`Insert into pr_labels failed:
                                ${err.message}. 
                                ${insertIntoPrLabels}`);
                            return rollback(client);
                        }
                        client.query('COMMIT', client.end.bind(client));
                    }
                );
            }
        );
    });
}

async function pullrequestUnlabeled(context, app) {
    const client = await getDatabaseClient();
    const pullRequestId = context.payload.pull_request.number;
    const label = context.payload.label.name;

    client.query(deleteFromPrLabels,
        [pullRequestId, label],
        (err, res) => {
            if (err) {
                app.log.error(err.message);
            }
        }
    );
}

module.exports = { pullrequestLabeled, pullrequestUnlabeled }
