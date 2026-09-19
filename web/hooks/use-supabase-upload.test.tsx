import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useSupabaseUpload,
  type UseSupabaseUploadOptions,
  type UseSupabaseUploadReturn,
} from './use-supabase-upload';

type StorageCall = {
  readonly bucket: string;
  readonly objectPath: string;
  readonly cacheControl: string;
  readonly upsert: boolean;
};

const storage = {
  calls: [] as StorageCall[],
  rejected: [] as string[],
  throws: false,
  /** Set to hold every upload open, so the in-flight state can be read. */
  gate: null as Promise<void> | null,
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: async (
          objectPath: string,
          _file: File,
          options: { cacheControl: string; upsert: boolean },
        ) => {
          storage.calls.push({ bucket, objectPath, ...options });
          if (storage.throws) throw new Error('connection lost');
          if (storage.gate) await storage.gate;
          const name = objectPath.split('/').at(-1) ?? objectPath;
          return storage.rejected.includes(name)
            ? { error: { message: `${name} already exists` } }
            : { error: null };
        },
      }),
    },
  }),
}));

/** What the hook returned on its last render, which is the whole of what a caller sees. */
let current: UseSupabaseUploadReturn;

function Probe({ options }: { options: UseSupabaseUploadOptions }) {
  const upload = useSupabaseUpload(options);
  // After the commit rather than during the render, so reading it never races a render.
  useEffect(() => {
    current = upload;
  });
  return <input data-testid="picker" {...upload.getInputProps()} />;
}

const getOptions = (overrides: Partial<UseSupabaseUploadOptions> = {}): UseSupabaseUploadOptions =>
  ({
    bucketName: 'documents',
    path: 'space-1',
    allowedMimeTypes: ['text/markdown', 'application/pdf'],
    maxFileSize: 1000,
    maxFiles: 2,
    ...overrides,
  }) satisfies UseSupabaseUploadOptions;

const getFile = (name: string, type = 'text/markdown', bytes = 10) =>
  new File([new Uint8Array(bytes)], name, { type });

async function pick(files: readonly File[]) {
  await act(async () => {
    fireEvent.change(screen.getByTestId('picker'), { target: { files } });
  });
}

/** Anything that sets state has to settle before the next assertion reads it. */
async function commit(change: () => void | Promise<void>) {
  await act(async () => {
    await change();
  });
}

beforeEach(() => {
  storage.calls = [];
  storage.rejected = [];
  storage.throws = false;
  storage.gate = null;
  vi.stubGlobal('URL', {
    ...URL,
    revokeObjectURL: vi.fn(),
    createObjectURL: (file: Blob) => `blob:${(file as File).name}`,
  });
});

describe('choosing files to upload', () => {
  it('holds on to a chosen file with something to preview it by', async () => {
    render(<Probe options={getOptions()} />);

    await pick([getFile('notes.md')]);

    expect(current.files.map((file) => file.name)).toEqual(['notes.md']);
    expect(current.files[0].preview).toBe('blob:notes.md');
    expect(current.files[0].errors).toEqual([]);
  });

  it('keeps one entry when the same file is chosen twice', async () => {
    render(<Probe options={getOptions()} />);

    await pick([getFile('notes.md')]);
    await pick([getFile('notes.md')]);

    expect(current.files).toHaveLength(1);
  });

  it('marks a file the browser reports as too big', async () => {
    render(<Probe options={getOptions()} />);

    await pick([getFile('huge.md', 'text/markdown', 2000)]);

    expect(current.files[0].errors.map((error) => error.code)).toEqual(['file-too-large']);
  });

  it('marks a kind of file the caller does not accept', async () => {
    render(<Probe options={getOptions()} />);

    await pick([getFile('logo.png', 'image/png')]);

    expect(current.files[0].errors.map((error) => error.code)).toEqual(['file-invalid-type']);
  });

  it('accepts any kind when the caller names none', async () => {
    render(<Probe options={getOptions({ allowedMimeTypes: [] })} />);

    await pick([getFile('logo.png', 'image/png')]);

    expect(current.files[0].errors).toEqual([]);
  });

  it('accepts any size when the caller sets no ceiling', async () => {
    render(<Probe options={getOptions({ maxFileSize: undefined })} />);

    await pick([getFile('huge.md', 'text/markdown', 5000)]);

    expect(current.files[0].errors).toEqual([]);
  });

  it('marks the files that put the set over the limit', async () => {
    render(<Probe options={getOptions()} />);

    await pick([getFile('one.md'), getFile('two.md'), getFile('three.md')]);

    expect(current.files.map((file) => file.errors.map((error) => error.code))).toEqual([
      [],
      [],
      ['too-many-files'],
    ]);
  });

  // The marker says the set is too big, so getting back under the limit clears it everywhere.
  it('clears the too-many marker once the set is back under the limit', async () => {
    render(<Probe options={getOptions()} />);
    await pick([getFile('one.md'), getFile('two.md'), getFile('three.md')]);

    await commit(() => current.setFiles(current.files.slice(2)));
    await pick([getFile('four.md')]);

    expect(current.files.map((file) => file.name)).toEqual(['three.md', 'four.md']);
    for (const file of current.files) {
      expect(file.errors).toEqual([]);
    }
  });
});

