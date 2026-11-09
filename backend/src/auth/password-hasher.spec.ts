import { ARGON2_OWASP, Argon2PasswordHasher } from './password-hasher.js';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('stores an argon2id PHC string with the OWASP parameters', async () => {
    const hash = await hasher.hash('Pass1234');

    const { memoryCost, timeCost, parallelism } = ARGON2_OWASP;
    expect(hash).toMatch(
      new RegExp(`^\\$argon2id\\$v=19\\$m=${memoryCost},t=${timeCost},p=${parallelism}\\$`),
    );
    expect(hash).not.toContain('Pass1234');
  });

  it('verifies the original password and rejects others', async () => {
    const hash = await hasher.hash('Pass1234');

    await expect(hasher.verify('Pass1234', hash)).resolves.toBe(true);
    await expect(hasher.verify('Pass12345', hash)).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hasher.hash('Pass1234')).not.toBe(await hasher.hash('Pass1234'));
  });

  it('treats canonically equal Unicode spellings as the same password', async () => {
    // "é" precomposed (U+00E9) vs "e" + combining acute accent (U+0301)
    const hash = await hasher.hash('café-2024');

    await expect(hasher.verify('café-2024', hash)).resolves.toBe(true);
  });

  it('never matches a malformed hash', async () => {
    await expect(hasher.verify('Pass1234', 'plain-text')).resolves.toBe(false);
    await expect(hasher.verify('Pass1234', '$argon2id$v=19$broken')).resolves.toBe(false);
    await expect(hasher.verify('Pass1234', 'scrypt$16$8$2$a$b')).resolves.toBe(false);
  });

  it('verifies hashes made with other parameters', async () => {
    const cheap = new Argon2PasswordHasher({ memoryCost: 1024, timeCost: 1, parallelism: 1 });
    const hash = await cheap.hash('Pass1234');

    await expect(hasher.verify('Pass1234', hash)).resolves.toBe(true);
  });
});
