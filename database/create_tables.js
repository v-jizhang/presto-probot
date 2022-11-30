const { getDatabaseClient } = require('./postgresql')

async function creatTablesIfNotExist()
{
    const client = await getDatabaseClient();
    let createPullRequestTableQuery = `CREATE TABLE IF NOT EXISTS pull_requests(
        id INT PRIMARY KEY NOT NULL,   -- This is the github pull request number
        title VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        closed_at TIMESTAMPTZ,
        merged_at TIMESTAMPTZ,
        status VARCHAR(10)             -- “open”, “closed”, “merged”
    );`;
    let createPullRequestReviewTableQuery = `CREATE TABLE IF NOT EXISTS pr_reviews(
        id BIGINT PRIMARY KEY NOT NULL,   -- This is the review id
        pull_request_id INT NOT NULL,  -- foreign key to pull_request
        submitted_at TIMESTAMPTZ NOT NULL,
        author VARCHAR(50) NOT NULL,
        state VARCHAR(20),             -- “APPROVED”, “CHANGES_REQUESTED”, “COMMENTED”, “DISMISSED”
        CONSTRAINT fk_review_pull_request FOREIGN KEY(pull_request_id) REFERENCES pull_requests(id)
    );`;
    let createPullRequestLabelTableQuery = `CREATE TABLE IF NOT EXISTS pr_labels(
        id BIGINT PRIMARY KEY NOT NULL,   -- This is the label id
        pull_request_id INT NOT NULL,  -- foreign key to pull_request
        label VARCHAR(30),
        CONSTRAINT fk_label_pull FOREIGN KEY(pull_request_id) REFERENCES pull_requests(id)
    );`;

    await client.query(createPullRequestTableQuery);
    await client.query(createPullRequestReviewTableQuery);
    await client.query(createPullRequestLabelTableQuery);
    await client.end();
}

module.exports = {creatTablesIfNotExist}
