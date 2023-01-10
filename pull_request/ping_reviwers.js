const config = require('config')
const util = require('node:util')
const { getDatabaseClient, rollback } = require('../database/postgresql')
const { selectLastReview } = require('../statistics/pull_request_reviews')
const { getRepo, getOctokit } = require('../util/utils');
const messages = require('../resources/messages.json');

// Select the last review request for all the pull requests that is not closed.
const selectLastReviewRequest = `SELECT * FROM
    (SELECT req.*,
        row_number() OVER (PARTITION BY pull_request_id order by updated_at DESC) AS row_number
    FROM pr_review_requests req
    JOIN pull_requests pr ON pr.id = req.pull_request_id
    WHERE pr.status = 'open'
    ) temp WHERE row_number = 1;`;
const updateReviewRequest = `UPDATE pr_review_requests
    SET pinged_reviewer_at = $1
    WHERE id = $2;`;

async function pingPullRequests()
{
    const repo = getRepo();
    if (!repo) {
        return 0;
    }
    const octokit = getOctokit();

    const pingStaleAfterDays = config.get('ping-stale-response-days');
    const maxNumberOfPrsToBePinged = config.get('ping-stale-max-number-prs');
    const client = await getDatabaseClient();
    let count = 0;

    const res = await client.query(selectLastReviewRequest);
    if (res.rowCount == 0) {
        client.end();
        return 0;
    }
    const reviewRequests = res.rows;
    for (const request of reviewRequests) {
        if (request.pinged_reviewer_at != null) {
            // Already pinged
            continue;
        }
        const reviewResult = await client.query(selectLastReview, [request.pull_request_id]);
        const reviews = reviewResult.rows;
        if (reviews.length == 0 || request.updated_at > reviews[0].submitted_at) {
            let pingDateBefore = new Date();
            pingDateBefore.setDate(pingDateBefore.getDate() - pingStaleAfterDays);
            if (request.updated_at <= pingDateBefore) {
                pingReviwers(repo, octokit, request.pull_request_id, request.requested_reviewer);
                await client.query(updateReviewRequest, [new Date(), request.id]);
                if(++count > maxNumberOfPrsToBePinged) {
                    await client.end();
                    return count;
                }
            }
        }
    }
    await client.end();
    return count;
}

async function pingReviwers(repo, octokit, prId, reviewer)
{
    const message = util.format(messages['stale-reviewer-messaged'], reviewer);
    await octokit.issues.createComment({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: prId,
        body: message,
    });
}

module.exports = {pingPullRequests}