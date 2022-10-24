const nock = require("nock");
const util = require('node:util')
// Requiring our app implementation
const myProbotApp = require("..");
const { Probot, ProbotOctokit } = require("probot");
// Requiring our fixtures
const payloadIssueOpened = require("./fixtures/issues.opened");
const payloadPullRequestOpened = require("./fixtures/pull_request.opened.json");
const payloadPullRequestCommentCreated = require('./fixtures/pull_request_comment_created.json')
const contributors = require("./fixtures/contributors.json");
const issueCreatedBody = { body: "Thanks for opening this issue!" };
const test_messages = require("./fixtures/test_messages.json")
const test_commit_files = require('./fixtures/commit_files.json')
const fs = require("fs");
const path = require("path");
const messages = require('../resources/messages.json');
const base64 = require('js-base64').Base64

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

  /*
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
  */

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
      .get("/repos/hiimbex/testing-things/commits/")
      .reply(200, {
        files:[]
      })
      .get("/repos/hiimbex/testing-things/pulls/11/files")
      .reply(200, [])
      .post("/repos/hiimbex/testing-things/issues/11/comments", (body) => {
        expect(body.body).toMatch(util.format(messages["welcome-new-contributors"], "jinlinzh"));
        return true;
      })
      .reply(201);

    await probot.receive({ name: "pull_request", payload: payloadPullRequestOpened });

    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  test("Test commit message validation", async () => {
    const mock = nock("https://api.github.com")
      .get("/repos/hiimbex/testing-things/contributors?per_page=100&page=0")
      .reply(200, [])
      .get("/repos/hiimbex/testing-things/pulls/11/commits")
      .reply(200, [
        {
          sha: "10fa8d568f51f63bc1143cb4383d9a3ca7f920a2",
          commit: {
            message: "fix a test failure.\nFixed test failure in AppTest Test case testAddition. This commit is also a test for presto-bot commit\nmessage guidelines.\n"
          }
        }
      ])
      .get("/repos/hiimbex/testing-things/commits/10fa8d568f51f63bc1143cb4383d9a3ca7f920a2")
      .reply(200, {
        files: test_commit_files
      })
      .get("/repos/hiimbex/testing-things/pulls/11/files")
      .reply(200, [])
      .post("/repos/hiimbex/testing-things/issues/11/comments", (body) => {
        expect(body.body).toMatch(test_messages.commit_message_expected);
        return true;
      })
      .reply(201);

    await probot.receive({ name: "pull_request", payload: payloadPullRequestOpened });

    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  test("Test assigning reviewers to a pull request", async () => {
    const mock = nock("https://api.github.com")
      .persist()
      .filteringPath(/path=[^&]*&since=.*$/g, 'path=filename&since=2021')
      .get("/repos/hiimbex/testing-things/commits?path=filename&since=2021")
      .reply(200, [
        {
          author: {
              login: "jinlinzh"
          },
          commit: {}
        }
      ])
      .get("/repos/hiimbex/testing-things/commits/")
      .reply(200, {
        files:[]
      })
      .get("/repos/hiimbex/testing-things/contributors?per_page=100&page=0")
      .reply(200, [])
      .get("/repos/hiimbex/testing-things/pulls/11/files")
      .reply(200, [
        {
          filename: "presto/src/hive.java"
        },
        {
          filename: "presto-hudi/hudi.java"
        }
      ])
      .get("/repos/hiimbex/testing-things/pulls/11/commits")
      .reply(200, [
        {
          author: {
              login: "jinlinzh"
          },
          commit: {}
        }
      ])
      .get("/repos/hiimbex/testing-things/contents/%2FCODEOWNERS")
      .reply(200, {
        content: base64.encode("/** @presto-test/committers\n/presto-hudi @vinothchandar @7c00\n/presto-native-execution @prestodb/team-velox\n/presto @v-jizhang")})
      .post("/repos/hiimbex/testing-things/pulls/11/requested_reviewers", (body) => {
        expect(body.reviewers).toMatchObject(['vinothchandar', '7c00', 'v-jizhang']);
        return true;
      })
      .reply(200);
      

    await probot.receive({ name: "pull_request", payload: payloadPullRequestOpened });

    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  test(" Test re-run of failed jobs", async () => {
    const mock = nock("https://api.github.com")
      .get("/repos/hiimbex/testing-things/pulls/6")
      .reply(200, {
        head: {
          sha: "a8db4bc6dea9c2db5194ea6a69c47e649326f5fd"
        },
        number: 6
      })
      .get("/repos/hiimbex/testing-things/actions/workflows")
      .reply(200, {
        total_count: 1,
        workflows: [
          {
            id: 100,
            name: "Test-Workflow"
          }
        ]
      })
      .get("/repos/hiimbex/testing-things/actions/workflows/100/runs?per_page=20&page=0")
      .reply(200, {
        total_count: 1,
        workflow_runs: [
          {
            id: 101,
            head_sha: "a8db4bc6dea9c2db5194ea6a69c47e649326f5fd",
            status: "completed",
            conclusion: "failed"
          }
        ]
      })
      .post("/repos/hiimbex/testing-things/actions/runs/101/rerun-failed-jobs", (body) => {
        // This POST dose not have a body, the workflow_id is included in the URL.
        expect(body).toBe('');
        return true;
      })
      .reply(200);

      await probot.receive({ name: "issue_comment", payload: payloadPullRequestCommentCreated });

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
