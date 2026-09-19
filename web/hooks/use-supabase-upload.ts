import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone, type FileError, type FileRejection } from 'react-dropzone';

import { createClient } from '@/lib/supabase/client';

interface FileWithPreview extends File {
  preview?: string;
  errors: readonly FileError[];
}

type UseSupabaseUploadOptions = {
  /** Name of the bucket to upload files to. */
  bucketName: string;
  /** Folder within the bucket. Defaults to the root. */
  path?: string;
  /** Allowed MIME types, wildcards included. Defaults to all of them. */
  allowedMimeTypes?: string[];
  /** Maximum size of each file, in bytes. */
  maxFileSize?: number;
  /** Maximum number of files allowed per upload. */
  maxFiles?: number;
  /** Seconds to cache the asset for, sent as Cache-Control max-age. Defaults to 3600. */
  cacheControl?: number;
  /** Overwrite a file that already exists, rather than erroring. Defaults to false. */
  upsert?: boolean;
  /** Completes ingestion setup after Storage succeeds; failed setup is retryable. */
  onUploaded?: (file: File) => Promise<void>;
};

type UseSupabaseUploadReturn = ReturnType<typeof useSupabaseUpload>;

/** Stable identity, so the derived value below does not change on every render. */
const EMPTY_ERRORS: { name: string; message: string }[] = [];

const useSupabaseUpload = (options: UseSupabaseUploadOptions) => {
  const {
    bucketName,
    path,
    allowedMimeTypes = [],
    maxFileSize = Number.POSITIVE_INFINITY,
    maxFiles = 1,
    cacheControl = 3600,
    upsert = false,
    onUploaded,
  } = options;

  const uploaded = useRef(new Set<string>());
  const previews = useRef(new Set<string>());
  const busy = useRef(false);
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadErrors, setErrors] = useState<{ name: string; message: string }[]>([]);

  // An upload error belongs to a file, so with no files there are no errors.
  const errors = files.length === 0 ? EMPTY_ERRORS : uploadErrors;
  const [successes, setSuccesses] = useState<string[]>([]);

  const isSuccess = useMemo(() => {
    if (errors.length === 0 && successes.length === 0) {
      return false;
    }
    if (errors.length === 0 && successes.length === files.length) {
      return true;
    }
    return false;
  }, [errors.length, successes.length, files.length]);

  useEffect(() => {
    const active = new Set(files.map((file) => file.preview));
    for (const url of previews.current) {
      if (!active.has(url)) {
        URL.revokeObjectURL(url);
        previews.current.delete(url);
      }
    }
  }, [files]);
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      // Object.assign rather than a cast, because the dropzone hands back a plain File.
      const decorate = (file: File, fileErrors: readonly FileError[]): FileWithPreview => {
        const preview = URL.createObjectURL(file);
        previews.current.add(preview);
        return Object.assign(file, { preview, errors: fileErrors });
      };

      const validFiles = acceptedFiles
        .filter((file) => !files.find((existing) => existing.name === file.name))
        .map((file) => decorate(file, []));

      const invalidFiles = fileRejections.map(({ file, errors }) => decorate(file, errors));

      const newFiles = [...files, ...validFiles, ...invalidFiles];

      // The too-many-files marker holds only while the set is over the limit.
      const withinLimit = newFiles.length <= maxFiles;
      setFiles(
        withinLimit
          ? newFiles.map((file) =>
              file.errors.some((e) => e.code === 'too-many-files')
                ? Object.assign(file, {
                    errors: file.errors.filter((e) => e.code !== 'too-many-files'),
                  })
                : file,
            )
          : newFiles,
      );
    },
    [files, setFiles, maxFiles],
  );

  const dropzoneProps = useDropzone({
    onDrop,
    noClick: true,
    disabled: loading,
    accept: allowedMimeTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxSize: maxFileSize,
    maxFiles: maxFiles,
    multiple: maxFiles !== 1,
  });

  const onUpload = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    const failures: { name: string; message: string }[] = [];
    const completed: string[] = [];
    const pending = files.filter((file) => !successes.includes(file.name));
    try {
      const supabase = createClient();
      // Four requests at a time; each slot includes the ingestion enqueue step.
      for (let offset = 0; offset < pending.length; offset += 4) {
        await Promise.all(
          pending.slice(offset, offset + 4).map(async (file) => {
            try {
              const validation = file.errors[0];
              if (validation) throw new Error(validation.message);
              if (files.length > maxFiles) throw new Error(`Choose at most ${maxFiles} files.`);
              const objectPath = path ? `${path}/${file.name}` : file.name;
              const key = `${bucketName}/${objectPath}`;
              if (!uploaded.current.has(key)) {
                const { error } = await supabase.storage.from(bucketName).upload(objectPath, file, {
                  cacheControl: String(cacheControl),
                  upsert,
                });
                if (error) throw new Error(error.message);
                uploaded.current.add(key);
              }
              await onUploaded?.(file);
              completed.push(file.name);
            } catch (error) {
              failures.push({
                name: file.name,
                message: error instanceof Error ? error.message : 'Upload failed. Try again.',
              });
            }
          }),
        );
      }
      setErrors(failures);
      setSuccesses((current) => [...new Set([...current, ...completed])]);
    } catch (error) {
      setErrors(
        pending.map((file) => ({
          name: file.name,
          message: error instanceof Error ? error.message : 'Upload failed. Try again.',
        })),
      );
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [files, successes, path, bucketName, cacheControl, upsert, maxFiles, onUploaded]);

  /** Puts the hook back to how it opened, so the same file can be uploaded somewhere else. */
  const reset = useCallback(() => {
    uploaded.current.clear();
    setFiles([]);
    setSuccesses([]);
    setErrors([]);
  }, []);

  return {
    files,
    setFiles,
    reset,
    successes,
    isSuccess,
    loading,
    errors,
    setErrors,
    onUpload,
    maxFileSize: maxFileSize,
    maxFiles: maxFiles,
    allowedMimeTypes,
    ...dropzoneProps,
  };
};

export { useSupabaseUpload, type UseSupabaseUploadOptions, type UseSupabaseUploadReturn };
