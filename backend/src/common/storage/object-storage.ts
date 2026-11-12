import type { Readable } from 'node:stream';

export interface StoredObject {
  body: Readable;
  contentType: string;
  size?: number;
}

export abstract class ObjectStorage {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  abstract get(key: string): Promise<StoredObject | null>;
  /** A missing key is not an error, so retried deletes are safe */
  abstract delete(key: string): Promise<void>;
}
