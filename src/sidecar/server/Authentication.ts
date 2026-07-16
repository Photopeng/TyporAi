import { randomBytes, timingSafeEqual } from 'node:crypto';

export function createBootstrapToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokenMatches(expected: string, received: unknown): boolean {
  if (typeof received !== 'string') return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}
