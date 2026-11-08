import { HttpStatus, NotImplementedException, ParseUUIDPipe } from '@nestjs/common';

/**
 * Body of a handler whose contract exists but whose logic does not yet: answers
 * 501 NOT_IMPLEMENTED. The validated inputs are passed in so they stay visible
 * (and used) until the handler gets its service call.
 */
export function notImplemented(..._inputs: unknown[]): never {
  throw new NotImplementedException();
}

/** Path ids are UUIDs; anything else cannot exist, so it is a 404 NOT_FOUND */
export const ParseId = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
