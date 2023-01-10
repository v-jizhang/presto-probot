const { getDatabaseClient, rollback } = require('../database/postgresql')
const { insertIntoPullRequest, selectPullRequestBynumber } = require('./pull_request_event_received')

const insertIntoPrReviews = `INSERT INTO "pr_reviews" 
    ("id", "pull_request_id", "submitted_at", "author", "state")
    VALUES($1, $2, $3, $4, $5)
    ON CONFLICT (id) DO UPDATE SET
    id=EXCLUDED.id,
    pull_request_id=EXCLUDED.pull_request_id,
    submitted_at=EXCLUDED.submitted_at,
    author=EXCLUDED.author,
    state=EXCLUDED.state`;
const selectLastReview = `SELECT * FROM pr_reviews WHERE pull_request_id = $1
        ORDER BY submitted_at DESC LIMIT 1`;

async function pullRequestReviewSubmitted(context, app) {
    const client = await getDatabaseClient();
    const reviewId = context.payload.review.id;
    const pullRequestNumber = context.payload.pull_request.number;
    const submittedAt = context.payload.review.submitted_at;
    const reviewAuthor = context.payload.review.user.login;
    const state = context.payload.review.state;

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
            [pullRequestNumber],
            (err, res) => {
                if (err) {
                    return rollback(client);
                }
                if (res.rowCount == 0) {
                    client.query(insertIntoPullRequest,
                        [pullRequestNumber, pullRequestTitle, pullRequestCreatedAt, pullRequestClosedAt, pullRequestMergedAt, pullReqestStatus],
                        (err, res) => {
                            if (err) {
                                return rollback(client);
                            }
                        }
                    );
                }
                client.query(insertIntoPrReviews,
                    [reviewId, pullRequestNumber, submittedAt, reviewAuthor, state],
                    (err, res) => {
                        if (err) {
                            app.log.error(`Insert into pr_reviews failed:
                                ${err.message}. 
                                ${insertIntoPrReviews}`);
                            return rollback(client);
                        }
                        client.query('COMMIT', client.end.bind(client));
                    }
                );
            }
        );
    });
}

module.exports = {pullRequestReviewSubmitted, selectLastReview}
