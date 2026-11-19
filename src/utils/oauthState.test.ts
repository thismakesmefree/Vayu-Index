import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSignedOAuthState,
  resolveOAuthBaseUrl,
  verifySignedOAuthState,
} from './oauthState';

describe('stateless OAuth state and Vercel base URL resolution', () => {
  const secret = 'test-session-secret-key-32-chars-minimum';

  it('creates and verifies stateless signed OAuth state tokens across instances', () => {
    const now = 1_700_000_000_000;
    const state = createSignedOAuthState(secret, 600_000, now);
    assert.equal(state.split('.').length, 3);
    assert.equal(verifySignedOAuthState(state, secret, now + 30_000), true);
  });

  it('rejects expired, tampered, or wrong-secret OAuth state tokens', () => {
    const now = 1_700_000_000_000;
    const state = createSignedOAuthState(secret, 60_000, now);

    assert.equal(verifySignedOAuthState(state, secret, now + 61_000), false);
    assert.equal(verifySignedOAuthState(state, 'wrong-secret', now + 1_000), false);

    const [nonce, exp, sig] = state.split('.');
    const tampered = `${nonce}.${Number(exp) + 999999}.${sig}`;
    assert.equal(verifySignedOAuthState(tampered, secret, now + 1_000), false);
    assert.equal(verifySignedOAuthState('malformed-token', secret, now), false);
  });

  it('uses the active request origin before configured fallbacks for OAuth redirects', () => {
    assert.equal(
      resolveOAuthBaseUrl(
        { APP_URL: 'https://old-domain.vercel.app/' },
        { 'x-forwarded-host': 'current-domain.vercel.app', 'x-forwarded-proto': 'https' }
      ),
      'https://current-domain.vercel.app'
    );

    assert.equal(
      resolveOAuthBaseUrl(
        { APP_URL: 'MY_APP_URL' },
        { 'x-forwarded-host': 'my-deploy.vercel.app', 'x-forwarded-proto': 'https' }
      ),
      'https://my-deploy.vercel.app'
    );

    assert.equal(
      resolveOAuthBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'vayu-prod.vercel.app' }),
      'https://vayu-prod.vercel.app'
    );

    assert.equal(
      resolveOAuthBaseUrl({ PORT: 3000 }, { host: 'localhost:3000' }),
      'http://localhost:3000'
    );
  });
});
