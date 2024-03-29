const { getDatabaseClient, rollback} = require('../database/postgresql')
const { insertIntoPullRequest, selectPullRequestBynumber } = require('./pull_request_event_received')
const { selectLastReview } = require('./pull_request_reviews')

const insertIntoReviewRequests = `INSERT INTO "pr_review_requests"
    ("pull_request_id", "review_id", "updated_at", "requested_reviewer", "request_sender")
    VALUES($1, $2, $3, $4, $5)
    ON CONFLICT ON CONSTRAINT pr_review_requests_unique
    DO NOTHING;`;
const selectPullRequest = `SELECT * from pull_requests
    WHERE id = $1;`;

async function pullRequestReviewRequested(context, app) {
    await makeSurePullRequestInsertedFirst(context, app);

    const client = await getDatabaseClient();
    const pullRequestNumber = context.payload.pull_request.number;
    const updatedAt = context.payload.pull_request.updated_at;
    const requestSender = context.payload.sender.login;
    const requestedReviewer = context.payload.requested_reviewer.login;
    let reviewId = null;

    client.query('BEGIN', (err, res) => {
        if (err) {
            return rollback(client);
        }
        client.query(selectLastReview,
            [pullRequestNumber],
            (err, res) => {
                if (err) {
                    return rollback(client);
                }
                if (res.rowCount > 0) {
                    reviewId = res.rows[0].id;
                }
                client.query(insertIntoReviewRequests,
                    [pullRequestNumber, reviewId, updatedAt, requestedReviewer, requestSender],
                    (err, res) => {
                        if (err) {
                            app.log.error(`Insert into pr_review_requests failed:
                                ${err.message}. 
                                ${insertIntoReviewRequests}`);
                            return rollback(client);
                        }
                        client.query('COMMIT', client.end.bind(client));
                    }
                );
            }
        );
    });
}

async function makeSurePullRequestInsertedFirst(context, app)
{
    const client = await getDatabaseClient();
    const pullRequestNumber = context.payload.pull_request.number;
    let retryCount = 0;
    while (retryCount < 3) {
        const pr = await client.query(selectPullRequest, [pullRequestNumber]);
        if (pr.rowCount == 0) {
            // Sleep 2 seconds
            await new Promise(r => setTimeout(r, 2000));
            retryCount++;
        }
        else {
            break;
        }
    }
    client.end();
}

module.exports = { pullRequestReviewRequested, insertIntoReviewRequests }
