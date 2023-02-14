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
const selectPrNumOfLastLoad = `SELECT * FROM logs
    WHERE event = 'preload' and message = $1;`;
const selectLastPrLoaded = `SELECT * FROM pull_requests
    ORDER by id DESC limit 1;`;

async function preLoadPullRequestData(app)
{
    const startAndEnd = await getStartPrNumber(app);
    let prStartNumber = startAndEnd.start;
    const prEndNumber = startAndEnd.end;
    if (!prStartNumber || isNaN(prStartNumber) || prStartNumber < 1 || (prStartNumber >= prEndNumber && prEndNumber > 0)) {
        return;
    }

    // preload 80 PRs per hour
    const client = await getDatabaseClient();
    let retryCount = 3;
    for (let i = 0; i < 80; i++) {
        if (prStartNumber >= prEndNumber && prEndNumber != -1) {
            break;
        }
        if (!await loadPullRequestByPrNumber(app, client, prStartNumber++)) {
            // Loading failed, retry the last one
            if (retryCount > 0) {
                prStartNumber = prStartNumber - 1;
                retryCount--;
            }
            else {
                retryCount = 3;
            }
        }
        else {
            retryCount = 3;
        }
        // Sleep 3 seconds to avoid hitting rate limit
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
        let endNumber = -1;
        const resEnd = await client.query(selectPreloadEnd);
        if (resEnd.rowCount > 0) {
            endNumber = parseInt(resEnd.rows[0].message);
        }

        const resStart = await client.query(selectLastPreload);
        if (resStart.rowCount === 0) {
            return {
                start: 1,
                end: endNumber
            };
        }

        const resCount = await client.query(selectPrNumOfLastLoad, [resStart.rows[0].message]);
        let startNumber = parseInt(resStart.rows[0].message);
        if(resCount.rowCount > 2) {
            // Tried at least 3 time, this PR cannot be read, skip it.
            startNumber++;
        }

        const resLastPr = await client.query(selectLastPrLoaded);
        if (resLastPr.rowCount === 1 && startNumber <= resLastPr.rows[0].id) {
            startNumber = resLastPr.rows[0].id + 1;
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
