import { HttpStatus, NotImplementedException, ParseUUIDPipe } from '@nestjs/common';

/** The validated inputs are passed in so they stay used until the handler gets its service call */
export function notImplemented(..._inputs: unknown[]): never {
  throw new NotImplementedException();
}

/** A non-UUID id cannot exist, so it is a 404 */
export const ParseId = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
