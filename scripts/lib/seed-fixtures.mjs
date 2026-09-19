import { createHash } from 'node:crypto';

/** Stable UUID for synthetic fixture rows; replay updates the same item. */
export function fixtureId(value) {
  const hex = createHash('sha256').update(`dream-fixture:${value}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** A fixture must resolve its real source text before creating historical records. */
export function fixtureDocument(corpus, externalId) {
  const document = corpus.get(externalId);
  if (!document?.opener) throw new Error(`Missing ingested fixture citation: ${externalId}`);
  return document;
}

/** Links require an embedding for each resolved source. */
export function fixtureLinkDocument(corpus, externalId) {
  const document = fixtureDocument(corpus, externalId);
  const embedding =
    typeof document.opener.embedding === 'string'
      ? JSON.parse(document.opener.embedding)
      : document.opener.embedding;
  if (!Array.isArray(embedding) || !embedding.length || !embedding.every(Number.isFinite)) {
    throw new Error(`Missing valid fixture embedding: ${externalId}`);
  }
  return document;
}
