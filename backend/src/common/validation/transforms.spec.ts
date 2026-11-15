import { plainToInstance } from 'class-transformer';

import { NormalizeEmail, Trim } from './transforms.js';

class ProfileDto {
  @Trim()
  name!: unknown;

  @NormalizeEmail()
  email!: unknown;
}

describe('transforms', () => {
  it('trims names and lowercases emails before validation', () => {
    expect(plainToInstance(ProfileDto, { name: '  Anya ', email: ' Anya@Gmail.COM ' })).toEqual({
      name: 'Anya',
      email: 'anya@gmail.com',
    });
  });

  it('leaves anything but a string for the validators to reject', () => {
    expect(plainToInstance(ProfileDto, { name: 42, email: null })).toEqual({
      name: 42,
      email: null,
    });
  });
});
