## What changed

For the SoC throttling bug (ENG-230), Ben Achilov prototyped a per-pane backlight control that dims panes without content changes, reducing temperature and avoiding throttling. The ramp and timeout were adjusted for usability, resulting in temperatures staying within limits and minimal user impact observed. For the Meniscus-C runbook, nothing significant changed except the routine addition of lot logs and ongoing inspection status.

## What was decided

The team decided to keep the 45-second timeout and the gradual backlight dimming approach for managing thermal issues in ENG-230, as it keeps both package and surface temperatures within agreed limits and is not easily noticed by users. For Meniscus-C, the inspection protocol remains as written, and they continue towards achieving four clean lots before reducing inspection frequency.

## What is unresolved

For ENG-230, the team still needs an answer from ticket ENG-233 about whether the current vapor chamber is sufficient for sustained load. For the Meniscus-C inspection process, they are only halfway to meeting the four-clean-lot criterion required to switch to sampling inspection.
