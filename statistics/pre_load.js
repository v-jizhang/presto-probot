const { getDatabaseClient } = require('../database/postgresql')
const { insertIntoPullRequest } = require('./pull_request_event_received')
const { getRepo, getOctokit } = require('../util/utils')
const { insertIntoPrReviews } = require('./pull_request_reviews')
const { insertIntoPrLabels } = require('./pull_request_labels')
const { getPage, parsePage } = require('./pull_request_page_parser')
const { insertIntoReviewRequests } = require('./pull_request_reviewer_requests')

const selectLastPreload = `SELECT * FROM logs
    WHERE event = 'preload'
    ORDER BY event_time DESC LIMIT 1;`;
const selectPreloadEnd = `SELECT * FROM logs
    WHERE event = 'preload_end';`;
const updatePreloadLog = `INSERT INTO logs
    ("event", "event_time", "message")
    VALUES('preload', $1, $2);`;

async function preLoadPullRequestData(app)
{
    const startAndEnd = await getStartPrNumber(app);
    let prStartNumber = startAndEnd.start;
    const prEndNumber = startAndEnd.end;
    if (!prStartNumber || isNaN(prStartNumber) || prStartNumber < 1 || prStartNumber >= prEndNumber) {
        return;
    }

    // preload 30 PRs per hour
    const client = await getDatabaseClient();
    for (let i = 0; i < 30; i++) {
        if (prStartNumber >= prEndNumber) {
            break;
        }
        if (!await loadPullRequestByPrNumber(app, client, prStartNumber++)) {
            prStartNumber = -1;
            break;
        }
        // Sleep 3 seconds to avoid rate limit
        await new Promise(r => setTimeout(r, 3000));
    }

    
    client.query(updatePreloadLog,
        [new Date(), prStartNumber.toString()],
        (err, res) => {
            if (err) {
                app.log.error(err);
            }
            client.end();
        });
}

async function getStartPrNumber(app)
{
    const client = await getDatabaseClient();
    try {
        const resStart = await client.query(selectLastPreload);
        if (resStart.rowCount === 0) {
            return {
                start: 1,
                end: -1
            };
        }
        const startNumber = parseInt(resStart.rows[0].message);
        let endNumber = -1;
        const resEnd = await client.query(selectPreloadEnd);
        if (resEnd.rowCount > 0) {
            endNumber = parseInt(resEnd.rows[0].message);
        }

        return {
            start: startNumber,
            end: endNumber
        };
    } catch (err) {
        app.log.error(err);
        return -1;
    }
    finally {
        client.end();
    }

    return -1;
}

async function loadPullRequestByPrNumber(app, client, prNumber) {
    const octokit = getOctokit();
    const repo = getRepo();

    let pullRequest;
    try {
        pullRequest = await octokit.rest.issues.get({
            owner: repo.owner,
            repo: repo.repo,
            issue_number: prNumber
        });

    } catch (err) {
        // No more PRs
        return false;
    }

    if (!pullRequest.data.pull_request) {
        // This is an issue, not a pr.
        return true;
    }

    await new Promise(r => setTimeout(r, 2000));
    const prReviews = await octokit.rest.pulls.listReviews({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: prNumber
    });

    const title = pullRequest.data.title;
    const author = pullRequest.data.user.login;
    const createdAt = pullRequest.data.created_at;
    const closedAt = pullRequest.data.closed_at;
    const mergedAt = pullRequest.data.pull_request.merged_at;
    const labels = pullRequest.data.labels;
    let status = pullRequest.data.state;
    if (pullRequest.data.merged || pullRequest.data.pull_request.merged_at) {
        status = "merged";
    }

    try {
        await client.query(insertIntoPullRequest,
            [prNumber, title, author, createdAt, closedAt, mergedAt, status]);
        for (let i = 0; i < labels.length; i++) {
            await client.query(insertIntoPrLabels,
            [prNumber, labels[i].name]);
        }
        for (let i = 0; i < prReviews.data.length; i++) {
            const reviewId = prReviews.data[i].id;
            const submittedAt = prReviews.data[i].submitted_at;
            const reviewAuthor = prReviews.data[i].user.login;
            const state = prReviews.data[i].state.toLowerCase();
            await client.query(insertIntoPrReviews,
                [reviewId, prNumber, submittedAt, reviewAuthor, state]);
        }

        const url = `https://github.com/${repo.owner}/${repo.repo}/pull/${prNumber}`;

        getPage(url, (html) => {
            const reviewRequests = parsePage(html);
            for (let i = 0; i < reviewRequests.length; i++) {
                client.query(insertIntoReviewRequests,
                    [prNumber, null, reviewRequests[i].updated_time,
                        reviewRequests[i].requested_reviewer, reviewRequests[i].requested_sender]);
            }
        });
        
    } catch(err) {
        app.log.error(err);
    }

    return true;
}
module.exports = {preLoadPullRequestData}
