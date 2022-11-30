const { getDatabaseClient } = require('../database/postgresql')
const insertIntoPullRequest = `INSERT INTO "pull_requests" 
  ("id", "title", "created_at", "closed_at", "merged_at", "status")
  VALUES($1, $2, $3, $4, $5, $6)
  ON CONFLICT (id) DO UPDATE SET
    id=EXCLUDED.id,
    title=EXCLUDED.title,
    created_at=EXCLUDED.created_at,
    closed_at=EXCLUDED.closed_at,
    merged_at=EXCLUDED.merged_at,
    status=EXCLUDED.status;`;

async function pullRequestClosed(context, app) {
  const client = await getDatabaseClient();
  const pullRequestNumber = context.payload.pull_request.number;
  const title = context.payload.pull_request.title;
  const created_at = context.payload.pull_request.created_at;
  const closed_at = context.payload.pull_request.closed_at;
  const merged_at = context.payload.pull_request.merged_at;
  let status = 'merged';
  if (!context.payload.pull_request.merged) {
    status = 'closed';
  }
  
  client.query(insertIntoPullRequest,
    [pullRequestNumber, title, created_at, closed_at, merged_at, status], async (err, res) => {
    if (err) {
      app.log.error(`Insert into pull_requests failed:
          ${err.message}. 
          ${insertIntoPullRequest}`);
    }
    client.end();
  });
}

module.exports = { pullRequestClosed, insertIntoPullRequest }