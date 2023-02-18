const config = require('config')
const { rerunFailedTests, assignReviewersToPullRequest, welcomeNewContributors, validateCommits, tagPullRequest } = require('./pull_request/pull_requests')
const { pullRequestReceived } = require('./statistics/pull_request_event_received')
const { creatTablesIfNotExist } = require('./database/create_tables')
const { pullRequestReviewSubmitted } = require('./statistics/pull_request_reviews')
const { pullrequestLabeled, pullrequestUnlabeled } = require('./statistics/pull_request_labels')
const { pullRequestReviewRequested } = require('./statistics/pull_request_reviewer_requests')
const { setContext } = require('./util/utils')
const { pingPullRequestReviewers } = require('./pull_request/ping_reviewers')
const { pingPullRequestAuthor } = require('./pull_request/ping_authors')
const { preLoadPullRequestsAndIssues } = require('./statistics/pre_load')

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */

module.exports = (app) => {
  // Create tables if not exist
  creatTablesIfNotExist();

  app.on("issues.opened", async (context) => {
    const issueComment = context.issue({
      body: "Thanks for opening this issue!",
    });
    return context.octokit.issues.createComment(issueComment);
  });
  
  /*
  app.on("push", async(context) => {
    app.log.info(context);
  });
  

  app.on("pull_request.synchronize", async(context) => {
    app.log.info(context);
  });
  */

  app.on("pull_request.opened", async(context) => {
    await setContext(context);
    await welcomeNewContributors(context);
    await validateCommits(context);
    await assignReviewersToPullRequest(context);
    await tagPullRequest(context);
    await pullRequestReceived(context, app);
  });

  app.on(
      //["commit_comment.created",
      //"pull_request_review_comment.created",
      //"pull_request_review_comment.edited",
      //"discussion_comment.created",]
    "issue_comment.created",
    async(context) => {
      await setContext(context);
      await rerunFailedTests(app, context);
  });

  app.on("pull_request.closed", async(context) => {
    await setContext(context);
    pullRequestReceived(context, app);
  });

  app.on("pull_request_review.submitted", async(context) => {
    await setContext(context);
    pullRequestReviewSubmitted(context, app);
  });

  app.on("pull_request.labeled", async(context) => {
    await setContext(context);
    pullrequestLabeled(context, app);
  });

  app.on("pull_request.unlabeled", async(context) => {
    await setContext(context);
    pullrequestUnlabeled(context, app);
  });

  app.on("pull_request.review_requested", async(context) => {
    await setContext(context);
    pullRequestReviewRequested(context, app);
  });

  setInterval(() => {
    pingPullRequestReviewers(app);
    pingPullRequestAuthor(app);
    preLoadPullRequestsAndIssues(app);
  }, config.get('ping-stale-interval'));

  app.log.info("Presto-bot is up and running!");
};
