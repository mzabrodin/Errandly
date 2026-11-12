import sharp from 'sharp';

import { DomainError } from '../common/errors/domain-error.js';

export const AVATAR_SIZE = 256;

const ACCEPTED_FORMATS: ReadonlySet<string> = new Set(['jpeg', 'png', 'webp', 'gif']);
// Guards against decompression bombs: a small file can declare a huge canvas
const MAX_PIXELS = 40_000_000;

function wrongType(): DomainError {
  return new DomainError('VALIDATION', { fields: { file: 'type' } });
}

/** Re-encoding drops EXIF and GPS data (NFR-LEG-01) */
export async function toAvatarImage(upload: Buffer): Promise<Buffer> {
  const metadata = await sharp(upload)
    .metadata()
    .catch(() => {
      throw wrongType();
    });
  if (!ACCEPTED_FORMATS.has(metadata.format)) throw wrongType();
  if (metadata.width * metadata.height > MAX_PIXELS) throw new DomainError('FILE_TOO_LARGE');

  return sharp(upload, { limitInputPixels: MAX_PIXELS, animated: false })
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
    .webp({ quality: 85 })
    .toBuffer()
    .catch(() => {
      throw wrongType();
    });
}
