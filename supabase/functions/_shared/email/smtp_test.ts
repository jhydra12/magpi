import { assert, assertEquals, assertRejects } from '@std/assert';

import {
  addressOf,
  buildMessage,
  deliver,
  dotStuff,
  encodeHeader,
  type SmtpReply,
  type SmtpTransport,
} from './smtp.ts';

const MESSAGE = {
  from: 'Digital Brain <no-reply@digitalbrain.local>',
  to: 'reader@example.com',
  subject: 'Reset your Digital Brain password',
  html: '<p>Hello</p>',
  date: 'Thu, 11 Sep 2026 12:00:00 GMT',
};

/** A server that says yes to everything, recording what it was told. */
function politeServer(overrides: Partial<Record<number, SmtpReply>> = {}) {
  const said: string[] = [];
  const replies: SmtpReply[] = [
    { code: 220, text: 'mailpit' },
    { code: 250, text: 'hello' },
    { code: 250, text: 'sender ok' },
    { code: 250, text: 'recipient ok' },
    { code: 354, text: 'go ahead' },
    { code: 250, text: 'queued' },
  ];
  let step = 0;

  const transport: SmtpTransport = {
    read: () => {
      const reply = overrides[step] ?? replies[step] ?? { code: 250, text: '' };
      step += 1;
      return Promise.resolve(reply);
    },
    write: (line) => {
      said.push(line);
      return Promise.resolve();
    },
  };

  return { transport, said };
}

Deno.test('a message is delivered in the order SMTP expects', async () => {
  const { transport, said } = politeServer();

  await deliver(transport, MESSAGE);

  assertEquals(said[0], 'EHLO magpi');
  assertEquals(said[1], 'MAIL FROM:<no-reply@digitalbrain.local>');
  assertEquals(said[2], 'RCPT TO:<reader@example.com>');
  assertEquals(said[3], 'DATA');
  assert(said[4].startsWith('From: Digital Brain <no-reply@digitalbrain.local>'));
  assert(said[4].endsWith('\r\n.'), 'the message did not end with the terminating dot');
  assertEquals(said[5], 'QUIT');
});

// The envelope takes the address alone; the display name belongs in the header.
Deno.test('the display name is left out of the envelope', () => {
  assertEquals(
    addressOf('Digital Brain <no-reply@digitalbrain.local>'),
    'no-reply@digitalbrain.local',
  );
  assertEquals(addressOf('plain@example.com'), 'plain@example.com');
});

Deno.test('a refusal says which step it came from rather than failing silently', async () => {
  const { transport } = politeServer({ 2: { code: 550, text: 'no such sender' } });

  await assertRejects(() => deliver(transport, MESSAGE), Error, 'the sender');
});

Deno.test('a server that never greets us is not talked to', async () => {
  const { transport, said } = politeServer({ 0: { code: 421, text: 'too busy' } });

  await assertRejects(() => deliver(transport, MESSAGE), Error, 'the connection');
  assertEquals(said, []);
});

// A line of its own beginning with a dot would end the DATA section early and truncate the email.
Deno.test('a line starting with a dot survives the message body', () => {
  assertEquals(dotStuff('one\r\n.two\r\nthree'), 'one\r\n..two\r\nthree');
});

Deno.test('every newline is CRLF, whatever the renderer produced', () => {
  const built = buildMessage({ ...MESSAGE, html: 'one\ntwo' });

  assert(built.endsWith('one\r\ntwo'));
  assert(!/[^\r]\n/.test(built), 'a bare newline survived');
});

Deno.test('a subject outside ASCII is encoded rather than mangled', () => {
  assertEquals(encodeHeader('Reset your password'), 'Reset your password');
  assert(encodeHeader('Réinitialiser').startsWith('=?UTF-8?B?'));
});

Deno.test('the message says it is HTML, or a client shows the markup', () => {
  const built = buildMessage(MESSAGE);

  assert(built.includes('Content-Type: text/html; charset="utf-8"'));
  assert(built.includes('MIME-Version: 1.0'));
  assert(built.includes('Subject: Reset your Digital Brain password'));
});
