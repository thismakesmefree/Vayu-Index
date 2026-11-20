export const GEMINI_FLASH_MODEL = 'gemini-3.8-flash';
export const GEMINI_FLASH_LITE_MODEL = 'gemini-3.5-flash-lite';

export type GeminiModel = typeof GEMINI_FLASH_MODEL | typeof GEMINI_FLASH_LITE_MODEL;
export type IntegrationEnvironment = Record<string, string | undefined>;

export function resolveGeminiModel(model: unknown): GeminiModel {
  return model === GEMINI_FLASH_LITE_MODEL ? GEMINI_FLASH_LITE_MODEL : GEMINI_FLASH_MODEL;
}

export function getGoogleMapsBrowserApiKey(env: IntegrationEnvironment): string {
  return (env.GOOGLE_MAPS_BROWSER_API_KEY || env.GOOGLE_MAPS_API_KEY || '').trim();
}

export function getGoogleMapsServerApiKey(env: IntegrationEnvironment): string {
  return (env.GOOGLE_MAPS_SERVER_API_KEY || env.GOOGLE_MAPS_API_KEY || '').trim();
}
