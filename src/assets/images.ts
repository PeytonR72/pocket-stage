import type { AssetRecord } from '../model/project';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 24_000_000;
export async function detectImageType(
  blob: Blob,
): Promise<'image/png' | 'image/jpeg' | 'image/webp'> {
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (
    b[0] === 137 &&
    b[1] === 80 &&
    b[2] === 78 &&
    b[3] === 71 &&
    b[4] === 13 &&
    b[5] === 10 &&
    b[6] === 26 &&
    b[7] === 10
  )
    return 'image/png';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (
    String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  throw new Error('Choose a valid PNG, JPEG, or WebP screenshot.');
}
export function normalizedDimensions(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_IMAGE_PIXELS
  )
    throw new Error('Screenshots must be 24 megapixels or smaller.');
  const scale = Math.min(1, 2560 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
export async function normalizeImage(
  blob: Blob,
  name: string,
  options: { imported?: boolean } = {},
): Promise<AssetRecord> {
  if (
    !blob.size ||
    blob.size > (options.imported ? 32 * 1024 * 1024 : MAX_IMAGE_BYTES)
  )
    throw new Error(
      options.imported
        ? 'The embedded screenshot is too large.'
        : 'Screenshots must be 10 MB or smaller.',
    );
  await detectImageType(blob);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(
      'This image could not be decoded. Try another PNG, JPEG, or WebP.',
    );
  }
  try {
    const size = normalizedDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx)
      throw new Error('Image processing is unavailable in this browser.');
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const normalized = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error('The screenshot could not be normalized.')),
        'image/png',
      ),
    );
    if (normalized.size > 32 * 1024 * 1024)
      throw new Error(
        'The processed screenshot is too large. Try a smaller image.',
      );
    return {
      id: crypto.randomUUID(),
      blob: normalized,
      ...size,
      name: name.slice(0, 200) || 'Screenshot',
    };
  } finally {
    bitmap.close();
  }
}
