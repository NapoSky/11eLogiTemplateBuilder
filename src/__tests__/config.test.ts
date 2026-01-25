/**
 * Tests du module de configuration
 */

import { config, getBaseUrl } from '../config';

describe('config', () => {
  test('BASE_URL est défini', () => {
    expect(config.BASE_URL).toBeDefined();
    expect(typeof config.BASE_URL).toBe('string');
  });

  test('getBaseUrl retourne la même valeur que config.BASE_URL', () => {
    expect(getBaseUrl()).toBe(config.BASE_URL);
  });

  test('BASE_URL contient au moins /', () => {
    expect(config.BASE_URL.length).toBeGreaterThan(0);
    expect(config.BASE_URL).toContain('/');
  });
});
