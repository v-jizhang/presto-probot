const config = require('config')
const { isKickOffTestComment } = require('../util/utils')
const { getLastWorkflowRunByPullRequest } = require('../workflow/workflows')
const { getCodeOwnersFileContent, listRecentCommitsByFile, listContributors } = require('../repo/repos')

function isPullRequest(issue)
{
  return (typeof(issue.pull_request) != "undefined");
}

async function rerunFailedTests(app, context)
{
    if (isPullRequest(context.payload.issue) && isKickOffTestComment(context.payload.comment.body)) {
        app.log.info("Kick off failed tests");
        const repo = await context.repo();
        //app.log.info(repo);
  
        const pullRequestNumber = context.payload.issue.number;
  
        const pullRequest = await context.octokit.pulls.get({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: pullRequestNumber,
    });
  
    app.log.info(pullRequest);
  
    const workflows = await context.octokit.actions.listRepoWorkflows(repo);
    let workflow;
    let lastWorkflowRun;
    for (let i = 0; i < workflows.data.total_count; i++) {
        workflow = workflows.data.workflows[i];
        //app.log.info(workflow);
        lastWorkflowRun = await getLastWorkflowRunByPullRequest(context, repo, workflow, pullRequest);
  
        //app.log.info(lastWorkflowRun);
  
        if (lastWorkflowRun.status === "completed" &&
            lastWorkflowRun.conclusion != "success") {
                context.octokit.actions.reRunWorkflowFailedJobs({
                    owner: repo.owner,
                    repo: repo.repo,
                    run_id: lastWorkflowRun.id,
                });
            }
        }
        app.log.info('Started failed jobs of workflow run ' + workflow.name + '.');
    }
}

async function assignReviewersToPullRequest(context)
{
    const payload = context.payload;
    const excludedReviewers = config.get('excluded-reviewers');
    const exclusionSet = new Set(excludedReviewers);
    if (payload.action === 'opened') {
        const changedFiles = await getPullRequestChangedFiles(context);
        const pullRequestAuthors = await getPullRequestAuthors(context);    // Authors of the pull request should be excluded from reviewers
        const codeOwnersFile = await getCodeOwnersFileContent(context);
        const relatedProducts = await getpullRequestRelatedProducts(changedFiles);
        const allExclusions = new Set([...exclusionSet, ...pullRequestAuthors]);
        requestReviewersByCodeOwners(context, codeOwnersFile, relatedProducts, allExclusions);
        requestReviewersByCommitHistory(context, changedFiles, allExclusions);
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
        if (typeof(productMatch.groups.product) != 'undefined') {
            productSet.add(productMatch.groups.product)
        }
    }

    return productSet;
}

async function requestReviewersByCodeOwners(context, codeOwnersFile, relatedProducts, reviewerExclusions)
{
    const productCodeOwnerRegx = /^\/(?<product>[a-z\-]+)\s+(?<owners>@.*)$/;
    const codeOwnerRegx = /@(?<owner>[^@\s]+)/g;
    const productCodeOwners = codeOwnersFile.split('\n');

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
                let owners = [];
                let j = 0;
                for (let owner of ownersGroups) {
                    if (!reviewerExclusions.has(owner)) {
                        owners[j++] = owner.groups.owner;
                    }
                }

                requestReviewers(context, owners);
            }
        }
    }
}

async function requestReviewersByCommitHistory(context, changedFiles, reviewerExclusions)
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

    requestReviewers(context, Array.from(authors));
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
        let welcomeMessage = 'Hello ' + newContributors.toString() + '! Welcome to Presto project!\n'
                + 'Thank you and congrats for opening your first pull request. We will get back to you as soon as we can.\n'
                + 'Please use [Contributing to Presto](https://github.com/prestodb/presto/blob/master/CONTRIBUTING.md) as your guidelines\n'
                + "Thank you!";
        context.octokit.issues.createComment({
            owner: repo.owner,
            repo: repo.repo,
            issue_number: pullRequestNumber,
            body: welcomeMessage,
        });
    }
}

async function scanCommitMessages(context) {
    const commits = await listCommitsByPullRequest(context);
    let pullRequestCommitsGuidelineMessage = '';
    for (let i = 0; i < commits.data.length; i++) {
        const message = commits.data[i].commit.message;
        const guidelineMessage = await processMessage(message);
        if (!(typeof(guidelineMessage) === 'undefined')) {
            pullRequestCommitsGuidelineMessage = `Some problems found in commit(${commits.data[i].sha}) message. Please\n` +
                guidelineMessage;
        }
    }

    if (pullRequestCommitsGuidelineMessage != '') {
        const repo = await context.repo();
        context.octokit.issues.createComment({
            owner: repo.owner,
            repo: repo.repo,
            issue_number: context.payload.number,
            body: pullRequestCommitsGuidelineMessage,
        });
    }
}

async function processMessage(message)
{
    let guidelineMessage;
    const messageLines = message.split("\n");
    const title = messageLines[0].trim();
    // 1. Separate subject from body with a blank line
    if (messageLines.length > 1 && messageLines[1] !== '') {
        guidelineMessage = "separate subject from body with a blank line.\n";
    }

    // 2. Limit the subject line to 50 characters
    if (title.length > 50) {
        guidelineMessage += "limit the subject line to 50 characters.\n";
    }

    // 3. Capitalize the subject line
    if (!(title.charAt(0) === title.charAt(0).toUpperCase())) {
        guidelineMessage += "capitalize the subject line.\n";
    }

    // 4. Do not end the subject line with a period
    if (title.charAt(title.length - 1) === '.') {
        guidelineMessage += "do not end the subject line with a period.\n"
    }

    // 5. Use the imperative mood in the subject line

    // 6. Wrap the body at 72 characters
    for (let i = 1; i < messageLines.length; i++) {
        if (messageLines[i].length > 72) {
            guidelineMessage += "wrap the body at 72 characters";
            break;
        }
    }

    // 7. Use the body to explain what and why vs. how

    return guidelineMessage;
}

module.exports = { isPullRequest, rerunFailedTests, assignReviewersToPullRequest, welcomeNewContributors, scanCommitMessages }
