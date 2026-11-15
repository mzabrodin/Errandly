import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';

/** A non-UUID id cannot exist, so it is a 404 */
export const ParseId = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
