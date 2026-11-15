import { Injectable, type PipeTransform } from '@nestjs/common';

import { AUTH_PROVIDERS, type AuthProvider } from '../../common/domain.js';
import { requireFound } from '../../common/errors/require-found.js';

/** An unknown provider is a route that does not exist */
@Injectable()
export class ParseAuthProvider implements PipeTransform<string, AuthProvider> {
  transform(value: string): AuthProvider {
    return requireFound(AUTH_PROVIDERS.find((candidate) => candidate === value));
  }
}
