import type { StageProject } from '../composition/types';

export const abortError = () =>
  new DOMException('Video export was cancelled.', 'AbortError');
export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

/** Reject promptly on cancel while still observing the underlying promise's outcome. */
export function abortable<T>(
  promise: PromiseLike<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return Promise.resolve(promise);
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export interface RenderSnapshot {
  project: StageProject;
  release: () => void;
}
export interface SnapshotOptions {
  assets?: ReadonlyMap<string, Blob>;
  signal?: AbortSignal;
  fetchAsset?: (src: string, signal?: AbortSignal) => Promise<Blob>;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
}
const fetchAsset = async (src: string, signal?: AbortSignal) => {
  const response = await fetch(src, { signal });
  if (!response.ok)
    throw new Error(
      'A screenshot could not be loaded for export. Replace it and try again.',
    );
  return response.blob();
};

/** Copies metadata before yielding, and owns independent URLs backed by immutable image bytes. */
export async function createRenderSnapshot(
  project: StageProject,
  options: SnapshotOptions = {},
): Promise<RenderSnapshot> {
  const copy = structuredClone(project);
  const bytes = options.assets && new Map(options.assets);
  const create = options.createUrl ?? ((blob) => URL.createObjectURL(blob));
  const revoke = options.revokeUrl ?? ((url) => URL.revokeObjectURL(url));
  const urls: string[] = [];
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    options.signal?.removeEventListener('abort', release);
    for (const url of urls) revoke(url);
  };
  throwIfAborted(options.signal);
  options.signal?.addEventListener('abort', release, { once: true });
  try {
    // Start source fetches synchronously, before the caller can replace or revoke a source URL.
    const entries = Object.values(copy.assets).filter((a) => a !== undefined);
    const pending = entries.map(async (asset) => {
      const blob = bytes?.get(asset.id);
      if (bytes && !blob)
        throw new Error(
          `The ${asset.name || 'project'} screenshot is missing. Reopen the project and try again.`,
        );
      return blob
        ? Promise.resolve(blob)
        : (options.fetchAsset ?? fetchAsset)(asset.src, options.signal);
    });
    const blobs = await abortable(Promise.all(pending), options.signal);
    throwIfAborted(options.signal);
    entries.forEach((asset, index) => {
      if (!blobs[index].size)
        throw new Error('An empty screenshot cannot be exported.');
      const url = create(blobs[index]);
      urls.push(url);
      asset.src = url;
      Object.freeze(asset);
    });
    Object.freeze(copy.assets);
    Object.freeze(copy.focalPoint);
    Object.freeze(copy);
    return { project: copy, release };
  } catch (error) {
    release();
    throw error;
  }
}

export async function waitForImages(
  project: StageProject,
  signal?: AbortSignal,
): Promise<void> {
  const images: HTMLImageElement[] = [];
  try {
    await abortable(
      Promise.all(
        Object.values(project.assets)
          .filter((a) => a !== undefined)
          .map(async (asset) => {
            const image = new Image();
            images.push(image);
            image.src = asset.src;
            try {
              await image.decode();
            } catch {
              throw new Error(
                `The ${asset.name || 'project'} screenshot could not be decoded for export.`,
              );
            }
            if (!image.naturalWidth || !image.naturalHeight)
              throw new Error('A screenshot has no decodable pixels.');
          }),
      ),
      signal,
    );
  } finally {
    for (const image of images) image.removeAttribute('src');
  }
}
