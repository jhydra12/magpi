## What changed

- Haze measurements were updated through 200k cycles, with new results and photos added; further testing on B12 is ongoing.
- FCC pre-scan testing identified and addressed an emissions problem with a design update; retesting confirmed the fix and lab booking is in progress.
- A hinge torque binning plan was drafted, with developments on logging and sample pricing from the spring vendor in progress.
- Progress on qualifying a second Meniscus-C polymer source continued, with the first candidate samples due to arrive soon.
- Performance improvements for fold state transitions reduced frame drops; a memory leak issue was identified and fixed in a related ticket.
- The app continuity contract was expanded with clarification on process lifetime guarantees and provisions for memory pressure signaling.

## What was decided

- Grounding the graphite at both ends is required to pass FCC pre-scan; this change will be added to drawings and pilot builds.
- Hinge torque measurement and logging will proceed for all pilot units; a price quote for tighter spring tolerances is being sought before finalizing the sorting plan.
- The commitment to never kill third party app processes during folding transitions will be maintained, even at a memory cost, and a memory pressure signal will be provided for app developers.
- Buffer stock for Meniscus-C polymer will become a formal commercial term.

## What is unresolved

- Final haze numbers for B12 are still pending.
- Official FCC lab results are not yet available; ticket remains open until certified results come back.
- Price details for tighter hinge spring tolerances are still awaited before a binning vs. manufacturing decision can be made.
- Qualification of a second Meniscus-C polymer source is ongoing, not expected before 2027, and the issue of anti-fingerprint coating compatibility remains.
- Confirmation that the memory leak fix for fold transitions is robust awaits extended fidget testing.
- Details on implementation and developer response to the new memory pressure signal for app continuity remain to be seen.
