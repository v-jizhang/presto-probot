-- Connect to Postgresql on Heroku:
-- psql -U <user> -d <database> -h <host>
--
-- Run/load sql script within psql:
-- \i <absolite path to script file>
-- \ir <relative path to script file>
-- SELECT percentile_time(50);
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

CREATE OR REPLACE FUNCTION percentile_time(p int)
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

DO $$
<<pull_request_merge_time>>
DECLARE
    avergeMergeTime interval;
    p50 interval;
    p90 interval;
BEGIN
    SELECT average_merge_time() INTO avergeMergeTime;
    RAISE INFO 'Average pull request merge time: %', avergeMergeTime;

    SELECT percentile_time(50) INTO p50;
    SELECT percentile_time(90) INTO p90;
    RAISE INFO  'P50: %, P90: %', p50, p90;
END; $$

