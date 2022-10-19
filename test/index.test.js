const nock = require("nock");
const util = require('node:util')
// Requiring our app implementation
const myProbotApp = require("..");
const { Probot, ProbotOctokit } = require("probot");
// Requiring our fixtures
const payloadIssueOpened = require("./fixtures/issues.opened");
const payloadPullRequestOpened = require("./fixtures/pull_request.opened.json");
const contributors = require("./fixtures/contributors.json");
const issueCreatedBody = { body: "Thanks for opening this issue!" };
const test_messages = require("./fixtures/test_messages.json")
const fs = require("fs");
const path = require("path");
const messages = require('../resources/messages.json');

const privateKey = fs.readFileSync(
  path.join(__dirname, "fixtures/mock-cert.pem"),
  "utf-8"
);

describe("Presto Probot app", () => {
  let probot;

  beforeEach(() => {
    nock.disableNetConnect();
    probot = new Probot({
      appId: 123,
      githubToken: "test",
      //privateKey,
      // disable request throttling and retries for testing
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false },
      }),
    });
    // Load our app into probot
    probot.load(myProbotApp);
  });

  jest.setTimeout(3600000);
  test("Create a comment when an issue is opened", async () => {
    const mock = nock("https://api.github.com")
      // Test that we correctly return a test token
      //.post("/app/installations/2/access_tokens")
      //.reply(200, {
      //  token: "test",
      //  permissions: {
      //    issues: "write",
      //  },
      //})

      // Test that a comment is posted
      .post("/repos/hiimbex/testing-things/issues/1/comments", (body) => {
        expect(body).toMatchObject(issueCreatedBody);
        return true;
      })
      .reply(201);

    // Receive a webhook event
    await probot.receive({ name: "issues", payload: payloadIssueOpened });

    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  test("Test welcome new contributors when a pull request is opened", async () => {
    const mock = nock("https://api.github.com")
      // Test that we correctly return a test token
      //.post("/app/installations/3/access_tokens")
      //.reply(200, {
      //  token: "test-pull-request",
      //  permissions: {
      //    contributors: "read",
      //    pulls: "write",
      //  },
      //})
      // Test that the welcome message is posted
      .persist()
      .get("/repos/hiimbex/testing-things/contributors?per_page=100&page=0")
      .reply(200, contributors)
      .get("/repos/hiimbex/testing-things/contributors?per_page=100&page=1")
      .reply(200, [])
      .get("/repos/hiimbex/testing-things/pulls/11/commits")
      .reply(200, [
        {
          author: {
              login: "jinlinzh"
          },
          commit: {}
        }
      ])
      .get("/repos/hiimbex/testing-things/pulls/11/files")
      .reply(200, [])
      .post("/repos/hiimbex/testing-things/issues/11/comments", (body) => {
        expect(body.body).toBe(util.format(messages["welcome-new-contributors"], "jinlinzh"));
        return true;
      })
      .reply(201);

    await probot.receive({ name: "pull_request", payload: payloadPullRequestOpened });

    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  test("Test commit message validation", async () => {
    const mock = nock("https://api.github.com")
      .persist()
      .get("/repos/hiimbex/testing-things/contributors?per_page=100&page=0")
      .reply(200, [])
      .get("/repos/hiimbex/testing-things/pulls/11/commits")
      .reply(200, [
        {
          commit: {
            message: "fix a test failure.\nFixed test failure in AppTest Test case testAddition. This commit is also a test for presto-bot commit\nmessage guidelines.\n"
          }
        }
      ])
      .get("/repos/hiimbex/testing-things/pulls/11/files")
      .reply(200, [])
      .post("/repos/hiimbex/testing-things/issues/11/comments", (body) => {
        expect(body.body).toBe(test_messages.commit_message_expected);
        return true;
      })
      .reply(201);

    await probot.receive({ name: "pull_request", payload: payloadPullRequestOpened });

    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });
});

// For more information about testing with Jest see:
// https://facebook.github.io/jest/

// For more information about testing with Nock see:
// https://github.com/nock/nock
