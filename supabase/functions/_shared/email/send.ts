// One way out for every email Digital Brain sends. Resend in a deployed project, the local mail sink
// otherwise, so development never puts a message on the internet and never needs a Resend key.

import { connect, deliver } from './smtp.ts';

export interface Outgoing {
  to: string;
  subject: string;
  html: string;
}

/** Where a message came from. A deployment sets this; locally it is a name, not an inbox. */
function sender(): string {
  return Deno.env.get('SB_EMAIL_FROM') ?? 'Digital Brain <no-reply@digitalbrain.local>';
}

/**
 * Local delivery when there is no Resend key, or when asked for explicitly. Inside the edge
 * runtime container the host's mail sink is reached through host.docker.internal.
 */
function isLocal(): boolean {
  return Deno.env.get('SB_EMAIL_LOCAL') === '1' || !Deno.env.get('RESEND_API_KEY');
}

async function sendLocally(message: Outgoing): Promise<void> {
  const host = Deno.env.get('SB_SMTP_HOST') ?? 'host.docker.internal';
  const port = Number(Deno.env.get('SB_SMTP_PORT') ?? '55325');

  const transport = await connect(host, port);
  try {
    await deliver(transport, { ...message, from: sender() });
  } finally {
    transport.close();
  }
}

async function sendThroughResend(message: Outgoing): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: sender(),
      to: [message.to],
      subject: message.subject,
      html: message.html,
    }),
  });

  if (!response.ok) {
    // The address is the caller's; the provider's wording is not theirs to read.
    console.error('resend refused a message', { status: response.status });
    throw new Error('the message could not be sent');
  }
}

export async function sendEmail(message: Outgoing): Promise<void> {
  if (isLocal()) return await sendLocally(message);
  return await sendThroughResend(message);
}
