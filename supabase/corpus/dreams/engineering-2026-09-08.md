## What changed

- The thermal management on the Fold S1 saw two firmware improvements: per-panel backlight dimming based on usage and a charging power taper to limit skin temperature during charging in hot environments. Both changes were included in firmware 0.7.8, which moved key test cases from failing or marginal to passing. The hardware for hinge 2 was changed to a 17-7 PH spring, which holds torque better over cycling, addressing the detent torque drift issue. For app continuity, character offset scroll anchoring was added to the platform text view so most apps now retain scroll position when moving between pane configurations; two house apps were also fixed to support this.

## What was decided

- The team decided to keep the charge taper for charging in the closed state at higher ambient temperatures, prioritizing comfort over charge speed. The 17-7 PH spring will remain in hinge 2, as it preserves the required feel and torque stability, with further testing ongoing. Character offset anchoring in Ori solves the most visible continuity bug for the majority of apps; the remaining edge cases (like browsers on the desk layout) do not block current progress. No plans to update the outdated thermal budget spreadsheet; instead, it should be deleted to avoid confusion.

## What is unresolved

- The margin for thermal skin temperature certification at 30°C ambient is slim—confirmation is pending from Dana that the certification lab will not exceed this temperature. Final long-term durability testing of the new hinge 2 spring is waiting on additional rig time post-pilot line trip. The root cause of browser scroll position loss vertically on the desk layout is not yet solved. Several items for carrier certification remain pending: the battery safety report from the cell vendor, VoLTE/VoNR test results, building certification units from pilot line material, and the signed declaration of conformity. The firmware release checklist lacks the changelog entry for plain language summaries and the transition to production release process is still undefined.
