# SEC-214 · Approve Partner API scopes

| Field | Value |
| --- | --- |
| Status | Waiting on corrected sample |
| Assignee | Ben Achilov |
| Labels | partner-api, security, launch-week |
| Created | 2026-09-17 |
| Updated | 2026-09-21 |

## Description

Security must review the fields a partner credential can read and the response a partner will receive. This check gates the Partner API launch planned for Wednesday 28 October.

## Activity

**Ben Achilov** commented · 2026-09-19
> Removed write access from the first release. The initial partner credential will be read-only. This replaces the scope in the 17 September plan.

**Sam Lindqvist** commented · 2026-09-21
> The field list is reviewed. The sample response still contains an internal account note. I cannot approve the scope until the sample is regenerated and checked against a restricted account.

**Ben Achilov** commented · 2026-09-21
> Waiting for the corrected sample. Dana has the Wednesday target; I will send her the review result after the restricted-account test.
