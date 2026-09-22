import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { useDropzone, type DropzoneState, type FileError } from 'react-dropzone';
import { describe, expect, it, vi } from 'vitest';

import type { UseSupabaseUploadReturn } from '@/hooks/use-supabase-upload';

import { Dropzone, DropzoneContent, DropzoneEmptyState, formatBytes } from './dropzone';

const user = userEvent.setup({ delay: null });

/** What the upload hook contributes on top of react-dropzone's own state. */
type UploadState = Omit<UseSupabaseUploadReturn, keyof DropzoneState>;
type UploadFile = UploadState['files'][number];
type DragState = Pick<DropzoneState, 'isDragActive' | 'isDragReject'>;

type FileSpec = {
  name: string;
  type: string;
  bytes: number;
  errors: readonly FileError[];
};

const droppedFile = (overrides: Partial<FileSpec> = {}): UploadFile => {
  const spec: FileSpec = {
    name: 'quarterly-plan.pdf',
    type: 'application/pdf',
    bytes: 2000,
    errors: [],
    ...overrides,
  };

  const file = new File([new Uint8Array(spec.bytes)], spec.name, { type: spec.type });
  return Object.assign(file, { preview: `blob:${spec.name}`, errors: spec.errors });
};

const uploadState = (overrides: Partial<UploadState> = {}): UploadState => ({
  files: [],
  setFiles: () => {},
  reset: () => {},
  successes: [],
  isSuccess: false,
  loading: false,
  errors: [],
  setErrors: () => {},
  onUpload: async () => {},
  maxFileSize: 50 * 1000 * 1000,
  maxFiles: 10,
  allowedMimeTypes: ['application/pdf'],
  ...overrides,
});

const dragState = (overrides: Partial<DragState> = {}): DragState => ({
  isDragActive: false,
  isDragReject: false,
  ...overrides,
});

/** The real react-dropzone state, with only what the upload hook owns controlled here. */
function UploadArea({ state, drag }: { state: UploadState; drag: DragState }) {
  const [files, setFiles] = useState<UploadFile[]>([...state.files]);
  const dropzone = useDropzone({ noClick: true, multiple: true });

  return (
    <Dropzone {...dropzone} {...state} {...drag} files={files} setFiles={setFiles}>
      <DropzoneEmptyState />
      <DropzoneContent />
    </Dropzone>
  );
}

function renderArea(state: Partial<UploadState> = {}, drag: Partial<DragState> = {}) {
  return render(<UploadArea state={uploadState(state)} drag={dragState(drag)} />);
}

const removeControls = () => screen.queryAllByRole('button').filter((b) => b.textContent === '');

describe('the drop area before anything is dropped', () => {
  it('says how many files may be sent and how big each one may be', () => {
    renderArea({ maxFiles: 10, maxFileSize: 50 * 1000 * 1000 });

    expect(screen.getByText('Upload 10 files')).toBeInTheDocument();
    expect(screen.getByText('Maximum file size: 50 MB')).toBeInTheDocument();
  });

  it('speaks in the singular when only one file is allowed', () => {
    renderArea({ maxFiles: 1 });

    expect(screen.getByText('Upload file')).toBeInTheDocument();
    expect(screen.getByText('select file')).toBeInTheDocument();
  });

  it('mentions no size limit when there is none to mention', () => {
    renderArea({ maxFileSize: Number.POSITIVE_INFINITY });

    expect(screen.queryByText(/maximum file size/i)).not.toBeInTheDocument();
  });

  it('opens the file picker from the words that offer it', async () => {
    const { container } = renderArea();
    const picker = container.querySelector('input[type="file"]');
    const opened = vi.fn();
    picker?.addEventListener('click', opened);

    await user.click(screen.getByText('select files'));

    expect(opened).toHaveBeenCalled();
  });

  it('gets out of the way once every file is in', () => {
    renderArea({ files: [droppedFile()], successes: ['quarterly-plan.pdf'], isSuccess: true });

    expect(screen.queryByText(/drag and drop/i)).not.toBeInTheDocument();
  });
});

