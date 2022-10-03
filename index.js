/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
module.exports = (app) => {
  // Your code here
  app.log.info("Yay, the app was loaded!");

  app.on("issues.opened", async (context) => {
    const issueComment = context.issue({
      body: "Thanks for opening this issue!",
    });
    return context.octokit.issues.createComment(issueComment);
  });

  app.on("push", async(context) => {
    app.log.info(context);
  });

  app.on("pull_request", async(context) => {
    app.log.info("A pull request has been created");
  });

  app.on(
      //"commit_comment.created",
      //"pull_request_review_comment.created",
      //"pull_request_review_comment.edited",
      //"discussion_comment.created",
      "issue_comment.created",
      async(context) => {
    if(isPullRequest(context) && isKickOffTestComment(context)) {
      app.log.info("Kick off failed tests");
      const repo = await context.repo();
      app.log.info(repo);

      const pullRequestNumber = context.payload.issue.number;
      //const lastCommit = await context.octokit.pulls.listCommits({
      //  owner: repo.owner,
      //  repo: repo.repo,
      //  pull_number: pullRequestNumber,
      //  per_page: 1,
      //});

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
        app.log.info(workflow);
        lastWorkflowRun = await getLastWorkflowRunByPullRequest(context, repo, workflow, pullRequest);

        //lastWorkflowRun = await context.octokit.actions.listWorkflowRuns({
        //  owner: repo.owner,
        //  repo: repo.repo,
        //  workflow_id: workflow.id,
        //  per_page: 20,
        //});
        app.log.info(lastWorkflowRun);

        if (lastWorkflowRun.status === "completed" &&
            lastWorkflowRun.conclusion != "success") {
              context.octokit.actions.reRunWorkflowFailedJobs({
                owner: repo.owner,
                repo: repo.repo,
                run_id: lastWorkflowRun.id,
              });
            }
      }
    }
  })
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/

  function isKickOffTestComment(context)
  {
    const kickoffTestPattern = /@bot[   ]+kick[   ]*off[  ]+test[s]?/i;
    const comment = context.payload.comment.body;
    app.log.info(comment);
    return kickoffTestPattern.test(comment);
  }

  function isPullRequest(context)
  {
    return (typeof(context.payload.issue.pull_request) != "undefined");
  }

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

      for (let i = 0; i < workflowRuns.data.workflow_runs.length; i++) {
        workflowRun = workflowRuns.data.workflow_runs[i];
        app.log.info(workflowRun);
        if (pullRequest.data.head.sha === workflowRun.head_sha) {
          found = true;
          break;
        }
      }
    }

    return workflowRun;
  }
};
