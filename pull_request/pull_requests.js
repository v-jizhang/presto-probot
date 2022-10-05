const base64 = require('js-base64').Base64;

const { isKickOffTestComment } = require('../util/utils')
const { getLastWorkflowRunByPullRequest } = require('../workflow/workflows')
const { getCodeOwnersFileContent } = require('../repo/repos')

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
    if (payload.action === 'opened') {
        const changedFiles = await getPullRequestChangedFiles(context);
        const codeOwnersFileBase64 = await getCodeOwnersFileContent(context);
        const codeOwnersFile = base64.decode(codeOwnersFileBase64.data.content);
        const relatedProducts = await getpullRequestRelatedProducts(changedFiles);
        requestReviewers(context, codeOwnersFile, relatedProducts);
    }
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

async function requestReviewers(context, codeOwnersFile, relatedProducts)
{
    const productCodeOwnerRegx = /^\/(?<product>[a-z\-]+)\s+(?<owners>@.*)$/;
    const codeOwnerRegx = /@(?<owner>[^@\s]+)/g;
    const productCodeOwners = codeOwnersFile.split('\n');
    const repo = await context.repo();

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
                    owners[j++] = owner.groups.owner;
                }

                // Retry in case Secondary Rate Limits happens (https://docs.github.com/en/rest/overview/resources-in-the-rest-api#secondary-rate-limits)
                let retry = 3;
                let response;
                do {
                    // Sleep 2 seconds
                    await new Promise(r => setTimeout(r, 2000));

                    response = await context.octokit.pulls.requestReviewers({
                            owner: repo.owner,
                            repo: repo.repo,
                            pull_number: context.payload.number,
                            reviewers: owners,
                    });
                    retry--;
                } while (retry > 0 && response.status == 403);
            }
        }
    }
}

module.exports = { isPullRequest, rerunFailedTests, assignReviewersToPullRequest }