describe('uploading what was chosen', () => {
  it('puts the file under the path the caller named', async () => {
    render(<Probe options={getOptions()} />);
    await pick([getFile('notes.md')]);

    await commit(() => current.onUpload());

    expect(storage.calls).toEqual([
      { bucket: 'documents', objectPath: 'space-1/notes.md', cacheControl: '3600', upsert: false },
    ]);
    expect(current.successes).toEqual(['notes.md']);
  });

  it('puts the file at the root of the bucket when the caller names no path', async () => {
    render(<Probe options={getOptions({ path: undefined })} />);
    await pick([getFile('notes.md')]);

    await commit(() => current.onUpload());

    expect(storage.calls[0].objectPath).toBe('notes.md');
  });

  it('passes the caching and overwrite choices through to storage', async () => {
    render(<Probe options={getOptions({ cacheControl: 60, upsert: true })} />);
    await pick([getFile('notes.md')]);

    await commit(() => current.onUpload());

    expect(storage.calls[0]).toMatchObject({ cacheControl: '60', upsert: true });
  });

  it('reads as done only when every chosen file is up', async () => {
    render(<Probe options={getOptions()} />);
    await pick([getFile('one.md'), getFile('two.md')]);
    expect(current.isSuccess).toBe(false);

    storage.rejected = ['two.md'];
    await commit(() => current.onUpload());
    expect(current.isSuccess).toBe(false);

    storage.rejected = [];
    await commit(() => current.onUpload());
    expect(current.isSuccess).toBe(true);
  });

  it('reports the reason storage refused a file', async () => {
    storage.rejected = ['notes.md'];
    render(<Probe options={getOptions()} />);
    await pick([getFile('notes.md')]);

    await commit(() => current.onUpload());

    expect(current.errors).toEqual([{ name: 'notes.md', message: 'notes.md already exists' }]);
    expect(current.successes).toEqual([]);
  });

  // Hitting upload again after a partial failure retries what failed, not what already went.
  it('retries only the file that failed', async () => {
    storage.rejected = ['two.md'];
    render(<Probe options={getOptions()} />);
    await pick([getFile('one.md'), getFile('two.md')]);
    await commit(() => current.onUpload());
    storage.calls = [];

    storage.rejected = [];
    await commit(() => current.onUpload());

    expect(storage.calls.map((call) => call.objectPath)).toEqual(['space-1/two.md']);
    expect(current.errors).toEqual([]);
    expect(current.successes).toEqual(['one.md', 'two.md']);
  });

  // A failed file is in both lists, so one request per list would write the same object twice.
  it('sends one request per file when a retry covers both a failure and a file never tried', async () => {
    storage.rejected = ['one.md'];
    render(<Probe options={getOptions()} />);
    await pick([getFile('one.md')]);
    await commit(() => current.onUpload());
    await pick([getFile('two.md')]);
    storage.calls = [];

    storage.rejected = [];
    await commit(() => current.onUpload());

    expect(storage.calls.map((call) => call.objectPath).sort()).toEqual([
      'space-1/one.md',
      'space-1/two.md',
    ]);
    expect(current.successes.sort()).toEqual(['one.md', 'two.md']);
  });

  // An upload error belongs to a file, so the red state goes when the file does.
  it('forgets an upload error once the file it was about is gone', async () => {
    storage.rejected = ['notes.md'];
    render(<Probe options={getOptions()} />);
    await pick([getFile('notes.md')]);
    await commit(() => current.onUpload());
    expect(current.errors).toHaveLength(1);

    await commit(() => current.setFiles([]));

    await waitFor(() => expect(current.errors).toEqual([]));
    expect(current.isSuccess).toBe(false);
  });

  it('lets a caller put an error back on the list', async () => {
    render(<Probe options={getOptions()} />);
    await pick([getFile('notes.md')]);

    await commit(() => current.setErrors([{ name: 'notes.md', message: 'Refused upstream' }]));

    await waitFor(() =>
      expect(current.errors).toEqual([{ name: 'notes.md', message: 'Refused upstream' }]),
    );
  });

  it('says it is working while storage has not answered', async () => {
    let release = () => {};
    storage.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    render(<Probe options={getOptions()} />);
    await pick([getFile('notes.md')]);

    const finished = current.onUpload();
    await waitFor(() => expect(current.loading).toBe(true));

    release();
    await commit(() => finished);
    expect(current.loading).toBe(false);
  });
});

