# Email

Digital Brain sends its own account email. The auth server sends none.

That is one setting: `[auth.hook.send_email]` in `supabase/config.toml` points at
`supabase/functions/auth-email/`. GoTrue hands every account email to that
function with the address, the token and what the email is for, and the function
decides the words, renders them and delivers them. Nothing about a Digital Brain email
lives in a dashboard.

## Where a message goes

| Environment | Delivery                  | Set by                      |
| ----------- | ------------------------- | --------------------------- |
| Local       | Mailpit, over plain SMTP  | no `RESEND_API_KEY`         |
| Deployed    | Resend, over its HTTP API | `RESEND_API_KEY` is present |

`supabase/functions/_shared/email/send.ts` picks between them. Local delivery is
the default rather than the exception: with no key there is nothing to leak and
nothing to configure, and every rendered email is at
http://127.0.0.1:55324 within a second of the thing that caused it.

Mailpit accepts a message with no auth and no TLS, so the SMTP client is a
socket and eight lines of conversation in `smtp.ts` rather than a dependency.

## The emails

Five come from the auth server through the hook. One is Digital Brain's own.

| Email                             | Sent when                                  | Goes to             |
| --------------------------------- | ------------------------------------------ | ------------------- |
| Confirm your email address        | someone signs up                           | the new account     |
| Reset your Digital Brain password | someone asks to reset it                   | the account         |
| Your Digital Brain sign-in link   | a passwordless sign in                     | the account         |
| Confirm your new email            | the address on an account is being changed | both addresses      |
| Your confirmation code            | the account is asked to prove it is itself | the account         |
| Invited you to an org             | somebody is invited to an organization     | the invited address |

Two of those are not reachable from any screen today. Sign-in links are not
offered, and nothing asks for a confirmation code because
`secure_password_change` is off. They are written anyway, because the hook is
now the only way an account email leaves this project: an action with no
template raises rather than sending a blank message, and a person locked out by
a missing template is a worse outcome than a template nobody reads.

**Changing an address asks both inboxes.** The current address approves and the
new one confirms, each with its own token, and the change only lands when both
have answered. `docs/lessons.md` has the reason the tokens must not be swapped.

**The invite is Digital Brain's own.** Organization invitations are a Digital Brain table, not a
GoTrue flow, so that email does not go through the hook. Its words live beside
the others in `templates.tsx`.

## How they look

Dark, always. An email cannot read a colour scheme reliably, and one that tries
looks broken in half the clients that matter, so it commits.

The palette is `web/styles/tokens.css` flattened into literals in `layout.tsx`:
an email has no stylesheet, no custom properties, and no cascade worth the name.
The mark is a PNG at `web/public/brand/magpie-mark-dark.png`, because Gmail
strips inline SVG.

Every email is one heading, at most two paragraphs, one action, and the same
action again as a plain link underneath for the clients that swallow buttons.
One action each: a second button is a second decision, and nobody reads two.

## Adding one

1. Write it in `supabase/functions/_shared/email/templates.tsx`. It returns its
   own subject, because a subject that drifts from its body is a bug.
2. If the auth server triggers it, add the case to `compose` in
   `auth-email/hook.ts`. If Digital Brain triggers it, call `sendEmail` directly.
3. Add a row to the table above.

## Settings

| Variable              | Needed     | What it is                                       |
| --------------------- | ---------- | ------------------------------------------------ |
| `SB_AUTH_HOOK_SECRET` | always     | Signs the hook call. Without it nothing is sent. |
| `SB_EMAIL_FROM`       | deployed   | `Digital Brain <no-reply@yourdomain>`            |
| `RESEND_API_KEY`      | deployed   | Absent locally, which is what selects Mailpit.   |
| `SB_WEB_BASE_URL`     | always     | What the links in an email point at.             |
| `SB_SMTP_PORT`        | local only | Mailpit's SMTP port, 55325.                      |

The hook secret is the whole security boundary. This endpoint takes a token and
an address and would happily mail one to the other, so an unsigned call is
refused before anything is rendered, and a missing secret refuses everything
rather than trusting the caller.

Verifying a signature is three checks, not one. The signature has to match, it
has to match in constant time, and the call has to be recent. A signature does
not expire on its own, so without the five minute window a call captured once
could be replayed for as long as the secret lives: the same reset email sent
again and again, or an email change re-offered after the person decided against
it. The window is checked in both directions, because a timestamp far in the
future is a replay too.
