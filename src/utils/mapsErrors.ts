export const MAPS_AUTH_FAILURE_EVENT = 'gmp-auth-failure';
export const MAPS_QUOTA_EXCEEDED_EVENT = 'gmp-quota-exceeded';

export function isMapsQuotaConsoleError(message: string): boolean {
  if (message.includes('OverQuotaMapError')) return true;

  const indicatesQuota = message.includes('QuotaExceededError') || message.includes('RESOURCE_EXHAUSTED');
  const identifiesMaps = /google maps|maps platform/i.test(message);
  return indicatesQuota && identifiesMaps;
}
