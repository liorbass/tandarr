import { randomBytes } from 'node:crypto';

// Exclude ambiguous characters: 0/O, 1/I/L
// 30 characters remain: 23 letters + 7 digits
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ2345679';
const CODE_LENGTH = 4;

export function generateRoomCode(existingCodes: Set<string>): string {
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const bytes = randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += ALPHABET[bytes[i] % ALPHABET.length];
    }
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  throw new Error('Failed to generate unique room code');
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}
