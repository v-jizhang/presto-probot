const { isKickOffTestComment } = require('../util/utils')
const { getLastWorkflowRunByPullRequest } = require('../workflow/workflows')

function isPullRequest(issue)
{
  return (typeof(issue.pull_request) != "undefined");
}

async function startFailedTests(app, context)
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

module.exports = { isPullRequest, startFailedTests }
