import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '@/lib/actions/state';

import type { SpaceChoice } from './upload-dialog';

const ENGINEERING = '33333333-3333-4333-8333-333333333333';
const FINANCE = '44444444-4444-4444-8444-444444444444';
const DOCUMENT_ID = '55555555-5555-4555-8555-555555555555';

type EnqueueInput = {
  readonly spaceId: string;
  readonly objectName: string;
  readonly title: string;
  readonly mimeType: string;
};

const storage = {
  paths: [] as string[],
  refused: [] as string[],
  /** Set to hold every upload open, so the in-flight state can be read. */
  gate: null as Promise<void> | null,
};

const enqueue = {
  answer: { status: 'success', data: { documentId: DOCUMENT_ID } } as ActionState<{
    documentId: string;
  }>,
  inputs: [] as EnqueueInput[],
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: async (objectPath: string) => {
          storage.paths.push(objectPath);
          if (storage.gate) await storage.gate;
          const name = objectPath.split('/').at(-1) ?? objectPath;
          return storage.refused.includes(name)
            ? { error: { message: `${name} already exists` } }
            : { error: null };
        },
      }),
    },
  }),
}));

vi.mock('@/app/(app)/documents/actions', () => ({
  enqueueUploadedDocument: async (input: EnqueueInput) => {
    enqueue.inputs.push(input);
    return enqueue.answer;
  },
}));

const { UploadDialog } = await import('./upload-dialog');

/** Typing key by key at the default delay times the suite out under load. */
const user = userEvent.setup({ delay: null });

const SPACES: readonly SpaceChoice[] = [
  { id: ENGINEERING, name: 'Engineering' },
  { id: FINANCE, name: 'Finance' },
];

const getFile = (name: string, type = 'text/plain', bytes = 10) =>
  new File([new Uint8Array(bytes)], name, { type });

async function openDialog(spaces: readonly SpaceChoice[] = SPACES) {
  render(<UploadDialog spaces={spaces} />);
  await user.click(screen.getByRole('button', { name: 'Upload documents now' }));
}

/** The dropzone's own input, which carries no name of its own to find it by. */
const picker = () => document.querySelector<HTMLInputElement>('input[type="file"]');

async function choose(files: readonly File[]) {
  await act(async () => {
    fireEvent.change(picker() as HTMLInputElement, { target: { files } });
  });
}

const uploadButton = () => screen.getByRole('button', { name: /^Upload( \d+)?$/ });

/** Storage answers a turn after the click, and the recording of what went up follows that. */
async function startUpload() {
  await user.click(uploadButton());
  await act(async () => {});
}

/** Radix keeps its options out of the DOM until the trigger opens, unlike a native select. */
async function chooseSpace(name: string) {
  await user.click(screen.getByRole('combobox', { name: 'Put these in' }));
  await user.click(await screen.findByRole('option', { name }));
}

beforeEach(() => {
  storage.paths = [];
  storage.refused = [];
  storage.gate = null;
  enqueue.answer = { status: 'success', data: { documentId: DOCUMENT_ID } };
  enqueue.inputs = [];
  vi.stubGlobal('URL', {
    ...URL,
    revokeObjectURL: vi.fn(),
    createObjectURL: (file: Blob) => `blob:${(file as File).name}`,
  });
});

