const config = require('config')
const util = require('node:util')
const { isKickOffTestComment } = require('../util/utils')
const { getLastWorkflowRunByPullRequest } = require('../workflow/workflows')
const { getCodeOwnersFileContent, listRecentCommitsByFile, listContributors, getCommitFiles } = require('../repo/repos')
const messages = require('../resources/messages.json');
const pr_labels = require('../resources/pr_labels.json');

function isPullRequest(issue)
{
  return (typeof(issue.pull_request) != "undefined");
}

async function rerunFailedTests(app, context)
{
    if (isPullRequest(context.payload.issue) && isKickOffTestComment(context.payload.comment.body)) {
        app.log.info("Kick off tests received.");
        const repo = await context.repo();
        //app.log.info(repo);
  
        const pullRequestNumber = context.payload.issue.number;
  
        const pullRequest = await context.octokit.pulls.get({
            owner: repo.owner,
            repo: repo.repo,
            pull_number: pullRequestNumber,
        });
  
        //app.log.info(pullRequest);
  
        const workflows = await context.octokit.actions.listRepoWorkflows(repo);
        let workflow;
        let lastWorkflowRun;
        for (let i = 0; i < workflows.data.workflows.length; i++) {
            workflow = workflows.data.workflows[i];

            // skip inactive and cleanup workflow
            if (workflow.state != 'active' || workflow.name == 'cleanup') {
                continue;
            }
            //app.log.info(workflow);
            lastWorkflowRun = await getLastWorkflowRunByPullRequest(context, repo, workflow, pullRequest);
  
            //app.log.info(lastWorkflowRun);
  
            if (typeof(lastWorkflowRun) != 'undefined' && lastWorkflowRun.status === "completed" &&
                    lastWorkflowRun.conclusion != "success") {
                try {
                    let retry = 5;
                    let response;
                    do {
                        response = await context.octokit.actions.reRunWorkflowFailedJobs({
                            owner: repo.owner,
                            repo: repo.repo,
                            run_id: lastWorkflowRun.id,
                        });
                        retry--;
                    } while (retry > 0 && response.status == 403);
                    if (response.status == 403) {
                        app.log.warn('Re-run workflow ' + workflow.name + ' failed, Please make sure the bot has workflow write permission.');
                    }
                    else {
                        app.log.info('Started failed jobs of workflow run ' + workflow.name + '.');
                    }
                }
                catch (err) {
                    app.log.info(err);
                }
            }
        }
    }
}

async function assignReviewersToPullRequest(context)
{
    const payload = context.payload;
    const excludedReviewers = config.get('excluded-reviewers');
    const exclusionSet = new Set(excludedReviewers);
    if (payload.action === 'opened') {
        const changedFiles = await getPullRequestChangedFiles(context);
        if (changedFiles.data.length == 0) {
            return;
        }
        const pullRequestAuthors = await getPullRequestAuthors(context);    // Authors of the pull request should be excluded from reviewers
        const codeOwnersFile = await getCodeOwnersFileContent(context);
        const relatedProducts = await getpullRequestRelatedProducts(changedFiles);
        const allExclusions = new Set([...exclusionSet, ...pullRequestAuthors]);
        const owners = await getReviewersByCodeOwners(context, codeOwnersFile, relatedProducts, allExclusions);
        const authors = await getReviewersByCommitHistory(context, changedFiles, allExclusions);
        const reviewers = new Set([...owners, ...authors]);

        await requestReviewers(context, Array.from(reviewers));
    }
}

async function getPullRequestAuthors(context)
{
    const commits = await listCommitsByPullRequest(context);

    const authors = new Set();
    for (let i = 0; i < commits.data.length; i++) {
        let author = commits.data[i].author.login;
        authors.add(author);
    }

    return authors;
}

async function listCommitsByPullRequest(context)
{
    const repo = await context.repo();
    const commits = await context.octokit.pulls.listCommits({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: context.payload.number,
    });

    return commits;
}

