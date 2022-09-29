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

  app.on("commit_comment.created", async(context) => {
    app.log.info("commit_comment.created");
    if(isKickOffTestComment(context)) {
      app.log.info("Kick off failed tests");
      const repo = await context.repo();
      app.log.info(repo);
      //const latestRuns = await context.octokit.actions.listWorkflowRunsForRepo({
      //  owner: repo.owner,
      //  repo: repo.repo,
      //  per_page: 1,
      //});
      //app.log.info(latestRuns);

      const workflows = await context.octokit.actions.listRepoWorkflows(repo);
      //app.log.info(workflows);
      let workflow;
      let lastWorkflowRun;
      for (let i = 0; i < workflows.data.total_count; i++) {
        workflow = workflows.data.workflows[i];
        app.log.info(workflow);
        lastWorkflowRun = await context.octokit.actions.listWorkflowRuns({
          owner: repo.owner,
          repo: repo.repo,
          workflow_id: workflow.id,
          per_page: 1,
        });
        app.log.info(lastWorkflowRun);

        if (lastWorkflowRun.data.workflow_runs[0].status === "completed" &&
            lastWorkflowRun.data.workflow_runs[0].conclusion != "success") {
              context.octokit.actions.reRunWorkflowFailedJobs({
                owner: repo.owner,
                repo: repo.repo,
                run_id: lastWorkflowRun.data.workflow_runs[0].id,
              });
            }
      }
    }
  })
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/

  function isKickOffTestComment(context) {
    const kickoffTestPattern = /@bot[   ]+kick[   ]*off[  ]+test[s]?/i;
    const comment = context.payload.comment.body;
    app.log.info(comment);
    return kickoffTestPattern.test(comment);
  }
};
