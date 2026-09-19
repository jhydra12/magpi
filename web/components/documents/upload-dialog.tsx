'use client';

import { Upload, X } from 'lucide-react';
import { useState } from 'react';

import { enqueueUploadedDocument } from '@/app/(app)/documents/actions';
import { FormError } from '@/components/auth/form-error';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSupabaseUpload } from '@/hooks/use-supabase-upload';
import { ACCEPTED_MIME_TYPES, acceptedTypeFor, MAX_UPLOAD_BYTES } from '@/lib/documents/uploads';
import { cn } from '@/lib/utils';

const MAX_FILES = 50;

/** Past this many the list scrolls rather than pushing the buttons off the screen. */
const ROWS_BEFORE_SCROLL = 7;

const formatSize = (bytes: number): string =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.ceil(bytes / 1000)} KB`;

/** Only what the picker renders, so any caller holding spaces can open this. */
export type SpaceChoice = { readonly id: string; readonly name: string };

export function UploadDialog({ spaces }: { spaces: readonly SpaceChoice[] }) {
  const [open, setOpen] = useState(false);
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const upload = useSupabaseUpload({
    bucketName: 'documents',
    // The storage policy reads this first path segment back against the caller's spaces.
    path: spaceId,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxFileSize: MAX_UPLOAD_BYTES,
    maxFiles: MAX_FILES,
    onUploaded: async (file) => {
      const mimeType = acceptedTypeFor(file.type, file.name);
      if (!mimeType) throw new Error(`${file.name} is not a kind of file that can be read.`);
      const state = await enqueueUploadedDocument({
        spaceId,
        objectName: file.name,
        title: file.name,
        mimeType,
      });
      if (state.status === 'error') {
        setError(state.message);
        throw new Error(state.message);
      }
    },
  });

  const {
    files,
    setFiles,
    reset,
    successes,
    errors,
    loading,
    onUpload,
    getRootProps,
    getInputProps,
  } = upload;

  const startUpload = async () => {
    setError(null);
    await onUpload();
  };

  const done = files.length > 0 && files.every((file) => successes.includes(file.name));

  const close = () => {
    if (loading) return;
    setOpen(false);
    reset();
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else close();
      }}
    >
      <DialogTrigger asChild>
        <Button>Upload documents now</Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload documents</DialogTitle>
          <DialogDescription>Drop as many files as you like.</DialogDescription>
        </DialogHeader>

        <FormError message={error} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="upload-space">Put these in</Label>
          <Select value={spaceId} onValueChange={setSpaceId} disabled={loading}>
            <SelectTrigger id="upload-space" className="w-full">
              <SelectValue placeholder="Choose a space" />
            </SelectTrigger>
            <SelectContent>
              {spaces.map((space) => (
                <SelectItem key={space.id} value={space.id}>
                  {space.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div
          {...getRootProps({
            className: cn(
              'flex cursor-pointer flex-col items-center gap-1 rounded-[var(--radius-panel)] border border-dashed border-border px-4 py-6 text-center transition-colors motion-reduce:transition-none',
              'hover:border-border-stronger hover:bg-muted',
            ),
          })}
        >
          <input {...getInputProps()} />
          <Upload className="size-5 text-tertiary-foreground" />
          <p className="text-sm text-foreground">Drag and drop, or click to choose</p>
          <p className="text-xs text-tertiary-foreground">
            Up to {MAX_FILES} files, {formatSize(MAX_UPLOAD_BYTES)} each
          </p>
        </div>

        {files.length > 0 ? (
          <ul
            aria-label="Files to upload"
            className={cn(
              'divide-y divide-border rounded-[var(--radius-panel)] border border-border',
              files.length > ROWS_BEFORE_SCROLL && 'max-h-64 overflow-y-auto',
            )}
          >
            {files.map((file) => {
              const uploaded = successes.includes(file.name);
              // Storage answers per file, so its refusal belongs on that file's row.
              const refusal = errors.find((entry) => entry.name === file.name)?.message;
              return (
                <li key={file.name} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {file.name}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-xs',
                      refusal ? 'text-destructive-600' : 'text-tertiary-foreground',
                    )}
                  >
                    {refusal ?? (uploaded ? 'Uploaded' : formatSize(file.size))}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    disabled={loading || uploaded}
                    onClick={() => setFiles(files.filter((other) => other.name !== file.name))}
                    className="shrink-0 rounded text-tertiary-foreground hover:text-foreground disabled:opacity-40"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={loading}>
            {done ? 'Done' : 'Cancel'}
          </Button>
          <Button
            onClick={() => void startUpload()}
            disabled={!spaceId || files.length === 0 || loading || done}
          >
            {loading ? 'Uploading' : `Upload${files.length > 0 ? ` ${files.length}` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