describe('what the drop area shows while a file is over it', () => {
  it('lights up while something is being dragged in', () => {
    const { container } = renderArea({}, { isDragActive: true });

    expect(container.firstElementChild).toHaveClass('border-border-brand');
  });

  it('turns hostile while what is being dragged cannot be taken', () => {
    const { container } = renderArea({}, { isDragActive: true, isDragReject: true });

    expect(container.firstElementChild).toHaveClass('border-border-destructive');
  });

  it('stays hostile after a drop that failed to upload', () => {
    const { container } = renderArea({
      files: [droppedFile()],
      errors: [{ name: 'quarterly-plan.pdf', message: 'Bucket is full' }],
    });

    expect(container.firstElementChild).toHaveClass('border-border-destructive');
  });

  it('turns hostile when a file on the list was refused before it was ever sent', () => {
    const { container } = renderArea({
      files: [
        droppedFile({ errors: [{ code: 'file-invalid-type', message: 'File type must be PDF' }] }),
      ],
    });

    expect(container.firstElementChild).toHaveClass('border-border-destructive');
  });
});

describe('the files waiting to be uploaded', () => {
  it('shows each file with its size', () => {
    renderArea({ files: [droppedFile({ name: 'quarterly-plan.pdf', bytes: 2000 })] });

    expect(screen.getByText('quarterly-plan.pdf')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
  });

  it('shows a picture as itself rather than as a generic file', () => {
    renderArea({ files: [droppedFile({ name: 'diagram.png', type: 'image/png' })] });

    expect(screen.getByRole('img', { name: 'diagram.png' })).toHaveAttribute(
      'src',
      'blob:diagram.png',
    );
  });

  it('says how big a rejected file was against the limit it broke, in units a person reads', () => {
    renderArea({
      maxFileSize: 1000,
      files: [
        droppedFile({
          bytes: 2000,
          errors: [{ code: 'file-too-large', message: 'File is larger than 1000 bytes' }],
        }),
      ],
    });

    expect(screen.getByText('File is larger than 1 KB (Size: 2 KB)')).toBeInTheDocument();
  });

  it('repeats a rejection that was not about size in the words it came in', () => {
    renderArea({
      files: [
        droppedFile({
          errors: [{ code: 'file-invalid-type', message: 'File type must be application/pdf' }],
        }),
      ],
    });

    expect(screen.getByText('File type must be application/pdf')).toBeInTheDocument();
  });

  it('joins every reason a file was refused rather than showing only the first', () => {
    renderArea({
      files: [
        droppedFile({
          errors: [
            { code: 'file-invalid-type', message: 'File type must be application/pdf' },
            { code: 'too-many-files', message: 'Too many files' },
          ],
        }),
      ],
    });

    expect(
      screen.getByText('File type must be application/pdf, Too many files'),
    ).toBeInTheDocument();
  });

  it('says a file is on its way while it is in flight', () => {
    renderArea({ files: [droppedFile()], loading: true });

    expect(screen.getByText('Uploading file…')).toBeInTheDocument();
  });

  it('names the file the upload failed on and why, instead of leaving it looking fine', () => {
    renderArea({
      files: [droppedFile({ name: 'quarterly-plan.pdf' })],
      errors: [{ name: 'quarterly-plan.pdf', message: 'Bucket is full' }],
    });

    expect(screen.getByText('Failed to upload: Bucket is full')).toBeInTheDocument();
  });

  it('separates the file that got through from the one that did not', () => {
    renderArea({
      files: [droppedFile({ name: 'in.pdf' }), droppedFile({ name: 'out.pdf' })],
      successes: ['in.pdf'],
      errors: [{ name: 'out.pdf', message: 'Bucket is full' }],
    });

    expect(screen.getByText('Successfully uploaded file')).toBeInTheDocument();
    expect(screen.getByText('Failed to upload: Bucket is full')).toBeInTheDocument();
  });

  it('takes a file off the list when it is removed', async () => {
    renderArea({ files: [droppedFile({ name: 'keep.pdf' }), droppedFile({ name: 'drop.pdf' })] });

    await user.click(removeControls()[1]);

    expect(screen.queryByText('drop.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('keep.pdf')).toBeInTheDocument();
  });

  it('offers no way to pull a file back once it is uploading', () => {
    renderArea({ files: [droppedFile()], loading: true });

    expect(removeControls()).toHaveLength(0);
  });

  it('offers no way to remove a file that is already uploaded', () => {
    renderArea({ files: [droppedFile({ name: 'in.pdf' })], successes: ['in.pdf'] });

    expect(removeControls()).toHaveLength(0);
  });

  it('starts the upload when the button is pressed', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    renderArea({ files: [droppedFile()], onUpload });

    await user.click(screen.getByRole('button', { name: 'Upload files' }));

    expect(onUpload).toHaveBeenCalled();
  });

  it('refuses to start while any file on the list is rejected', () => {
    renderArea({
      files: [
        droppedFile({ name: 'good.pdf' }),
        droppedFile({
          name: 'bad.exe',
          errors: [{ code: 'file-invalid-type', message: 'File type must be application/pdf' }],
        }),
      ],
    });

    expect(screen.getByRole('button', { name: 'Upload files' })).toBeDisabled();
  });

  it('shows the upload as running rather than as ready to start again', () => {
    renderArea({ files: [droppedFile()], loading: true });

    expect(screen.getByRole('button', { name: 'Uploading…' })).toBeDisabled();
  });
});

describe('more files than the space will take', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_unused, index) => droppedFile({ name: `file-${index}.pdf` }));

  it('says exactly how many files have to go', () => {
    renderArea({ files: many(12), maxFiles: 10 });

    expect(
      screen.getByText('You may upload only up to 10 files, please remove 2 files.'),
    ).toBeInTheDocument();
  });

  it('asks for one file back in the singular when one is all that is over', () => {
    renderArea({ files: many(11), maxFiles: 10 });

    expect(
      screen.getByText('You may upload only up to 10 files, please remove 1 file.'),
    ).toBeInTheDocument();
  });

  it('withholds the upload button until the list is back under the limit', () => {
    renderArea({ files: many(12), maxFiles: 10 });

    expect(screen.queryByRole('button', { name: 'Upload files' })).not.toBeInTheDocument();
  });
});

