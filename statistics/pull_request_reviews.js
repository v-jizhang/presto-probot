const { getDatabaseClient } = require('../database/postgresql')
const { insertIntoPullRequest } = require('./pull_request_closed')

async function pullRequestReviewSubmitted(context, app) {
    const client = await getDatabaseClient();
    const reviewId = context.payload.review.id;
    const pullRequestNumber = context.payload.pull_request.number;
    const submittedAt = context.payload.review.submitted_at;
    const reviewAuthor = context.payload.review.user.login;
    const state = context.payload.review.state;

    let insertIntoPrReviews = `INSERT INTO "pr_reviews" 
        ("id", "pull_request_id", "submitted_at", "author", "state")
        VALUES($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
        id=EXCLUDED.id,
        pull_request_id=EXCLUDED.pull_request_id,
        submitted_at=EXCLUDED.submitted_at,
        author=EXCLUDED.author,
        state=EXCLUDED.state`;

    client.query(insertIntoPrReviews,
        [reviewId, pullRequestNumber, submittedAt, reviewAuthor, state], async (err, res) => {
            if (err) {
                app.log.error(`Insert into pr_reviews failed:
                    ${err.message}. 
                    ${insertIntoPrReviews}`);
            }
            client.end();
        }
    );
}

module.exports = {pullRequestReviewSubmitted}
