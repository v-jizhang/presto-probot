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
    RETURN prMergeTimeIntervals[i];
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
    RETURN prMergeTimeIntervals[i];
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
    RETURN prFirstReviewTimeIntervals[i];
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
    RETURN prFirstReviewTimeIntervals[i];
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
    RETURN avergeApprovalTimeIntervals[i];
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

    --RAISE INFO 'DEBUG: avergeApprovalTimeIntervals: %s', avergeApprovalTimeIntervals;

    SELECT array_length(avergeApprovalTimeIntervals, 1) INTO numOfPrApprovals;
    i := 1 + numOfPrApprovals * p / 100;  -- 1 based
    RETURN avergeApprovalTimeIntervals[i];
END;
$$;

CREATE OR REPLACE FUNCTION average_response_time()
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    averageResponseTime interval;
    responseTImes interval[];
    rec record;
    curPrId bigint := 0;
    curResponseTime TIMESTAMPTZ;
    count int := 1;
BEGIN
    FOR rec IN
    (
        SELECT id AS pull_request_id, created_at AS response_time FROM pull_requests

        UNION ALL
        SELECT pull_request_id, submitted_at FROM pr_reviews

        UNION ALL
        SELECT pull_request_id, updated_at FROM pr_review_requests

        ORDER BY pull_request_id, response_time
    )
    LOOP
        --RAISE INFO 'DEBUG: %, %', rec.pull_request_id, rec.response_time;
        IF (rec.pull_request_id <> curPrId)
        THEN
            curPrId := rec.pull_request_id;
            curResponseTime := rec.response_time;
        ELSE
            responseTImes[count] = rec.response_time - curResponseTime;
            count := count + 1;
            curResponseTime := rec.response_time;
        END IF;
    END LOOP;

    --RAISE INFO 'DEBUG: %, responseTImes: %', array_length(responseTImes, 1), responseTImes;
    SELECT AVG(unnest) INTO averageResponseTime
    FROM unnest(responseTImes);

    RETURN averageResponseTime;
END;
$$;

CREATE OR REPLACE FUNCTION average_response_percentile_time(p int)
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    responseTImes interval[];
    rec record;
    curPrId bigint := 0;
    curResponseTime TIMESTAMPTZ;
    count int := 1;
    numOfResponseTimes int;
    i int;
BEGIN
    FOR rec IN
    (
        SELECT id AS pull_request_id, created_at AS response_time FROM pull_requests

        UNION ALL
        SELECT pull_request_id, submitted_at FROM pr_reviews

        UNION ALL
        SELECT pull_request_id, updated_at FROM pr_review_requests

        ORDER BY pull_request_id, response_time
    )
    LOOP
        --RAISE INFO 'DEBUG: %, %', rec.pull_request_id, rec.response_time;
        IF (rec.pull_request_id <> curPrId)
        THEN
            curPrId := rec.pull_request_id;
            curResponseTime := rec.response_time;
        ELSE
            responseTImes[count] = rec.response_time - curResponseTime;
            count := count + 1;
            curResponseTime := rec.response_time;
        END IF;
    END LOOP;

    --RAISE INFO 'DEBUG: %, responseTImes: %', array_length(responseTImes, 1), responseTImes;
    SELECT ARRAY(SELECT unnest(responseTImes) ORDER BY 1) into responseTImes;

    --RAISE INFO 'DEBUG: %, responseTImes: %', array_length(responseTImes, 1), responseTImes;
    SELECT array_length(responseTImes, 1) INTO numOfResponseTimes;
    i := 1 + numOfResponseTimes * p / 100;  -- 1 based
    RETURN responseTImes[i];
END;
$$;

CREATE OR REPLACE FUNCTION average_response_time_by_label(labelName VARCHAR(30))
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    averageResponseTime interval;
    responseTImes interval[];
    rec record;
    curPrId bigint := 0;
    curResponseTime TIMESTAMPTZ;
    count int := 1;
BEGIN
    FOR rec IN
    (
        SELECT pr.id AS pull_request_id, pr.created_at AS response_time FROM pull_requests pr
        JOIN pr_labels lb ON pr.id = lb.pull_request_id
        WHERE lb.label = labelName

        UNION
        SELECT r.pull_request_id, r.submitted_at FROM pr_reviews r
        JOIN pr_labels lb ON r.pull_request_id = lb.pull_request_id
        WHERE lb.label = labelName

        UNION
        SELECT r.pull_request_id, r.updated_at FROM pr_review_requests r
        JOIN pr_labels lb ON r.pull_request_id = lb.pull_request_id
        WHERE lb.label = labelName

        ORDER BY pull_request_id, response_time
    )
    LOOP
        --RAISE INFO 'DEBUG: %, %', rec.pull_request_id, rec.response_time;
        IF (rec.pull_request_id <> curPrId)
        THEN
            curPrId := rec.pull_request_id;
            curResponseTime := rec.response_time;
        ELSE
            responseTImes[count] = rec.response_time - curResponseTime;
            count := count + 1;
            curResponseTime := rec.response_time;
        END IF;
    END LOOP;

    --RAISE INFO '%, responseTImes: %', array_length(responseTImes, 1), responseTImes;
    SELECT AVG(unnest) INTO averageResponseTime
    FROM unnest(responseTImes);

    RETURN averageResponseTime;
