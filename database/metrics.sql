-- Connect to Postgresql on Heroku:
-- psql -U <user> -d <database> -h <host>
--
-- Run/load sql script within psql:
-- \i <absolite path to script file>
-- \ir <relative path to script file>
-- SELECT pr_merge_percentile_time(50);
CREATE OR REPLACE FUNCTION average_merge_time()
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    avergeMergeTime interval;
BEGIN
    SELECT avg(merged_at - created_at) INTO avergeMergeTime
    FROM pull_requests
    WHERE status = 'merged';

    RETURN avergeMergeTime;
END;
$$;

CREATE OR REPLACE FUNCTION average_merge_time_by_label(labelName varchar(30))
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    avergeMergeTime interval;
BEGIN
    SELECT avg(merged_at - created_at) INTO avergeMergeTime
    FROM pull_requests pr
    JOIN pr_labels lb ON pr.id = lb.pull_request_id
    WHERE pr.status = 'merged' and lb.label = labelName;

    RETURN avergeMergeTime;
END;
$$;

CREATE OR REPLACE FUNCTION pr_merge_percentile_time(p int)
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    prMergeTimeIntervals interval[];
    numOfPRs int;
    i int;
BEGIN
    SELECT ARRAY_AGG(merged_at - created_at ORDER BY merged_at - created_at) INTO prMergeTimeIntervals
    FROM pull_requests
    WHERE status = 'merged';

    -- RAISE INFO 'DEBUG: prMergeTimeIntervals: %s', prMergeTimeIntervals;

    SELECT array_length(prMergeTimeIntervals, 1) INTO numOfPRs;
    i := 1 + numOfPRs * p / 100;  -- 1 based
    return prMergeTimeIntervals[i];
END;
$$;

CREATE OR REPLACE FUNCTION pr_merge_percentile_time_by_label(p int, labelName varchar(30))
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    prMergeTimeIntervals interval[];
    numOfPRs int;
    i int;
BEGIN
    SELECT ARRAY_AGG(pr.merged_at - pr.created_at ORDER BY pr.merged_at - pr.created_at) INTO prMergeTimeIntervals
    FROM pull_requests pr
    JOIN pr_labels lb ON pr.id = lb.pull_request_id
    WHERE pr.status = 'merged' and lb.label = labelName;

    -- RAISE INFO 'DEBUG: prMergeTimeIntervals: %s', prMergeTimeIntervals;

    SELECT array_length(prMergeTimeIntervals, 1) INTO numOfPRs;
    i := 1 + numOfPRs * p / 100;  -- 1 based
    return prMergeTimeIntervals[i];
END;
$$;

CREATE OR REPLACE FUNCTION average_first_review_time()
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    avergeReviewTime interval;
BEGIN
    SELECT avg(first_review.first_review_time - pr.created_at) INTO avergeReviewTime
    FROM
    (SELECT pull_request_id, min(submitted_at) AS first_review_time
        FROM pr_reviews GROUP BY pull_request_id) AS first_review
    JOIN pull_requests pr ON pr.id = first_review.pull_request_id;

    -- RAISE INFO 'DEBUG: avergeReviewTime: %s', avergeReviewTime;

    RETURN avergeReviewTime;
END;
$$;

CREATE OR REPLACE FUNCTION average_first_review_time_by_label(labelName varchar(30))
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    avergeReviewTime interval;
BEGIN
    SELECT avg(first_review.first_review_time - pr.created_at) INTO avergeReviewTime
    FROM
    (SELECT pull_request_id, min(submitted_at) AS first_review_time
        FROM pr_reviews GROUP BY pull_request_id) AS first_review
    JOIN pull_requests pr ON pr.id = first_review.pull_request_id
    JOIN pr_labels lb ON pr.id = lb.pull_request_id
    where lb.label = labelName;

    -- RAISE INFO 'DEBUG: avergeReviewTime: %s', avergeReviewTime;

    RETURN avergeReviewTime;
END;
$$;

CREATE OR REPLACE FUNCTION pr_first_review_percentile_time(p int)
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    prFirstReviewTimeIntervals interval[];
    numOfPrReviewed int;
    i int;
BEGIN
    SELECT ARRAY_AGG(first_review.first_review_time - pr.created_at ORDER BY first_review.first_review_time - pr.created_at)
    INTO prFirstReviewTimeIntervals
    FROM
    (SELECT pull_request_id, min(submitted_at) AS first_review_time
        FROM pr_reviews GROUP BY pull_request_id) AS first_review
    JOIN pull_requests pr ON pr.id = first_review.pull_request_id;

    SELECT array_length(prFirstReviewTimeIntervals, 1) INTO numOfPrReviewed;
    i := 1 + numOfPrReviewed * p / 100;  -- 1 based
    return prFirstReviewTimeIntervals[i];
END;
$$;

CREATE OR REPLACE FUNCTION pr_first_review_percentile_time_by_label(p int, labelName varchar(30))
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    prFirstReviewTimeIntervals interval[];
    numOfPrReviewed int;
    i int;
