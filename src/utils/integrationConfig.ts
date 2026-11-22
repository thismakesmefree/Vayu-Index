export const GEMINI_FLASH_MODEL = 'gemini-3.8-flash';
export const GEMINI_FLASH_LITE_MODEL = 'gemini-3.5-flash-lite';

export type GeminiModel = typeof GEMINI_FLASH_MODEL | typeof GEMINI_FLASH_LITE_MODEL;

export function resolveGeminiModel(model: unknown): GeminiModel {
  return model === GEMINI_FLASH_LITE_MODEL ? GEMINI_FLASH_LITE_MODEL : GEMINI_FLASH_MODEL;
}
