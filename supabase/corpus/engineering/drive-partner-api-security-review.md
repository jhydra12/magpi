# Partner API security review, sample response

Sam Lindqvist
2026-09-21

The proposed first release gives partners read-only access to account activity. The earlier write scope was removed on 19 September. The approved field list excludes internal account notes.

The test credential was used against a restricted account. Its response still included one internal note from the old serializer. That note must be removed and a new response recorded before security can sign the release check. The field list alone is insufficient evidence.

Ben is preparing the replacement sample. Security will rerun the restricted-account check after that sample arrives. The Wednesday Partner API target remains in the calendar pending this review.
