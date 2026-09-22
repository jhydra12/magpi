// Plain SMTP, for local development only. Mailpit takes a message with no auth and no TLS, so a
// socket and eight lines of conversation are the whole client. Production goes over Resend's HTTP
// API instead, which never touches the local stack.

/** The bits of a reply that matter: the code, and the text for an error message. */
export interface SmtpReply {
  code: number;
  text: string;
}

/** The socket, behind a seam, so the conversation can be tested without one. */
export interface SmtpTransport {
  read(): Promise<SmtpReply>;
  write(line: string): Promise<void>;
}

export interface Message {
  from: string;
  to: string;
  subject: string;
  html: string;
  date?: string;
}

/** RFC 5322 wants CRLF, whatever the renderer produced. */
export function toCrlf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

/** A line starting with a dot would end the DATA section early. */
export function dotStuff(body: string): string {
  return toCrlf(body)
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

/** A subject outside ASCII has to be encoded, or the header arrives mangled. */
export function encodeHeader(value: string): string {
  if (![...value].some((character) => character.charCodeAt(0) > 126)) return value;
  const bytes = new TextEncoder().encode(value);
  return `=?UTF-8?B?${btoa(String.fromCharCode(...bytes))}?=`;
}

export function buildMessage(message: Message): string {
  const headers = [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${message.date ?? new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: 8bit',
  ];
  return `${headers.join('\r\n')}\r\n\r\n${dotStuff(message.html)}`;
}

/** `Digital Brain <no-reply@digitalbrain.test>` is for a person to read; the envelope wants the address alone. */
export function addressOf(value: string): string {
  return /<([^>]+)>/.exec(value)?.[1] ?? value.trim();
}

/** Raises when the server answered anything but what this step expects. */
function expect(reply: SmtpReply, codes: number[], step: string): void {
  if (!codes.includes(reply.code)) {
    throw new Error(`the local mail server refused ${step}: ${reply.code} ${reply.text}`);
  }
}

/** One message, one conversation. */
export async function deliver(transport: SmtpTransport, message: Message): Promise<void> {
  expect(await transport.read(), [220], 'the connection');

  await transport.write('EHLO magpi');
  expect(await transport.read(), [250], 'EHLO');

  await transport.write(`MAIL FROM:<${addressOf(message.from)}>`);
  expect(await transport.read(), [250], 'the sender');

  await transport.write(`RCPT TO:<${addressOf(message.to)}>`);
  expect(await transport.read(), [250, 251], 'the recipient');

  await transport.write('DATA');
  expect(await transport.read(), [354], 'DATA');

  await transport.write(`${buildMessage(message)}\r\n.`);
  expect(await transport.read(), [250], 'the message');

  await transport.write('QUIT');
}

/** The real socket. A reply can run to several lines; the last one carries the verdict. */
export async function connect(host: string, port: number): Promise<
  SmtpTransport & {
    close(): void;
  }
> {
  const socket = await Deno.connect({ hostname: host, port });
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffered = '';

  return {
    async read() {
      // A multi-line reply marks every line but the last with a hyphen after the code.
      while (!/^\d{3} [^\n]*\n/m.test(buffered.split('\n').slice(-2).join('\n') + '\n')) {
        const chunk = new Uint8Array(4096);
        const read = await socket.read(chunk);
        if (read === null) break;
        buffered += decoder.decode(chunk.subarray(0, read));
        if (/^\d{3} .*\r?\n$/m.test(buffered)) break;
      }

      const lines = buffered.split(/\r?\n/).filter((line) => line.length > 0);
      const last = lines.at(-1) ?? '';
      buffered = '';
      return { code: Number(last.slice(0, 3)), text: last.slice(4) };
    },

    async write(line) {
      await socket.write(encoder.encode(`${line}\r\n`));
    },

    close() {
      socket.close();
    },
  };
}
