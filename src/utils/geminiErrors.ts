export function getGeminiErrorHttpStatus(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = error.status;
    if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599) {
      return status;
    }
  }

  const message = error instanceof Error ? error.message : '';
  if (message.includes('API_KEY_INVALID') || /\b400\b/.test(message)) return 400;
  if (message.includes('PERMISSION_DENIED') || /\b403\b/.test(message)) return 403;
  if (message.includes('RESOURCE_EXHAUSTED') || /\b429\b/.test(message)) return 429;
  return 500;
}
