import { ScryptPasswordHasher } from './password-hasher.js';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('verifies the original password and rejects others', async () => {
    const hash = await hasher.hash('Pass1234');

    expect(hash).toMatch(/^scrypt\$16\$8\$2\$[\w+/=]+\$[\w+/=]+$/);
    await expect(hasher.verify('Pass1234', hash)).resolves.toBe(true);
    await expect(hasher.verify('Pass12345', hash)).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hasher.hash('Pass1234')).not.toBe(await hasher.hash('Pass1234'));
  });

  it('never matches a malformed hash', async () => {
    await expect(hasher.verify('Pass1234', 'plain-text')).resolves.toBe(false);
    await expect(hasher.verify('Pass1234', 'scrypt$x$8$2$a$b')).resolves.toBe(false);
    await expect(hasher.verify('Pass1234', 'bcrypt$16$8$2$a$b')).resolves.toBe(false);
  });
});
