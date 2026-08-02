import { createSessionToken, loginTokenIsValid, verifySessionToken } from '../auth';

describe('dashboard authentication', () => {
  test('creates a valid, expiring session token', () => {
    const now = new Date('2026-08-01T12:00:00Z');
    const token = createSessionToken('shared-secret', now);

    expect(verifySessionToken(token, 'shared-secret', now)).toBe(true);
    expect(verifySessionToken(token, 'wrong-secret', now)).toBe(false);
    expect(verifySessionToken(token, 'shared-secret', new Date('2026-08-09T12:00:00Z'))).toBe(false);
  });

  test('compares submitted login tokens without accepting malformed values', () => {
    expect(loginTokenIsValid('shared-secret', 'shared-secret')).toBe(true);
    expect(loginTokenIsValid('wrong-secret', 'shared-secret')).toBe(false);
    expect(loginTokenIsValid(undefined, 'shared-secret')).toBe(false);
  });
});
