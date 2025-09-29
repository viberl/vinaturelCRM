import bcrypt from 'bcryptjs';
import argon2 from 'argon2';
import crypto from 'crypto';

export async function verifyShopwarePassword(
  plainPassword: string,
  hashedPassword?: string | null,
  legacyPassword?: string | null,
  legacyEncoder?: string | null,
  legacySalt?: string | null
): Promise<boolean> {
  if (hashedPassword) {
    if (hashedPassword.startsWith('$argon2')) {
      try {
        return await argon2.verify(hashedPassword, plainPassword);
      } catch (error) {
        console.warn('[password] Argon2 verification failed', error);
      }
    } else if (hashedPassword.startsWith('$2')) {
      try {
        const normalised = hashedPassword.replace('$2y$', '$2a$');
        return await bcrypt.compare(plainPassword, normalised);
      } catch (error) {
        console.warn('[password] Bcrypt verification failed', error);
      }
    }
  }

  if (legacyPassword && legacyEncoder) {
    const encoded = encodeLegacyPassword(plainPassword, legacyEncoder, legacySalt ?? undefined);
    if (encoded) {
      return encoded === legacyPassword;
    }
  }

  return false;
}

function encodeLegacyPassword(password: string, encoder: string, salt?: string): string | null {
  const salted = salt ? `${salt}${password}` : password;
  switch (encoder.toLowerCase()) {
    case 'md5':
      return crypto.createHash('md5').update(salted).digest('hex');
    case 'sha1':
      return crypto.createHash('sha1').update(salted).digest('hex');
    case 'pbkdf2':
      if (!salt) {
        return null;
      }
      return crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
    default:
      console.warn('[password] Unsupported legacy encoder', encoder);
      return null;
  }
}