END;
$$;

CREATE OR REPLACE FUNCTION average_response_percentile_time_by_label(p int, labelName VARCHAR(30))
    RETURNS interval
    LANGUAGE plpgsql
    AS
$$
DECLARE
    responseTImes interval[];
    rec record;
    curPrId bigint := 0;
    curResponseTime TIMESTAMPTZ;
    count int := 1;
    numOfResponseTimes int;
    i int;
BEGIN
    FOR rec IN
    (
        SELECT pr.id AS pull_request_id, pr.created_at AS response_time FROM pull_requests pr
        JOIN pr_labels lb ON pr.id = lb.pull_request_id
        WHERE lb.label = labelName

        UNION ALL
        SELECT r.pull_request_id, r.submitted_at FROM pr_reviews r
        JOIN pr_labels lb ON r.pull_request_id = lb.pull_request_id
        WHERE lb.label = labelName

        UNION ALL
        SELECT r.pull_request_id, r.updated_at FROM pr_review_requests r
        JOIN pr_labels lb ON r.pull_request_id = lb.pull_request_id
        WHERE lb.label = labelName

        ORDER BY pull_request_id, response_time
    )
    LOOP
        --RAISE INFO 'DEBUG: %, %', rec.pull_request_id, rec.response_time;
        IF (rec.pull_request_id <> curPrId)
        THEN
            curPrId := rec.pull_request_id;
            curResponseTime := rec.response_time;
        ELSE
            responseTImes[count] = rec.response_time - curResponseTime;
            count := count + 1;
            curResponseTime := rec.response_time;
        END IF;
    END LOOP;

    --RAISE INFO 'DEBUG: %, responseTImes: %', array_length(responseTImes, 1), responseTImes;
    SELECT ARRAY(SELECT unnest(responseTImes) ORDER BY 1) into responseTImes;

    --RAISE INFO 'DEBUG: %, responseTImes: %', array_length(responseTImes, 1), responseTImes;
    SELECT array_length(responseTImes, 1) INTO numOfResponseTimes;
    i := 1 + numOfResponseTimes * p / 100;  -- 1 based
    RETURN responseTImes[i];
END;
$$;

DO $$
<<metric_functions>>
DECLARE
BEGIN
    RAISE INFO 'Connect to Postgresql server:';
    RAISE INFO 'psql -U <user> -d <database> -h <host>';
    RAISE INFO 'Within psql, load the functions:';
    RAISE INFO '\i <path>/metrics.sql';
    RAISE INFO 'And run the following plpgsql functions:';
    RAISE INFO 'Example:';
    RAISE INFO 'SELECT pr_first_review_percentile_time_by_label(50, ''bug'');';
    RAISE INFO '***********************************************************************';
    RAISE INFO 'average_merge_time()';
    RAISE INFO 'average_merge_time_by_label(labelName VARCHAR(30))';
    RAISE INFO 'pr_merge_percentile_time(p int)';
    RAISE INFO 'pr_merge_percentile_time_by_label(p int, labelName varchar(30))';
    RAISE INFO 'average_first_review_time()';
    RAISE INFO 'average_first_review_time_by_label(labelName varchar(30))';
    RAISE INFO 'pr_first_review_percentile_time(p int)';
    RAISE INFO 'pr_first_review_percentile_time_by_label(p int, labelName varchar(30))';
    RAISE INFO 'average_approval_time()';
    RAISE INFO 'average_approval_time_by_label(labelName varchar(30))';
    RAISE INFO 'average_approval_percentile_time(p int)';
    RAISE INFO 'average_approval_percentile_time_by_label(p int, labelName varchar(30))';
    RAISE INFO 'average_response_time()';
    RAISE INFO 'average_response_percentile_time(p int)';
    RAISE INFO 'average_response_time_by_label(labelName VARCHAR(30))';
    RAISE INFO 'average_response_percentile_time_by_label(p int, labelName VARCHAR(30))';
    RAISE INFO '************************************************************************';
END;
$$
