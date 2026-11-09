// Public API of the auth module: sign-up, sign-in, sessions and credentials.
// Other modules import only from here (src/architecture.spec.ts).
export { AuthModule } from './auth.module.js';
export { Argon2PasswordHasher, PasswordHasher } from './password-hasher.js';
