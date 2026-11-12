import { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../../config/env.validation.js';
import { ObjectStorage, type StoredObject } from './object-storage.js';

@Injectable()
export class S3ObjectStorage extends ObjectStorage implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(S3ObjectStorage.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super();
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    const accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', { infer: true });
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.client = new S3Client({
      region: config.get('S3_REGION', { infer: true }),
      ...(endpoint !== undefined && { endpoint }),
      // Self-hosted services like SeaweedFS don't support bucket subdomains
      forcePathStyle: true,
      // Without keys the SDK uses its default credential chain
      ...(accessKeyId !== undefined &&
        secretAccessKey !== undefined && { credentials: { accessKeyId, secretAccessKey } }),
    });
  }

  /** Storage being down must not stop the API from starting */
  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Object storage is not reachable (bucket ${this.bucket}): ${message}`);
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!(object.Body instanceof Readable)) throw new Error('S3 returned no readable body');
      return {
        body: object.Body,
        contentType: object.ContentType ?? 'application/octet-stream',
        ...(object.ContentLength !== undefined && { size: object.ContentLength }),
      };
    } catch (error: unknown) {
      if (error instanceof NoSuchKey || isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error: unknown) {
      if (!(error instanceof NotFound) && !isNotFound(error)) throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created the storage bucket ${this.bucket}`);
    }
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404;
}