describe('after the upload finishes', () => {
  it('counts the files that went in', () => {
    renderArea({
      files: [droppedFile({ name: 'a.pdf' }), droppedFile({ name: 'b.pdf' })],
      successes: ['a.pdf', 'b.pdf'],
      isSuccess: true,
    });

    expect(screen.getByText('Successfully uploaded 2 files')).toBeInTheDocument();
  });

  it('speaks in the singular about a single file', () => {
    renderArea({ files: [droppedFile()], successes: ['quarterly-plan.pdf'], isSuccess: true });

    expect(screen.getByText('Successfully uploaded 1 file')).toBeInTheDocument();
  });
});

describe('file sizes as a person reads them', () => {
  it('counts in thousands, the way a storage bill does', () => {
    expect(formatBytes(1000)).toBe('1 KB');
    expect(formatBytes(1_500_000)).toBe('1.5 MB');
    expect(formatBytes(2_000_000_000)).toBe('2 GB');
  });

  it('says nothing rather than a fraction when there is nothing to measure', () => {
    expect(formatBytes(0)).toBe('0 bytes');
    expect(formatBytes(0, 2, 'MB')).toBe('0 MB');
  });

  it('holds a size in the unit it was asked for', () => {
    expect(formatBytes(1500, 0, 'bytes')).toBe('1500 bytes');
  });

  it('rounds to whole units when asked for no decimals at all', () => {
    expect(formatBytes(1536, -1)).toBe('2 KB');
  });
});

describe('a file list built outside a drop area', () => {
  it('fails loudly rather than rendering an upload nothing is driving', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<DropzoneContent />)).toThrow(
      'useDropzoneContext must be used within a Dropzone',
    );

    quiet.mockRestore();
  });
});
