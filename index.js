const { rerunFailedTests, assignReviewersToPullRequest, welcomeNewContributors, validateCommits } = require('./pull_request/pull_requests')

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */

module.exports = (app) => {
  /*
  app.on("issues.opened", async (context) => {
    const issueComment = context.issue({
      body: "Thanks for opening this issue!",
    });
    return context.octokit.issues.createComment(issueComment);
  });
  

  app.on("push", async(context) => {
    app.log.info(context);
  });
  */

  /*
  app.on("pull_request.synchronize", async(context) => {
    app.log.info(context);
  });

  app.on("pull_request.opened", async(context) => {
    await welcomeNewContributors(context);
    await validateCommits(context);
    await assignReviewersToPullRequest(context);
  });
*/
  app.on(
      //["commit_comment.created",
      //"pull_request_review_comment.created",
      //"pull_request_review_comment.edited",
      //"discussion_comment.created",]
      "issue_comment.created",
      async(context) => {
        await rerunFailedTests(app, context);
  });

  app.log.info("Presto-bot is up and running!");
};
