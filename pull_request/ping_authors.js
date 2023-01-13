const config = require('config')
const util = require('node:util')
const { getDatabaseClient } = require('../database/postgresql')
const { getRepo, getOctokit } = require('../util/utils');
const { pingWithName } = require('./ping_reviewers')
const messages = require('../resources/messages.json');
const { lastPingOneDayAgo } = require('../database/dbUtils')

const selectLastPrReviews = `SELECT * FROM
    (
        SELECT r.*,
            row_number() OVER (PARTITION BY pull_request_id order by submitted_at DESC) AS row_number
        FROM pr_reviews r
        JOIN pull_requests pr ON pr.id = r.pull_request_id
        WHERE pr.status = 'open'
    ) temp WHERE row_number = 1;`;
const selectLastreviewPrRequest = `SELECT *
    FROM pr_review_requests
    WHERE pull_request_id = $1
    ORDER BY updated_at DESC LIMIT 1;`;
const selectPrAuthor = `SELECT *
    FROM pull_requests
    WHERE id = $1;`;
const updateReview = `UPDATE pr_reviews
    SET pinged_author_at = $1
    WHERE id = $2;`;

async function pingPullRequestAuthor(app)
{
    const oneDayPassedFromLastRun = await lastPingOneDayAgo(app);
    if (!oneDayPassedFromLastRun) {
        return;
    }

    const repo = getRepo();
    if (!repo) {
        return 0;
    }
    const octokit = getOctokit();

    const pingStaleAfterDays = config.get('ping-stale-response-days');
    const maxNumberOfPrsToBePinged = config.get('ping-stale-max-number-prs');
    const client = await getDatabaseClient();
    let count = 0;

    const res = await client.query(selectLastPrReviews);
    if (res.rowCount == 0) {
        client.end();
        return;
    }

    const reviews = res.rows;
    for (const review of reviews) {
        if (review.state != "changes_requested" || review.pinged_author_at != null) {
            // Already pinged or changes not requested
            continue;
        }
        const reviewRequestResult = await client.query(selectLastreviewPrRequest, [review.pull_request_id]);
        const reviewRequest = reviewRequestResult.rows;
        if (reviewRequest.length == 0 || reviewRequest[0].updated_at < review.submitted_at) {
            let pingDateBefore = new Date();
            pingDateBefore.setDate(pingDateBefore.getDate() - pingStaleAfterDays);
            if (review.submitted_at <= pingDateBefore) {
                const prResult = await client.query(selectPrAuthor, [review.pull_request_id]);
                const pr = prResult.rows;
                await pingWithName(repo, octokit, review.pull_request_id, pr[0].author, messages['stale-author-message']);
                await client.query(updateReview, [new Date(), review.id]);
                if(++count > maxNumberOfPrsToBePinged) {
                    await client.end();
                    return;
                }
            }
        }
    }
    await client.end();
}

module.exports = { pingPullRequestAuthor }