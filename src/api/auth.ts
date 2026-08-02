import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';

const SESSION_COOKIE_NAME = 'parcelrouter_session';
const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function safeEqual(left: string, right: string): boolean {
  const leftDigest = createHmac('sha256', 'parcelrouter-auth-compare').update(left).digest();
  const rightDigest = createHmac('sha256', 'parcelrouter-auth-compare').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function signSessionPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function getSessionTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number.parseInt(env.PARCEL_TRACKER_SESSION_TTL_SECONDS || '', 10);
  return Number.isFinite(configured) && configured >= 300
    ? configured
    : DEFAULT_SESSION_TTL_SECONDS;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};

  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return cookies;

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) return cookies;

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
    return cookies;
  }, {});
}

function requestUsesHttps(req: Request): boolean {
  if (req.secure) return true;
  const forwardedProto = req.header('x-forwarded-proto');
  return forwardedProto?.split(',')[0].trim().toLowerCase() === 'https';
}

export function createSessionToken(secret: string, now: Date = new Date()): string {
  const expiresAt = Math.floor(now.getTime() / 1000) + getSessionTtlSeconds();
  const payload = `${expiresAt}.${randomBytes(18).toString('hex')}`;
  return `${payload}.${signSessionPayload(payload, secret)}`;
}

export function verifySessionToken(token: string, secret: string, now: Date = new Date()): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [expiresAtRaw, nonce, signature] = parts;
  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(now.getTime() / 1000) || !nonce) {
    return false;
  }

  return safeEqual(signature, signSessionPayload(`${expiresAtRaw}.${nonce}`, secret));
}

export function credentialsAreValid(req: Request, expectedToken: string): boolean {
  const authorization = req.header('authorization') || '';
  if (authorization.startsWith('Bearer ') && safeEqual(authorization.slice(7), expectedToken)) {
    return true;
  }

  const sessionToken = parseCookies(req.header('cookie'))[SESSION_COOKIE_NAME];
  return Boolean(sessionToken && verifySessionToken(sessionToken, expectedToken));
}

export function loginTokenIsValid(candidate: unknown, expectedToken: string): candidate is string {
  return typeof candidate === 'string' && candidate.length > 0 && safeEqual(candidate, expectedToken);
}

export function setSessionCookie(req: Request, res: Response, sessionToken: string): void {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${getSessionTtlSeconds()}`,
  ];

  if (requestUsesHttps(req)) attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];

  if (requestUsesHttps(req)) attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
}
