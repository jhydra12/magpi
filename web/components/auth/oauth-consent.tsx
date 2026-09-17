'use client';

import { AuthShell } from '@/components/auth/auth-shell';
import { FormError } from '@/components/auth/form-error';
import { Button } from '@/components/ui/button';
import { useOAuthConsent, type OAuthAuthorizationDetails } from '@/hooks/use-oauth-consent';

/** What each scope actually lets the client do, in the words a person needs to decide. */
const SCOPE_MEANING: Record<string, string> = {
  openid: 'Know that it is you',
  email: 'See your email address',
  profile: 'See your name',
};

function describeScope(scope: string): string {
  return SCOPE_MEANING[scope] ?? scope;
}

/** The name to show for a client that registered itself, which may have given no name at all. */
function clientName(details: OAuthAuthorizationDetails): string {
  const name = details.client.name?.trim();
  return name && name.length > 0 ? name : 'An application';
}

/** The library's consent flow, on Magpi's sign-in shell. Signed-out people go to /sign-in first. */
export function OAuthConsent({ authorizationId }: { authorizationId: string | null }) {
  const { details, error, isLoading, decision, approve, deny } = useOAuthConsent({
    authorizationId,
    signInPath: '/sign-in',
  });

  if (isLoading) {
    return (
      <AuthShell title="One moment" description="Reading what this application is asking for.">
        <div className="h-20 animate-pulse rounded-[var(--radius-control)] bg-muted" />
      </AuthShell>
    );
  }

  if (!details) {
    return (
      <AuthShell title="This request cannot be read">
        <FormError message={error} />
      </AuthShell>
    );
  }

  const scopes = details.scope.split(' ').filter((scope) => scope.length > 0);
  const isDecided = decision !== null;

  return (
    <AuthShell
      title={`${clientName(details)} wants to read your Magpi`}
      description="It will act as you. It can see what you can see, and nothing else."
    >
      <div className="flex flex-col gap-6">
        <FormError message={error} />

        <ul className="flex flex-col gap-2 text-sm text-foreground">
          <li className="flex gap-2">
            <span aria-hidden className="text-tertiary-foreground">
              &bull;
            </span>
            Search and read the documents in your spaces
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-tertiary-foreground">
              &bull;
            </span>
            Write notes into a space you are a member of
          </li>
          {scopes.map((scope) => (
            <li key={scope} className="flex gap-2">
              <span aria-hidden className="text-tertiary-foreground">
                &bull;
              </span>
              {describeScope(scope)}
            </li>
          ))}
        </ul>

        <p className="text-sm text-tertiary-foreground">
          Signed in as {details.user.email}. You can take this back at any time.
        </p>

        <div className="flex gap-3">
          <Button onClick={approve} disabled={isDecided} className="flex-1">
            Allow
          </Button>
          <Button variant="outline" onClick={deny} disabled={isDecided} className="flex-1">
            Deny
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