async function getPullRequestChangedFiles(pullRequestContext)
{
    const repo = await pullRequestContext.repo();
    const pullRequestNumber = pullRequestContext.payload.number;
    return pullRequestContext.octokit.pulls.listFiles({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: pullRequestNumber,
    });
}

async function getpullRequestRelatedProducts(changedFiles)
{
    const productRegx = /^(?<product>[a-z\-]+)\/[a-z].*$/;
    const productSet = new Set();
    for (let i = 0; i < changedFiles.data.length; i++) {
        let filenamme = changedFiles.data[i].filename;
        let productMatch = filenamme.match(productRegx);
        if (productMatch != null && typeof(productMatch.groups.product) != 'undefined') {
            productSet.add(productMatch.groups.product)
        }
    }

    return productSet;
}

async function getReviewersByCodeOwners(context, codeOwnersFile, relatedProducts, reviewerExclusions)
{
    const productCodeOwnerRegx = /^\/(?<product>[a-z\-]+)\s+(?<owners>@.*)$/;
    const codeOwnerRegx = /@(?<owner>[^@\s]+)/g;
    const productCodeOwners = codeOwnersFile.split('\n');

    const owners = new Set();
    // Skip the title line
    for (let i = 1; i < productCodeOwners.length; i++) {
        let productOwnersMatch = productCodeOwners[i].match(productCodeOwnerRegx);
        if (productOwnersMatch == null) {
            continue;
        }

        let product;
        if (typeof(productOwnersMatch.groups.product) != 'undefined' && typeof(productOwnersMatch.groups.owners) != 'undefined') {
            product = productOwnersMatch.groups.product;
            if (relatedProducts.has(product))
            {
                let ownersString = productOwnersMatch.groups.owners;
                let ownersGroups = ownersString.matchAll(codeOwnerRegx);
                for (let owner of ownersGroups) {
                    if (!reviewerExclusions.has(owner)) {
                        owners.add(owner.groups.owner);
                    }
                }

            }
        }
    }

    return owners;
}

async function getReviewersByCommitHistory(context, changedFiles, reviewerExclusions)
{
    let authors = new Set();
    for (let i = 0; i < changedFiles.data.length; i++) {
        let filename = changedFiles.data[i].filename;
        let commits = await listRecentCommitsByFile(context, filename);

        for (let i = 0; i < commits.data.length; i++) {
            let author = commits.data[i].author.login;
            if (!reviewerExclusions.has(author)) {
                authors.add(author);
            }
        }
    }

    return authors;
}

async function requestReviewers(pullRequestContext, reviewers)
{
    if (reviewers.length == 0) {
        return;
    }
    const repo = await pullRequestContext.repo();

    // Retry in case Secondary Rate Limits happens (https://docs.github.com/en/rest/overview/resources-in-the-rest-api#secondary-rate-limits)
    let retry = 3;
    let response;
    do {
        // Sleep 2 seconds
        await new Promise(r => setTimeout(r, 2000));

        response = await pullRequestContext.octokit.pulls.requestReviewers({
                owner: repo.owner,
                repo: repo.repo,
                pull_number: pullRequestContext.payload.number,
                reviewers: reviewers,
        });
        retry--;
    } while (retry > 0 && response.status == 403);
}

async function welcomeNewContributors(context)
{
    const allConritbutors = await listContributors(context);
    if (allConritbutors.size == 0) {
        return;
    }
    const pullRequestAuthors = await getPullRequestAuthors(context);
    let newContributors = [];
    pullRequestAuthors.forEach((value, key, set) => {
        if (!allConritbutors.has(value)) {
            newContributors.push(value);
        }
    });

    if (newContributors.length > 0) {
        const repo = await context.repo();
        const pullRequestNumber = context.payload.number;
        let welcomeMessage = util.format(messages['welcome-new-contributors'], newContributors.toString());
        await context.octokit.issues.createComment({
            owner: repo.owner,
            repo: repo.repo,
            issue_number: pullRequestNumber,
            body: welcomeMessage,
        });
    }
}

