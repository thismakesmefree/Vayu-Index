import crypto from 'crypto';

export interface OAuthEnvLike {
  APP_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
  PORT?: string | number;
}

export interface OAuthHeaderLike {
  'x-forwarded-proto'?: string | string[];
  'x-forwarded-host'?: string | string[];
  host?: string | string[];
}

function firstHeaderValue(value: string | string[] | undefined): string {
  if (!value) return '';
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw || '').split(',')[0].trim();
}

/**
 * Resolves the canonical public origin for OAuth redirect_uri generation.
 * Works across AI Studio, Vercel (Production, Custom Domains, Preview), and localhost.
 */
export function resolveOAuthBaseUrl(
  env: OAuthEnvLike,
  headers?: OAuthHeaderLike
): string {
  const forwardedHost = firstHeaderValue(headers?.['x-forwarded-host']);
  const host = forwardedHost || firstHeaderValue(headers?.host);
  if (host) {
    const forwardedProto = firstHeaderValue(headers?.['x-forwarded-proto']);
    const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(host);
    const proto = forwardedProto || (isLocalHost ? 'http' : 'https');
    return `${proto}://${host}`.replace(/\/+$/, '');
  }

  const rawAppUrl = (env.APP_URL || '').trim();
  if (rawAppUrl && rawAppUrl !== 'MY_APP_URL') {
    const normalized = /^https?:\/\//i.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`;
    return normalized.replace(/\/+$/, '');
  }

  const vercelHost = (env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL || '').trim();
  if (vercelHost) {
    const normalized = /^https?:\/\//i.test(vercelHost) ? vercelHost : `https://${vercelHost}`;
    return normalized.replace(/\/+$/, '');
  }

  const port = Number(env.PORT || 3000);
  return `http://localhost:${Number.isFinite(port) ? port : 3000}`;
}

/**
 * Creates a stateless HMAC-SHA256 signed OAuth CSRF state token.
 * Safe across serverless cold starts and multi-instance deployments (Vercel / Cloud Run).
 */
export function createSignedOAuthState(
  secret: string,
  ttlMs = 10 * 60 * 1000,
  now = Date.now()
): string {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const exp = String(now + ttlMs);
  const payload = `${nonce}.${exp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Verifies a stateless HMAC-SHA256 signed OAuth CSRF state token.
 */
export function verifySignedOAuthState(
  state: string,
  secret: string,
  now = Date.now()
): boolean {
  if (!state || !secret) return false;
  const parts = state.split('.');
  if (parts.length !== 3) return false;
  const [nonce, expStr, sig] = parts;
  if (!nonce || !expStr || !sig) return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now) return false;

  const payload = `${nonce}.${expStr}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig.length !== expectedSig.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}
