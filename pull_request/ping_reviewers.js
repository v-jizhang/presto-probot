const config = require('config')
const util = require('node:util')
const { getDatabaseClient } = require('../database/postgresql')
const { selectLastReview } = require('../statistics/pull_request_reviews')
const { getRepo, getOctokit } = require('../util/utils');
const messages = require('../resources/messages.json');
const { lastPingOneDayAgo } = require('../database/dbUtils')

// Select the last review request for all the pull requests that is not closed.
const selectLastReviewRequests = `SELECT * FROM
    (SELECT req.*,
        row_number() OVER (PARTITION BY pull_request_id order by updated_at DESC) AS row_number
    FROM pr_review_requests req
    JOIN pull_requests pr ON pr.id = req.pull_request_id
    WHERE pr.status = 'open'
    ) temp WHERE row_number = 1;`;
const updateReviewRequest = `UPDATE pr_review_requests
    SET pinged_reviewer_at = $1
    WHERE id = $2;`;

async function pingPullRequestReviewers(app)
{
    const oneDayPassedFromLastRun = await lastPingOneDayAgo(app);
    if (!oneDayPassedFromLastRun) {
        return;
    }

    const repo = getRepo();
    if (!repo) {
        return;
    }
    const octokit = getOctokit();

    const pingStaleAfterDays = config.get('ping-stale-response-days');
    const maxNumberOfPrsToBePinged = config.get('ping-stale-max-number-prs');
    const client = await getDatabaseClient();
    let count = 0;

    const res = await client.query(selectLastReviewRequests);
    if (res.rowCount == 0) {
        client.end();
        return;
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
                await pingWithName(repo, octokit, request.pull_request_id, request.requested_reviewer, messages['stale-reviewer-message']);
                await client.query(updateReviewRequest, [new Date(), request.id]);
                if(++count > maxNumberOfPrsToBePinged) {
                    await client.end();
                    return;
                }
            }
        }
    }
    await client.end();
}

async function pingWithName(repo, octokit, prId, name, messagePattern)
{
    const message = util.format(messagePattern, name);
    await octokit.issues.createComment({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: prId,
        body: message,
    });
}

module.exports = { pingPullRequestReviewers, pingWithName }