async function validateCommits(context) {
    const commits = await listCommitsByPullRequest(context);
    const maxNumberOfFilesInACommit = config.get('max-number-of-files-per-commit');
    let pullRequestCommitsGuidelineMessage = '';
    let commitNumberOfFilesLimitMessage = '';
    for (let i = 0; i < commits.data.length; i++) {
        const commitFiles = await getCommitFiles(context, commits.data[i]);
        if (commitFiles.length > maxNumberOfFilesInACommit) {
            commitNumberOfFilesLimitMessage += util.format(messages['commit-number-changed-files-exceeds'], commits.data[i].sha, commitFiles.length);
        }
        const message = commits.data[i].commit.message;
        const guidelineMessage = await processMessage(message);
        if (!(typeof(guidelineMessage) === 'undefined')) {
            pullRequestCommitsGuidelineMessage = `Some problems found in commit(${commits.data[i].sha}) message. Please\n` +
                guidelineMessage;
        }
    }

    if (commitNumberOfFilesLimitMessage != '') {
        pullRequestCommitsGuidelineMessage += commitNumberOfFilesLimitMessage + '\n';
    }

    if (pullRequestCommitsGuidelineMessage != '') {
        const repo = await context.repo();
        await context.octokit.issues.createComment({
            owner: repo.owner,
            repo: repo.repo,
            issue_number: context.payload.number,
            body: pullRequestCommitsGuidelineMessage,
        });
    }
}

async function processMessage(message)
{
    if (typeof(message) === 'undefined') {
        return;
    }

    let guidelineMessage;
    const messageLines = message.split("\n");
    const title = messageLines[0].trim();
    // 1. Separate subject from body with a blank line
    if (messageLines.length > 1 && messageLines[1] !== '') {
        guidelineMessage = messages["separate-subject-from-body"];
    }

    // 2. Limit the subject line to 50 characters
    if (title.length > 50) {
        guidelineMessage += messages["limit-subject-line"];
    }

    // 3. Capitalize the subject line
    if (!(title.charAt(0) === title.charAt(0).toUpperCase())) {
        guidelineMessage += messages["capitalize-subject-line"];
    }

    // 4. Do not end the subject line with a period
    if (title.charAt(title.length - 1) === '.') {
        guidelineMessage += messages["subject-no-period"];
    }

    // 5. Use the imperative mood in the subject line

    // 6. Wrap the body at 72 characters
    for (let i = 1; i < messageLines.length; i++) {
        if (messageLines[i].length > 72) {
            guidelineMessage += messages["wrap-commit-message"];
            break;
        }
    }

    // 7. Use the body to explain what and why vs. how

    return guidelineMessage;
}


async function tagPullRequest(context) {
    const changedFiles = await getPullRequestChangedFiles(context);
    if (changedFiles.data.length == 0) {
        return;
    }

    const labels = new Set();
    for (let i = 0; i < changedFiles.data.length; i++) {
        let filename = changedFiles.data[i].filename;
        for (let j = 0; j < pr_labels.length; j++) {
            if (filename.includes(pr_labels[j].path)) {
                pr_labels[j].labels.forEach((label) => labels.add(label))
            }
        }
    }

    if (labels.size == 0) {
        return;
    }

    const repo = await context.repo();
    labels.forEach(async (labelName, value, set) => {
        let response = await context.octokit.issues.getLabel({
            owner: repo.owner,
            repo: repo.repo,
            name: labelName,
        }).catch(async () => {
            // Create a label if not found
            await context.octokit.issues.createLabel({
                owner: repo.owner,
                repo: repo.repo,
                name: labelName,
            }).catch(async (err) => {
                // If already created, ignore the error
                if (err.status != 422) {
                    throw err;
                }
            });
        });
    });

    await context.octokit.issues.addLabels({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: context.payload.number,
        labels: Array.from(labels),
    });
}
module.exports = { isPullRequest, rerunFailedTests, assignReviewersToPullRequest, welcomeNewContributors, validateCommits, tagPullRequest }
