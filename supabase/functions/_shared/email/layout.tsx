// The frame every Digital Brain email sits in. Dark, because the product is, and because an email that
// flips with the reader's setting cannot be checked.
//
// The palette is lifted from web/styles/tokens.css rather than derived: an email has no
// stylesheet, no custom properties and no cascade worth the name, so every colour is a literal.

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

/** Digital Brain's tokens, flattened. Dark values, since the email is always dark. */
export const ink = {
  ground: '#0f1114',
  panel: '#15181c',
  border: '#2a2f36',
  text: '#f7f6f2',
  quiet: '#b1ada4',
  sheen: '#0fbfa8',
} as const;

const font = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export interface Branding {
  /** Absolute, because an email has no origin to resolve against. */
  siteUrl: string;
}

export function Shell({
  preview,
  siteUrl,
  children,
}: Branding & { preview: string; children: React.ReactNode }) {
  return (
    <Html lang='en'>
      <Head>
        <meta name='color-scheme' content='dark' />
        <meta name='supported-color-schemes' content='dark' />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: ink.ground,
          color: ink.text,
          fontFamily: font,
          margin: 0,
          padding: '32px 16px',
        }}
      >
        <Container style={{ maxWidth: '480px', margin: '0 auto' }}>
          <Section style={{ paddingBottom: '24px' }}>
            <Img
              src={`${siteUrl}/brand/magpie-mark-dark.png`}
              width='26'
              height='20'
              alt='Digital Brain'
              style={{ display: 'block' }}
            />
          </Section>

          <Section
            style={{
              backgroundColor: ink.panel,
              border: `1px solid ${ink.border}`,
              borderRadius: '10px',
              padding: '28px',
            }}
          >
            {children}
          </Section>

          <Hr style={{ borderColor: ink.border, margin: '28px 0 16px' }} />

          <Text style={{ color: ink.quiet, fontSize: '12px', lineHeight: '18px', margin: 0 }}>
            Digital Brain remembers what your team already wrote down.{' '}
            <Link href={siteUrl} style={{ color: ink.quiet, textDecoration: 'underline' }}>
              {siteUrl.replace(/^https?:\/\//, '')}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        color: ink.text,
        fontSize: '20px',
        fontWeight: 600,
        lineHeight: '28px',
        margin: '0 0 12px',
      }}
    >
      {children}
    </Text>
  );
}

export function Paragraph({ children, quiet = false }: {
  children: React.ReactNode;
  quiet?: boolean;
}) {
  return (
    <Text
      style={{
        color: quiet ? ink.quiet : ink.text,
        fontSize: '14px',
        lineHeight: '22px',
        margin: '0 0 16px',
      }}
    >
      {children}
    </Text>
  );
}

/** One action per email. A second button is a second decision, and nobody reads two. */
export function Action({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Section style={{ padding: '4px 0 20px' }}>
      <Link
        href={href}
        style={{
          backgroundColor: ink.sheen,
          borderRadius: '8px',
          color: ink.ground,
          display: 'inline-block',
          fontSize: '14px',
          fontWeight: 600,
          padding: '10px 18px',
          textDecoration: 'none',
        }}
      >
        {children}
      </Link>
    </Section>
  );
}

/** The same link as text, because a button that does not render leaves nothing behind. */
export function Fallback({ href }: { href: string }) {
  return (
    <Text style={{ color: ink.quiet, fontSize: '12px', lineHeight: '18px', margin: 0 }}>
      Or paste this into your browser:
      <br />
      <Link href={href} style={{ color: ink.sheen, wordBreak: 'break-all' }}>
        {href}
      </Link>
    </Text>
  );
}
