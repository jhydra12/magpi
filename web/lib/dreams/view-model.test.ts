import { describe, expect, it } from 'vitest';

import { buildLinkCandidates, buildRunSummaries } from './view-model';
import type { DreamLinkRecord, DreamRunRecord, DocumentRecord, SpaceRecord } from './view-model';

const getRun = (overrides?: Partial<DreamRunRecord>): DreamRunRecord => ({
  id: 'run-1',
  space_id: 'space-1',
  kind: 'digest',
  status: 'succeeded',
  started_at: '2026-09-09T02:00:00.000Z',
  finished_at: '2026-09-09T02:01:30.000Z',
  input_document_count: 42,
  output_document_id: 'doc-1',
  error: null,
  triggered_by: null,
  created_at: '2026-09-09T02:00:00.000Z',
  ...overrides,
});

const getSpace = (overrides?: Partial<SpaceRecord>): SpaceRecord => ({
  id: 'space-1',
  name: 'Engineering',
  dreaming_enabled: true,
  ...overrides,
});

const getLink = (overrides?: Partial<DreamLinkRecord>): DreamLinkRecord => ({
  id: 'link-1',
  document_a: 'doc-a',
  document_b: 'doc-b',
  similarity: 0.9231,
  rationale: 'Both describe the SSO rollout slipping to October.',
  confirmed_at: null,
  dismissed_at: null,
  ...overrides,
});

const getDocument = (overrides?: Partial<DocumentRecord>): DocumentRecord => ({
  id: 'doc-a',
  title: 'SSO rollout',
  url: 'https://linear.app/issue/1',
  origin: 'sync',
  ...overrides,
});

describe('dream run summaries', () => {
  it('says what ran, over how many documents, and in which space', () => {
    const [summary] = buildRunSummaries({ runs: [getRun()], spaces: [getSpace()] });

    expect(summary.spaceName).toBe('Engineering');
    expect(summary.kindLabel).toBe('Digest');
    expect(summary.inputSummary).toBe('42 documents');
  });

  it('reads a run over one document in the singular', () => {
    const [summary] = buildRunSummaries({
      runs: [getRun({ input_document_count: 1 })],
      spaces: [getSpace()],
    });

    expect(summary.inputSummary).toBe('1 document');
  });

  it('says a run read nothing rather than showing a zero', () => {
    const [summary] = buildRunSummaries({
      runs: [getRun({ input_document_count: 0 })],
      spaces: [getSpace()],
    });

    expect(summary.inputSummary).toBe('No documents');
  });

  it('carries the raw count too, so copy can build a sentence rather than splice a phrase', () => {
    const [summary] = buildRunSummaries({
      runs: [getRun({ input_document_count: 900 })],
      spaces: [getSpace()],
    });

    expect(summary.inputDocumentCount).toBe(900);
  });

  it('drops a run whose space was missing from the same read', () => {
    const summaries = buildRunSummaries({
      runs: [getRun({ space_id: 'space-hidden' })],
      spaces: [getSpace()],
    });

    expect(summaries).toEqual([]);
  });

  it('carries the timeout stage into the summary, so a stalled run is legible in the list', () => {
    const [summary] = buildRunSummaries({
      runs: [getRun({ status: 'timeout', error: 'embed: 400 documents exceeded the CPU budget' })],
      spaces: [getSpace()],
    });

    expect(summary.status.stage).toBe('embed');
    expect(summary.status.tone).toBe('warning');
  });

  it('says whether a run wrote an output document', () => {
    const [withOutput] = buildRunSummaries({ runs: [getRun()], spaces: [getSpace()] });
    const [withoutOutput] = buildRunSummaries({
      runs: [getRun({ output_document_id: null })],
      spaces: [getSpace()],
    });

    expect(withOutput.outputDocumentId).toBe('doc-1');
    expect(withoutOutput.outputDocumentId).toBeNull();
  });
});

describe('candidate document links', () => {
  it('names both documents and reads out the rationale', () => {
    const [candidate] = buildLinkCandidates({
      links: [getLink()],
      documents: [getDocument(), getDocument({ id: 'doc-b', title: 'Slack: sso thread' })],
    });

    expect(candidate.documentA.title).toBe('SSO rollout');
    expect(candidate.documentB.title).toBe('Slack: sso thread');
    expect(candidate.rationale).toBe('Both describe the SSO rollout slipping to October.');
  });

  it('reads similarity as a percentage a person can compare', () => {
    const [candidate] = buildLinkCandidates({
      links: [getLink()],
      documents: [getDocument(), getDocument({ id: 'doc-b' })],
    });

    expect(candidate.similarityLabel).toBe('92% similar');
  });

  it('admits when the run recorded no rationale rather than leaving the pair unexplained', () => {
    const [candidate] = buildLinkCandidates({
      links: [getLink({ rationale: null })],
      documents: [getDocument(), getDocument({ id: 'doc-b' })],
    });

    expect(candidate.rationale).toBe('The run recorded no rationale for this pair.');
  });

  it('marks a pair a human already confirmed', () => {
    const [candidate] = buildLinkCandidates({
      links: [getLink({ confirmed_at: '2026-09-09T08:00:00.000Z' })],
      documents: [getDocument(), getDocument({ id: 'doc-b' })],
    });

    expect(candidate.state).toBe('confirmed');
  });

  it('marks a pair a human dismissed', () => {
    const [candidate] = buildLinkCandidates({
      links: [getLink({ dismissed_at: '2026-09-09T08:00:00.000Z' })],
      documents: [getDocument(), getDocument({ id: 'doc-b' })],
    });

    expect(candidate.state).toBe('dismissed');
  });

  it('leaves an untouched pair waiting for a human', () => {
    const [candidate] = buildLinkCandidates({
      links: [getLink()],
      documents: [getDocument(), getDocument({ id: 'doc-b' })],
    });

    expect(candidate.state).toBe('pending');
  });

  it('drops a pair missing a side, since a half-read pair cannot be judged', () => {
    const candidates = buildLinkCandidates({
      links: [getLink()],
      documents: [getDocument()],
    });

    expect(candidates).toEqual([]);
  });
});
