## What changed

The team progressed several initiatives. For HW-110, the two-piece, overlapping, sprung cover for hinge 2 was finalized to address splash resistance in the half-fold state, resolving previous ingress issues. For ORI-44, a new detection method for the desk stand was designed and tested, now requiring four conditions (hinge angles, hall sensor with polarity, accelerometer reading, and lack of rear touch) to shift to desk state, significantly reducing false positives. An improved exit condition for leaving desk state was also added. For ORI-50, a screen reader gesture and a new reading order were implemented—with work underway to bring in external users for validation. The runbook for shell crashes on development units was last updated, clarifying some steps and common causes.

## What was decided

For HW-110, the team agreed to keep the two-piece hinge cover despite the minor gritty feeling at the end of hinge travel, prioritizing splash resistance as it is more noticeable to users and reviewers than the grit. For ORI-44, the requirement to use magnet polarity and additional sensors as a combined gate for detection was accepted, as was the need for a careful magnet assembly (with explicit notes in engineering drawings). Exit from desk state now waits for both magnet dismissal and a secondary confirmation, to avoid abrupt state transitions. For ORI-50, they decided to hold off on closing the work until two external, daily screen reader users could try the system, acknowledging that internal review was insufficient.

## What is unresolved

For HW-110, assembly of the new hinge 2 cover remains a manual step on the pilot line, with potential process concerns flagged by Dana but not yet discussed. For ORI-44, while entry and exit conditions for desk state detection have been defined and implemented, there is a dependency on the vendor correctly assembling the stand magnet—incorrect orientation would silently break detection, with no mitigation in place. For ORI-50, feedback from actual screen reader users is pending, so final validation of the new navigation scheme is not complete.
