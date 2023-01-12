const { getDatabaseClient } = require('../database/postgresql')
const insertIntoPullRequest = `INSERT INTO "pull_requests" 
  ("id", "title", "author", "created_at", "closed_at", "merged_at", "status")
  VALUES($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (id) DO UPDATE SET
    id=EXCLUDED.id,
    title=EXCLUDED.title,
    author=EXCLUDED.author,
    created_at=EXCLUDED.created_at,
    closed_at=EXCLUDED.closed_at,
    merged_at=EXCLUDED.merged_at,
    status=EXCLUDED.status;`;

const selectPullRequestBynumber = `SELECT * FROM pull_requests WHERE id = $1`;

async function pullRequestReceived(context, app) {
  const client = await getDatabaseClient();
  const pullRequestNumber = context.payload.pull_request.number;
  const title = context.payload.pull_request.title;
  const author = context.payload.pull_request.user.login;
  const createdAt = context.payload.pull_request.created_at;
  const closedAt = context.payload.pull_request.closed_at;
  const mergedAt = context.payload.pull_request.merged_at;
  let status = context.payload.pull_request.state;
  if (context.payload.pull_request.merged) {
    status = "merged";
  }
  
  client.query(insertIntoPullRequest,
    [pullRequestNumber, title, author, createdAt, closedAt, mergedAt, status], async (err, res) => {
    if (err) {
      app.log.error(`Insert into pull_requests failed:
          ${err.message}. 
          ${insertIntoPullRequest}`);
    }
    client.end();
  });
}

module.exports = { pullRequestReceived, insertIntoPullRequest, selectPullRequestBynumber }