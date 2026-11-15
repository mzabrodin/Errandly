import { Injectable, type PipeTransform } from '@nestjs/common';

import { AUTH_PROVIDERS, type AuthProvider } from '../../common/domain.js';
import { DomainError } from '../../common/errors/domain-error.js';

/** An unknown provider is a route that does not exist */
@Injectable()
export class ParseAuthProvider implements PipeTransform<string, AuthProvider> {
  transform(value: string): AuthProvider {
    const provider = AUTH_PROVIDERS.find((candidate) => candidate === value);
    if (provider === undefined) throw new DomainError('NOT_FOUND');
    return provider;
  }
}