it('never uploads invalid files', async () => {
  render(<Probe options={getOptions()} />);
  await pick([getFile('huge.md', 'text/markdown', 2000), getFile('logo.png', 'image/png')]);
  await commit(() => current.onUpload());
  expect(storage.calls).toEqual([]);
  expect(current.errors).toHaveLength(2);
  expect(current.loading).toBe(false);
});

it('retries failed enqueue without sending the file to storage again', async () => {
  const onUploaded = vi
    .fn()
    .mockRejectedValueOnce(new Error('queue unavailable'))
    .mockResolvedValue(undefined);
  render(<Probe options={getOptions({ onUploaded })} />);
  await pick([getFile('notes.md')]);
  await commit(() => current.onUpload());
  expect(current.isSuccess).toBe(false);
  expect(current.loading).toBe(false);
  await commit(() => current.onUpload());
  expect(current.isSuccess).toBe(true);
  expect(storage.calls).toHaveLength(1);
  expect(onUploaded).toHaveBeenCalledTimes(2);
});

it('does not complete before enqueue finishes', async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  render(<Probe options={getOptions({ onUploaded: () => gate })} />);
  await pick([getFile('notes.md')]);
  let finished: Promise<void>;
  await act(async () => {
    finished = current.onUpload();
  });
  expect(current.loading).toBe(true);
  expect(current.isSuccess).toBe(false);
  await act(async () => {
    release();
    await finished;
  });
  expect(current.isSuccess).toBe(true);
});

it('limits unfinished file operations to four', async () => {
  let release = () => {};
  storage.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  render(<Probe options={getOptions({ maxFiles: 8 })} />);
  await pick(Array.from({ length: 8 }, (_, i) => getFile(`${i}.md`)));
  let finished: Promise<void>;
  await act(async () => {
    finished = current.onUpload();
  });
  expect(storage.calls).toHaveLength(4);
  await act(async () => {
    release();
    await finished;
  });
  expect(storage.calls).toHaveLength(8);
});

it('revokes removed and unmounted preview URLs', async () => {
  const view = render(<Probe options={getOptions()} />);
  await pick([getFile('one.md'), getFile('two.md')]);
  await commit(() => current.setFiles(current.files.slice(1)));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:one.md');
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:two.md');
});

it('recovers from a thrown storage transport error', async () => {
  storage.throws = true;
  render(<Probe options={getOptions()} />);
  await pick([getFile('notes.md')]);
  await commit(() => current.onUpload());
  expect(current.loading).toBe(false);
  expect(current.errors).toEqual([{ name: 'notes.md', message: 'connection lost' }]);
  storage.throws = false;
  await commit(() => current.onUpload());
  expect(current.isSuccess).toBe(true);
});
