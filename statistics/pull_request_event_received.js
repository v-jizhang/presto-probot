const { getDatabaseClient } = require('../database/postgresql')
const insertIntoPullRequest = `INSERT INTO "pull_requests" 
  ("id", "title", "author", "body", "created_at", "closed_at", "merged_at", "status", "closed_by")
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (id) DO UPDATE SET
    id=EXCLUDED.id,
    title=EXCLUDED.title,
    author=EXCLUDED.author,
    body=EXCLUDED.body,
    created_at=EXCLUDED.created_at,
    closed_at=EXCLUDED.closed_at,
    merged_at=EXCLUDED.merged_at,
    status=EXCLUDED.status,
    closed_by=EXCLUDED.closed_by;`;

const selectPullRequestBynumber = `SELECT * FROM pull_requests WHERE id = $1`;

async function pullRequestReceived(context, app) {
  const client = await getDatabaseClient();
  const pullRequestNumber = context.payload.pull_request.number;
  const title = context.payload.pull_request.title;
  const author = context.payload.pull_request.user.login;
  const body = context.payload.pull_request.body;
  const createdAt = context.payload.pull_request.created_at;
  const closedAt = context.payload.pull_request.closed_at;
  const mergedAt = context.payload.pull_request.merged_at;
  let closedBy = null;
  if (context.payload.action == 'closed') {
    closedBy = context.payload.sender.login;
  }
  let status = context.payload.pull_request.state.toLowerCase();
  if (context.payload.pull_request.merged) {
    status = "merged";
  }
  
  client.query(insertIntoPullRequest,
    [pullRequestNumber, title, author, body, createdAt, closedAt, mergedAt, status, closedBy], async (err, res) => {
    if (err) {
      app.log.error(`Insert into pull_requests failed:
          ${err.message}. 
          ${insertIntoPullRequest}`);
    }
    client.end();
  });
}

module.exports = { pullRequestReceived, insertIntoPullRequest, selectPullRequestBynumber }