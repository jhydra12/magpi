# EU Region production-size load test

Sam Lindqvist
2026-09-21

The 17 September small run passed. We ran the production-size workload against the European region on 21 September using the same write and search mix planned for the first customer cohort.

At the expected peak, requests queued faster than the search workers drained them. The 95th-percentile search response reached 4.8 seconds against the 2-second release check. Writes stayed within the check. The run failed on search response time.

The saturation marker in the test archive is `CAP-7F3`. This failure puts EU Region at risk of not making Launch Week. We need a second run after increasing worker capacity and checking the query plan. The failed run does not establish a new launch date; Sam still owns the Thursday 29 October target.
