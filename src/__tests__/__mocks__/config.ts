/**
 * Mock du fichier config.ts pour Jest
 * Ceci contourne le problème de import.meta non supporté par Jest
 */

export const config = {
  BASE_URL: '/',
};

export function getBaseUrl(): string {
  return config.BASE_URL;
}
