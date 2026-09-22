# Supaphone

Everything in this corpus is fiction. Supaphone is a fictional customer communications software company. The people, products, dates, decisions, and documents were written for the Digital Brain demo. The company sells software that brings customer messages, calls, and account work into one workspace.

The org slug remains `supaphone`. Demo accounts use `example.com` addresses and the documented demo password.

## People and spaces

| Person | Email | Work |
| --- | --- | --- |
| Jane Okonkwo | jane@example.com | CEO and Launch Week sponsor |
| Sam Lindqvist | sam@example.com | Infrastructure and reliability |
| Ben Achilov | ben@example.com | Product engineering |
| Maya Restrepo | maya@example.com | Marketing |
| Priya Raghunathan | priya@example.com | Product marketing |
| John Mbeki | john@example.com | Finance |
| Dana Provenzano | dana@example.com | Operations and partners |

| Space | Members |
| --- | --- |
| Company | Everyone |
| Engineering | Jane, Sam, Ben, John |
| Marketing | Jane, Maya, Priya, Ben |
| Finance | Jane, John, Dana |

The seed still creates additional team and personal spaces for the access demo. This Launch Week source corpus uses only the four shared spaces above. Jane can read all four. Sam cannot read Finance, and John cannot read Marketing.

## Calendar

The source documents run from 2026-09-14 through 2026-09-22. The next company-wide Launch Week is Monday 2026-10-26 through Friday 2026-10-30, 34 days after the final source update. Dates inside documents may point forward to that week; a document's edit date may not.

| Launch | Informal names | Owner | Day | Description | Current status | Main dependency |
| --- | --- | --- | --- | --- | --- | --- |
| Shared Inbox | inbox, shared queue | Priya Raghunathan | Mon 26 Oct | Customer teams can answer messages together in one queue. | On track | Import checklist |
| Audit Trail | audit log, history export | Ben Achilov | Mon 26 Oct | Admins can see and export changes to customer records. | On track | Retention test |
| Usage Alerts | threshold emails, usage notices | Maya Restrepo | Tue 27 Oct | Teams receive an alert before usage reaches their chosen limit. | On track | Email copy and send test |
| Partner API | partner endpoints, partner access | Dana Provenzano | Wed 28 Oct | Approved partners can read account activity through a scoped API. | At risk | Security review of partner scopes |
| EU Region | Frankfurt, European region | Sam Lindqvist | Thu 29 Oct | European customers can keep their workspace data in the EU. | At risk | Passing load test |
| Billing Portal | invoice portal, billing self-service | John Mbeki | Fri 30 Oct | Customers can download invoices and update billing details. | On track | Invoice reconciliation |

The plan dates remain targets for the two at-risk launches. Neither has been removed from Launch Week. Their owners will decide whether to keep the dates after the named checks finish.

## Evidence rules

- No single source document lists all six launches with their current status. Company calendar pages divide the week and predate the risk decisions.
- Partner API security review and EU Region load testing are the only launch risks. Older notes call both on track. Later evidence changes that assessment.
- The Partner API plan identifies Dana and Wednesday. The security issue records the open scope review. The separate security report explains the missing sample. The later Slack thread records the at-risk decision.
- The EU Region plan identifies Sam and Thursday. The test report records the failed run. A later issue and Slack update retain the target date while marking it at risk.
- The full-scope Partner API plan was narrowed to read-only access on 2026-09-19. Earlier references remain historical.
- The recent `#engineering` EU Region update on 2026-09-22 is the source update to process during the demo.
- `CAP-7F3` is an exact-match diagnostic identifier in one report only.
- Five unrelated documents test retrieval filtering. They concern lunch, account setup, laptops, photo filing, and expenses.

## Source formats

Slack files read as dated channel conversations. Linear files have one issue ID, status, assignee, and dated activity. Notion pages use headings, tables, and decisions. Drive files are reports or memos. Every source file has a `slack-`, `linear-`, `notion-`, or `drive-` prefix and is listed in `manifest.json`.
