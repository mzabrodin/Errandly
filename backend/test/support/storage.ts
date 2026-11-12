import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { ObjectStorage, type StoredObject } from '../../src/common/storage/object-storage.js';
import type { S3ObjectStorage } from '../../src/common/storage/s3-object-storage.js';

/** The real S3 storage (SeaweedFS); `failNext` emulates a storage outage */
export class FlakyObjectStorage extends ObjectStorage implements OnModuleInit, OnModuleDestroy {
  private failures = 0;

  constructor(private readonly inner: S3ObjectStorage) {
    super();
  }

  onModuleInit(): Promise<void> {
    return this.inner.onModuleInit();
  }

  onModuleDestroy(): void {
    this.inner.onModuleDestroy();
  }

  failNext(count = 1): void {
    this.failures = count;
  }

  clear(): void {
    this.failures = 0;
  }

  put(key: string, body: Buffer, contentType: string): Promise<void> {
    return this.outage() ?? this.inner.put(key, body, contentType);
  }

  get(key: string): Promise<StoredObject | null> {
    return this.outage() ?? this.inner.get(key);
  }

  delete(key: string): Promise<void> {
    return this.outage() ?? this.inner.delete(key);
  }

  private outage(): Promise<never> | undefined {
    if (this.failures === 0) return undefined;
    this.failures -= 1;
    return Promise.reject(new Error('Object storage is down'));
  }
}
