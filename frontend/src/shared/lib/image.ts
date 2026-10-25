export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_SIZE = 256;

export class ImageError extends Error {
  readonly code: 'type' | 'size' | 'decode';

  constructor(code: 'type' | 'size' | 'decode') {
    super(code);
    this.code = code;
  }
}

/**
 * Обрізає фото по центру до квадрата й зменшує до 256×256 (WebP, якщо браузер уміє).
 * Так на сервер іде ~20–40 КБ замість кількох мегабайтів з телефона.
 */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new ImageError('type');
  if (file.size > MAX_AVATAR_BYTES) throw new ImageError('size');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError('decode');
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageError('decode');
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();

  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const blob = (await toBlob('image/webp')) ?? (await toBlob('image/jpeg'));
  if (!blob) throw new ImageError('decode');
  return blob;
}
