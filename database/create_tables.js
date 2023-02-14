const { getDatabaseClient } = require('./postgresql')

async function creatTablesIfNotExist()
{
    const client = await getDatabaseClient();
    let createPullRequestTableQuery = `CREATE TABLE IF NOT EXISTS pull_requests(
        id INT PRIMARY KEY NOT NULL,   -- This is the github pull request number
        title VARCHAR(100) NOT NULL,
        author VARCHAR(50),
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
        pinged_author_at TIMESTAMPTZ,    -- when “CHANGES_REQUESTED” is stale, ping the author
        CONSTRAINT fk_review_pull_request FOREIGN KEY(pull_request_id)
            REFERENCES pull_requests(id)
    );`;
    let createPullRequestLabelTableQuery = `CREATE TABLE IF NOT EXISTS pr_labels(
        id SERIAL PRIMARY KEY NOT NULL,   -- This is the label id
        pull_request_id INT NOT NULL,  -- foreign key to pull_request
        label VARCHAR(30),
        UNIQUE (pull_request_id, label),
        CONSTRAINT fk_label_pull_request FOREIGN KEY(pull_request_id)
            REFERENCES pull_requests(id)
    );`;
    let createRequestReviewers = `CREATE TABLE IF NOT EXISTS pr_review_requests(
        id SERIAL PRIMARY KEY NOT NULL,
        pull_request_id INT NOT NULL,  -- foreign key to pr_reviews
        review_id BIGINT,              -- id of pre_views table
        updated_at TIMESTAMPTZ NOT NULL, -- pull request updated time
        requested_reviewer varchar(50),
        request_sender varchar(50),
        pinged_reviewer_at TIMESTAMPTZ,  -- when request is stale, ping the reviwer
        CONSTRAINT pr_review_requests_unique UNIQUE (pull_request_id, updated_at, requested_reviewer, request_sender),
        CONSTRAINT fk_review_requests_pull_request FOREIGN KEY(pull_request_id)
	        REFERENCES pull_requests(id)
    );`;
    let createRequestReviewersIndex = `CREATE INDEX IF NOT EXISTS idx_requests_pr_id ON pr_review_requests(pull_request_id);`;
    let createLogs = `CREATE TABLE IF NOT EXISTS logs(
        id SERIAL PRIMARY KEY NOT NULL,
        event VARCHAR(20) NOT NULL,
        event_time TIMESTAMPTZ NOT NULL,
        message VARCHAR(100)
    );`;
    let createLogsIndex = `CREATE INDEX IF NOT EXISTS idx_logs_event ON logs(event);`;

    await client.query(createPullRequestTableQuery);
    await client.query(createPullRequestReviewTableQuery);
    await client.query(createPullRequestLabelTableQuery);
    await client.query(createRequestReviewers);
    await client.query(createRequestReviewersIndex);
    await client.query(createLogs);
    await client.query(createLogsIndex);
    await client.end();
}

module.exports = {creatTablesIfNotExist}
