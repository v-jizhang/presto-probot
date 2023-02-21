const { getDatabaseClient } = require('../database/postgresql')
const { insertIntoPullRequest } = require('./pull_request_event_received')
const { insertIntoIssue, insertIntoComments } = require('./issue_event_received')
const { getRepo, getOctokit } = require('../util/utils')
const { insertIntoPrReviews, insertIntoReviewComments, insertIntoAssignees } = require('./pull_request_reviews')
const { insertIntoPrLabels } = require('./pull_request_labels')
const { getPage, parsePage } = require('./pull_request_page_parser')
const { insertIntoReviewRequests } = require('./pull_request_reviewer_requests')

const selectLastPreloadingTask = `SELECT * FROM tasks
    WHERE task = 'preload'
    ORDER BY id DESC limit 1;`;
const updateLastPreloadingTask = `UPDATE tasks
    SET status = $1, updated_at = $2
    WHERE id = $3;`;
const selectLastPreload = `SELECT * FROM logs
    WHERE event = 'preload'
    ORDER BY event_time DESC LIMIT 1;`;
const selectPreloadEnd = `SELECT * FROM logs
    WHERE event = 'preload_end';`;
const updatePreloadLog = `INSERT INTO logs
    ("event", "event_time", "message")
    VALUES('preload', $1, $2);`;
const selectLastPrLoaded = `SELECT * FROM pull_requests
    ORDER by id DESC limit 1;`;

let preloadingInProgress = false;

async function preLoadPullRequestsAndIssues(app)
{
    if (preloadingInProgress) {
        return;
    }

    preloadingInProgress = true;
    let client;
    let startNumber;
    try {
        client = await getDatabaseClient();
        
        const preloadTask = await getPreloadTask(app, client);
        if (!await isValidPreloadTask(app, preloadTask, client)) {
            // No active valid preloading.
            return;
        }

        const endNumber = preloadTask.param.end_num;
        const overwrite = preloadTask.param.overwrite;
        if (preloadTask.status == "open") {
            // New preloading task
            startNumber = preloadTask.param.start_num;
        }
        else if (preloadTask.status == "active") {
            // Get start_num from log
            startNumber = await getStartPrNumber(app, client);
            startNumber = startNumber < preloadTask.param.start_num ? preloadTask.param.start_num : startNumber;
        }
        else {
            return;
        }

        // preload 80 PRs per hour
        let retryCount = 3;
        for (let i = 0; i < 80; i++) {
            if (startNumber >= endNumber) {
                // Loading is done, update task
                await client.query(updateLastPreloadingTask,
                    ['complete', new Date(), preloadTask.id]);
                break;
            }
            if (!await loadPullRequestOrIssueByNumber(app, client, startNumber, overwrite)) {
                // Loading failed, retry the last one
                if (retryCount > 0) {
                    retryCount--;
                }
                else {
                    app.log.error(`Issue or Pr #${startNumber} cannot be read, skip it.`);
                    retryCount = 3;
                }
            }
            else {
                retryCount = 3;
            }
            // Sleep 3 seconds to avoid hitting rate limit
            await new Promise(r => setTimeout(r, 3000));
            startNumber++; 
        }

        // Log the next start number
        await client.query(updatePreloadLog, [new Date(), startNumber.toString()]);
        // update task
        if (preloadTask.status == "open") {
            await client.query(updateLastPreloadingTask,
                ['active', new Date(), preloadTask.id]);
        }
    } catch(err) {
        app.log.error(`ERROR: While processing issue # ${startNumber}. ` + err);
    }
    finally {
        if (client) {
            client.end();
        }
        preloadingInProgress = false;
    }
}

async function getStartPrNumber(app, client)
{
    try {
        const resStart = await client.query(selectLastPreload);
        if (resStart.rowCount === 0) {
            return 1;
        }

        let startNumber = parseInt(resStart.rows[0].message);

        return startNumber;
    } catch (err) {
        app.log.error(err);
    }

    return 1;
}

async function getPreloadTask(app, client) {
    let task;
    const resTask = await client.query(selectLastPreloadingTask);
    if (resTask.rowCount == 1) {
            task = resTask.rows[0];
    }

    return task;
}

async function loadPullRequestOrIssueByNumber(app, client, prNumber, overwrite) {
    const octokit = getOctokit();
    const repo = getRepo();

    if (!overwrite) {
        // TODO: Skip if issue or PR has been loaded.
    }

    let pullRequestOrIssue;
    try {
        pullRequestOrIssue = await octokit.rest.issues.get({
            owner: repo.owner,
            repo: repo.repo,
            issue_number: prNumber
        });

    } catch (err) {
        // No more PRs
        return false;
    }

    await new Promise(r => setTimeout(r, 1000));  // 1 second
    if (!pullRequestOrIssue.data.pull_request) {
        // Issue preloading
        if (!await preloadIssueSpecific(pullRequestOrIssue, prNumber, client, app, octokit, repo)) {
            return false;
        }
    }
    else {
        // Pull request preloading
        if (!await preLoadPullRequestSpecific(pullRequestOrIssue, prNumber, client, app, octokit, repo)) {
            return false;
        }
    }

    return preloadCommon(pullRequestOrIssue, prNumber, client, app, octokit, repo);
}

