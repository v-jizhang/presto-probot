const insertIntoIssue = `INSERT INTO "pull_requests" 
  ("id", "title", "author", "body", "created_at", "closed_at", "updated_at", "is_pull_request", "status", "closed_by")
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (id) DO UPDATE SET
    id=EXCLUDED.id,
    title=EXCLUDED.title,
    author=EXCLUDED.author,
    body=EXCLUDED.body,
    created_at=EXCLUDED.created_at,
    closed_at=EXCLUDED.closed_at,
    updated_at=EXCLUDED.updated_at,
    is_pull_request=EXCLUDED.is_pull_request,
    status=EXCLUDED.status,
    closed_by=EXCLUDED.closed_by;`;
const insertIntoComments = `INSERT INTO "comments"
    ("github_number", "id", "created_at", "updated_at", "sender", "body")
    VALUES($1, $2, $3, $4, $5, $6)
    ON CONFLICT (github_number, id)
    DO UPDATE
    SET updated_at=EXCLUDED.updated_at,
    sender=EXCLUDED.sender,
    body=EXCLUDED.body;
    `;

module.exports = { insertIntoIssue, insertIntoComments }
