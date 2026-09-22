import { OAuthConsent } from '@/components/auth/oauth-consent';

export const metadata = { title: 'Allow access to Digital Brain' };

/**
 * Where Supabase Auth sends a person when an MCP client asks to read their knowledge base.
 * The id in the query is the authorization; everything else about it is fetched with their
 * own session, so a link to this page on its own grants nothing.
 */
export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;

  return <OAuthConsent authorizationId={authorizationId ?? null} />;
}