async function preLoadPullRequestSpecific(pullRequest, prNumber, client, app, octokit, repo)
{
    const prReviews = await octokit.rest.pulls.listReviews({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: prNumber
    });

    const title = pullRequest.data.title;
    const author = pullRequest.data.user.login;
    const body = pullRequest.data.body;
    const createdAt = pullRequest.data.created_at;
    const closedAt = pullRequest.data.closed_at;
    const mergedAt = pullRequest.data.pull_request.merged_at;
    let closedBy = null;
    if (pullRequest.data.closed_by) {
        closedBy = pullRequest.data.closed_by.login;
    }
    let status = pullRequest.data.state;
    if (pullRequest.data.merged || pullRequest.data.pull_request.merged_at) {
        status = "merged";
    }

    try {
        await client.query(insertIntoPullRequest,
            [prNumber, title, author, body, createdAt, closedAt, mergedAt, status, closedBy]);

        for (let i = 0; i < prReviews.data.length; i++) {
            const reviewId = prReviews.data[i].id;
            const submittedAt = prReviews.data[i].submitted_at;
            const reviewAuthor = prReviews.data[i].user.login;
            const state = prReviews.data[i].state.toLowerCase();
            await client.query(insertIntoPrReviews,
                [reviewId, prNumber, submittedAt, reviewAuthor, state]);

            // Review comments
            const reviewComments = await octokit.rest.pulls.listCommentsForReview({
                owner: repo.owner,
                repo: repo.repo,
                pull_number: prNumber,
                review_id: reviewId
            });

            for (let j = 0; j < reviewComments.data.length; j++) {
                const id = reviewComments.data[j].id;
                const createdAt = reviewComments.data[j].created_at;
                const updatedAt = reviewComments.data[j].updated_at;
                const sender = reviewComments.data[j].user.login;
                const body = reviewComments.data[j].body;
                await client.query(insertIntoReviewComments,
                    [reviewId, id, createdAt, updatedAt, sender, body]);
            }
        }

        // Reviewers
        const reviewers = await octokit.rest.pulls.listRequestedReviewers({
            owner: repo.owner,
            repo: repo.repo,
            pull_number: prNumber
        });
        for (let j = 0; j < reviewers.data.users.length; j++) {
            const reviewer = reviewers.data.users[j].login;
            await client.query(insertIntoAssignees,
                [prNumber, reviewer, "reviewer"]);
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
        return false;
    }

    return true;
}

async function preloadIssueSpecific(issue, issueNum, client, app, octokit, repo)
{
    const title = issue.data.title;
    const author = issue.data.user.login;
    const body = issue.data.body;
    const createdAt = issue.data.created_at;
    const updated_at = issue.data.updated_at;
    const closedAt = issue.data.closed_at;
    const status = issue.data.state;
    const closedBy = issue.data.closed_by.login;

    try {
        await client.query(insertIntoIssue,
            [issueNum, title, author, body, createdAt, closedAt, updated_at, false, status, closedBy]);
    } catch(err) {
        app.log.error(err);
        return false;
    }

    return true;
}

async function preloadCommon(issue, issueNum, client, app, octokit, repo)
 {
    const labels = issue.data.labels;
    const assignees = issue.data.assignees;
    try {
        for (let i = 0; i < labels.length; i++) {
            await client.query(insertIntoPrLabels,
            [issueNum, labels[i].name]);
        }

        for (let i = 0; i < assignees.length; i++) {
            app.log.info(insertIntoAssignees + assignees[i] + ". Number " + issueNum);
            await client.query(insertIntoAssignees,
                [issueNum, assignees[i].login, "assignee"]);
        }

        comments = await octokit.rest.issues.listComments({
            owner: repo.owner,
            repo: repo.repo,
            issue_number: issueNum
        })

        for (let i = 0; i < comments.data.length; i++) {
            const id = comments.data[i].id;
            const createdAt = comments.data[i].created_at;
            const updatedAt = comments.data[i].updated_at;
            const sender = comments.data[i].user.login;
            const body = comments.data[i].body;
            await client.query(insertIntoComments,
                [issueNum, id, createdAt, updatedAt, sender, body]);
        }

    } catch(err) {
        app.log.error(err);
        return false;
    }

    return true;
 }

async function isValidPreloadTask(app, preloadTask, client) {
    if (!preloadTask || preloadTask.status == "invalid") {
        return false;
    }

    let retVal = true;
    const start_num = preloadTask.param.start_num;
    const end_num = preloadTask.param.end_num;
    if (!start_num || !Number.isInteger(start_num) || !end_num || !Number.isInteger(end_num)) {
        app.log.error("Preloading start_num and end_num must be integers.");
        retVal = false;
    }

    if (start_num >= end_num || start_num < 1) {
        app.log.error("Preloading start_num and end_num must be positive integer and start_num < end_num.")
        retVal = false;
    }

    // Update task to invalid
    if (!retVal) {
        await client.query(updateLastPreloadingTask,
            ['invalid', new Date(), preloadTask.id]);
    }
    return retVal;
}

module.exports = {preLoadPullRequestsAndIssues}
