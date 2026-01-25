/**
 * Configuration de l'environnement
 * Abstraction de import.meta.env pour permettre les tests Jest
 */

export const config = {
  BASE_URL: import.meta.env.BASE_URL || '/',
};

export function getBaseUrl(): string {
  return config.BASE_URL;
}
