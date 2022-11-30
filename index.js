const { rerunFailedTests, assignReviewersToPullRequest, welcomeNewContributors, validateCommits, tagPullRequest } = require('./pull_request/pull_requests')
const { pullRequestClosed } = require('./statistics/pull_request_closed')
const { creatTablesIfNotExist } = require('./database/create_tables')
const { pullRequestReviewSubmitted } = require('./statistics/pull_request_reviews')
const { pullrequestLabeled } = require('./statistics/pull_request_labels')

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */

module.exports = (app) => {
  // Create tables if not exist
  creatTablesIfNotExist();

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
  

  app.on("pull_request.synchronize", async(context) => {
    app.log.info(context);
  });
  */

  app.on("pull_request.opened", async(context) => {
    await welcomeNewContributors(context);
    await validateCommits(context);
    await assignReviewersToPullRequest(context);
    await tagPullRequest(context);
  });

  app.on(
      //["commit_comment.created",
      //"pull_request_review_comment.created",
      //"pull_request_review_comment.edited",
      //"discussion_comment.created",]
    "issue_comment.created",
    async(context) => {
      await rerunFailedTests(app, context);
  });

  app.on("pull_request.closed", async(context) => {
    pullRequestClosed(context, app);
  });

  app.on("pull_request_review.submitted", async(context) => {
    pullRequestReviewSubmitted(context, app);
  });

  app.on("pull_request.labeled", async(context) => {
    pullrequestLabeled(context, app);
  });

  app.log.info("Presto-bot is up and running!");
};