describe('choosing what to upload', () => {
  it('offers nothing to upload until a file has been chosen', async () => {
    await openDialog();

    expect(screen.queryByRole('list', { name: 'Files to upload' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  it('lists each chosen file with its size, and counts them on the button', async () => {
    await openDialog();

    await choose([getFile('notes.txt', 'text/plain', 2400), getFile('plan.txt')]);

    expect(screen.getByText('notes.txt')).toBeInTheDocument();
    expect(screen.getByText('3 KB')).toBeInTheDocument();
    expect(uploadButton()).toHaveTextContent('Upload 2');
  });

  it('takes a file back off the list, and uploads nothing that was taken off', async () => {
    await openDialog();
    await choose([getFile('notes.txt')]);

    await user.click(screen.getByRole('button', { name: 'Remove notes.txt' }));

    expect(screen.queryByText('notes.txt')).toBeNull();
    expect(uploadButton()).toBeDisabled();
    expect(storage.paths).toEqual([]);
  });

  it('starts on the first space the reader is in', async () => {
    await openDialog();

    expect(screen.getByRole('combobox', { name: 'Put these in' })).toHaveTextContent('Engineering');
  });

  it('starts on no space at all when the reader is in none', async () => {
    await openDialog([]);

    expect(screen.getByRole('combobox', { name: 'Put these in' })).toHaveTextContent(
      'Choose a space',
    );
  });

  it('forgets the chosen files when the dialog is cancelled, and uploads none of them', async () => {
    await openDialog();
    await choose([getFile('notes.txt')]);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Upload documents now' }));

    expect(screen.queryByText('notes.txt')).toBeNull();
    expect(storage.paths).toEqual([]);
    expect(enqueue.inputs).toEqual([]);
  });

  it('forgets the chosen files when the dialog is closed on Escape, and uploads none of them', async () => {
    await openDialog();
    await choose([getFile('notes.txt')]);

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Upload documents now' }));

    expect(screen.queryByText('notes.txt')).toBeNull();
    expect(storage.paths).toEqual([]);
  });
});

describe('uploading into a space', () => {
  it('puts the file in the space the picker starts on', async () => {
    await openDialog();
    await choose([getFile('notes.txt')]);

    await startUpload();

    expect(storage.paths).toEqual([`${ENGINEERING}/notes.txt`]);
    expect(enqueue.inputs).toEqual([
      {
        spaceId: ENGINEERING,
        objectName: 'notes.txt',
        title: 'notes.txt',
        mimeType: 'text/plain',
      },
    ]);
  });

  it('puts the file in the space the person picked instead', async () => {
    await openDialog();
    await choose([getFile('notes.txt')]);

    await chooseSpace('Finance');
    await startUpload();

    expect(storage.paths).toEqual([`${FINANCE}/notes.txt`]);
    expect(enqueue.inputs.map((input) => input.spaceId)).toEqual([FINANCE]);
  });

  it('records a markdown file as markdown, though the browser reports no type for it', async () => {
    await openDialog();
    await choose([getFile('plan.md', '')]);

    await startUpload();

    expect(enqueue.inputs.map((input) => input.mimeType)).toEqual(['text/markdown']);
  });

  it('says a file nothing can read was not recorded, and records nothing', async () => {
    await openDialog();
    await choose([getFile('logo.png', 'image/png')]);

    await startUpload();

    expect(storage.paths).toEqual([]);
    expect(enqueue.inputs).toEqual([]);
  });

  it('says why an upload could not be recorded', async () => {
    enqueue.answer = { status: 'error', message: 'You are not in that space.' };
    await openDialog();
    await choose([getFile('notes.txt')]);

    await startUpload();

    expect(screen.getByRole('alert')).toHaveTextContent('You are not in that space.');
  });

  it('records each object once, however many times upload is pressed', async () => {
    await openDialog();
    await choose([getFile('one.txt')]);
    await startUpload();

    await choose([getFile('two.txt')]);
    await startUpload();

    expect(storage.paths).toEqual([`${ENGINEERING}/one.txt`, `${ENGINEERING}/two.txt`]);
    expect(enqueue.inputs.map((input) => input.objectName)).toEqual(['one.txt', 'two.txt']);
  });

  it('marks a file as uploaded once it is up', async () => {
    await openDialog();
    await choose([getFile('notes.txt')]);
    await startUpload();

    expect(screen.getByText('Uploaded')).toBeInTheDocument();
    expect(uploadButton()).toBeDisabled();
  });

  // The same document belongs in two spaces often enough, and a corrected file keeps its name.
  it('offers the same file again after the dialog has been closed', async () => {
    await openDialog();
    await choose([getFile('notes.txt')]);
    await startUpload();
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await user.click(screen.getByRole('button', { name: 'Upload documents now' }));
    await choose([getFile('notes.txt')]);

    expect(screen.queryByText('Uploaded')).not.toBeInTheDocument();
    expect(uploadButton()).toBeEnabled();

    await startUpload();
    expect(storage.paths).toEqual([`${ENGINEERING}/notes.txt`, `${ENGINEERING}/notes.txt`]);
  });
});

describe('what the dialog says while it works', () => {
  it('says it is uploading, and closes every control that would interfere', async () => {
    let release = () => {};
    storage.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openDialog();
    await choose([getFile('notes.txt')]);

    await startUpload();

    expect(screen.getByRole('button', { name: 'Uploading' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove notes.txt' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Put these in' })).toBeDisabled();

    await act(async () => {
      release();
    });
  });

  it('marks each file that is up, and offers to close rather than to upload again', async () => {
    await openDialog();
    await choose([getFile('notes.txt')]);

    await startUpload();

    expect(screen.getByText('Uploaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(uploadButton()).toBeDisabled();
  });

  it('keeps offering the upload when storage refused the file', async () => {
    storage.refused = ['notes.txt'];
    await openDialog();
    await choose([getFile('notes.txt')]);

    await startUpload();

    expect(screen.queryByText('Uploaded')).toBeNull();
    expect(uploadButton()).toBeEnabled();
    expect(enqueue.inputs).toEqual([]);
  });

  // Pressing Upload and being told nothing is the worst version of this. Storage answers per file,
  // so the reason goes on that file's row.
  it('says on the row why storage refused a file', async () => {
    storage.refused = ['notes.txt'];
    await openDialog();
    await choose([getFile('notes.txt'), getFile('plan.md')]);

    await startUpload();

    expect(screen.getByText('notes.txt already exists')).toBeInTheDocument();
    // The one that went up is unaffected and still reads as done.
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
  });
});