BEGIN
    SELECT ARRAY_AGG(first_review.first_review_time - pr.created_at ORDER BY first_review.first_review_time - pr.created_at)
    INTO prFirstReviewTimeIntervals
    FROM
    (SELECT pull_request_id, min(submitted_at) AS first_review_time
        FROM pr_reviews GROUP BY pull_request_id) AS first_review
    JOIN pull_requests pr ON pr.id = first_review.pull_request_id
    JOIN pr_labels lb ON pr.id = lb.pull_request_id
    where lb.label = labelName;

    SELECT array_length(prFirstReviewTimeIntervals, 1) INTO numOfPrReviewed;
    i := 1 + numOfPrReviewed * p / 100;  -- 1 based
    return prFirstReviewTimeIntervals[i];
END;
$$;

CREATE OR REPLACE FUNCTION average_approval_time()
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    avergeApprovalTime interval;
BEGIN
    SELECT avg(first_approval.first_approval_time - pr.created_at) INTO avergeApprovalTime
    FROM
    (SELECT pull_request_id, min(submitted_at) AS first_approval_time
        FROM pr_reviews
        WHERE pr_reviews.state = 'approved'
        GROUP BY pull_request_id) AS first_approval
    JOIN pull_requests pr ON pr.id = first_approval.pull_request_id;

    -- RAISE INFO 'DEBUG: avergeApprovalTime: %s', avergeApprovalTime;

    RETURN avergeApprovalTime;
END;
$$;

CREATE OR REPLACE FUNCTION average_approval_time_by_label(labelName varchar(30))
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    avergeApprovalTime interval;
BEGIN
    SELECT avg(first_approval.first_approval_time - pr.created_at) INTO avergeApprovalTime
    FROM
    (SELECT pull_request_id, min(submitted_at) AS first_approval_time
        FROM pr_reviews
        WHERE pr_reviews.state = 'approved'
        GROUP BY pull_request_id) AS first_approval
    JOIN pull_requests pr ON pr.id = first_approval.pull_request_id
    JOIN pr_labels lb ON pr.id = lb.pull_request_id
    WHERE lb.label = labelName;

    -- RAISE INFO 'DEBUG: avergeApprovalTime: %s', avergeApprovalTime;

    RETURN avergeApprovalTime;
END;
$$;

CREATE OR REPLACE FUNCTION average_approval_percentile_time(p int)
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    avergeApprovalTimeIntervals interval[];
    numOfPrApprovals int;
    i int;
BEGIN
    SELECT ARRAY_AGG(first_approval.first_approval_time - pr.created_at ORDER BY first_approval.first_approval_time - pr.created_at)
    INTO avergeApprovalTimeIntervals
    FROM
    (SELECT pull_request_id, min(submitted_at) AS first_approval_time
        FROM pr_reviews
        WHERE pr_reviews.state = 'approved'
        GROUP BY pull_request_id) AS first_approval
    JOIN pull_requests pr ON pr.id = first_approval.pull_request_id;

    --RAISE INFO 'DEBUG: avergeApprovalTimeIntervals: %s', avergeApprovalTimeIntervals;

    SELECT array_length(avergeApprovalTimeIntervals, 1) INTO numOfPrApprovals;
    i := 1 + numOfPrApprovals * p / 100;  -- 1 based
    return avergeApprovalTimeIntervals[i];
END;
$$;

CREATE OR REPLACE FUNCTION average_approval_percentile_time_by_label(p int, labelName varchar(30))
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    avergeApprovalTimeIntervals interval[];
    numOfPrApprovals int;
    i int;
BEGIN
    SELECT ARRAY_AGG(first_approval.first_approval_time - pr.created_at ORDER BY first_approval.first_approval_time - pr.created_at)
    INTO avergeApprovalTimeIntervals
    FROM
    (SELECT pull_request_id, min(submitted_at) AS first_approval_time
        FROM pr_reviews
        WHERE pr_reviews.state = 'approved'
        GROUP BY pull_request_id) AS first_approval
    JOIN pull_requests pr ON pr.id = first_approval.pull_request_id
    JOIN pr_labels lb ON pr.id = lb.pull_request_id
    WHERE lb.label = labelName;

    RAISE INFO 'DEBUG: avergeApprovalTimeIntervals: %s', avergeApprovalTimeIntervals;

    SELECT array_length(avergeApprovalTimeIntervals, 1) INTO numOfPrApprovals;
    i := 1 + numOfPrApprovals * p / 100;  -- 1 based
    return avergeApprovalTimeIntervals[i];
END;
$$;

DO $$
<<pull_request_merge_time>>
DECLARE
    avergeMergeTime interval;
    p50 interval;
    p90 interval;
BEGIN
    SELECT average_merge_time() INTO avergeMergeTime;
    RAISE INFO 'Average pull request merge time: %', avergeMergeTime;

    SELECT pr_merge_percentile_time(50) INTO p50;
    SELECT pr_merge_percentile_time(90) INTO p90;
    RAISE INFO  'P50: %, P90: %', p50, p90;
END; $$

