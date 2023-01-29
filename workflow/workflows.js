async function getLastWorkflowRunByPullRequest(context, repo, workflow, pullRequest)
  {
    let pageNumber = 0;
    let found = false;
    let workflowRuns;
    let workflowRun;
    while (!found)
    {
      workflowRuns = await context.octokit.actions.listWorkflowRuns({
        owner: repo.owner,
        repo: repo.repo,
        workflow_id: workflow.id,
        per_page: 20,
        page: pageNumber++,
      });

      if (workflowRuns.data.workflow_runs.length == 0) {
        // No more runs
        return;
      }
      for (let i = 0; i < workflowRuns.data.workflow_runs.length; i++) {
        workflowRun = workflowRuns.data.workflow_runs[i];

        if (workflowRun.event == 'schedule') {
          // A run is triggered by 'schedule' means the workflow is a cron workflow, skip it
          return;
        }

        if (pullRequest.data.head.sha === workflowRun.head_sha) {
          found = true;
          break;
        }
      }
    }

    return workflowRun;
  }

  module.exports = { getLastWorkflowRunByPullRequest }
