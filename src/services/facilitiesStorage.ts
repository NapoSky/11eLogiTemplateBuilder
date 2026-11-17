import { getBaseUrl } from '../config';
import type { FacilitiesCatalog } from './facilitiesCatalog';
import { emptyFacilityMission, emptyFacilityProfile, isFacilityMission, isFacilityProfile } from './facilitiesPlanner';
import type { FacilityMission, FacilityProfile } from './facilitiesPlanner';

export const FACILITY_MISSION_KEY = 'facilitiesMission.v1';
export const FACILITY_PROFILE_KEY = 'facilitiesProfile.v1';

export async function loadFacilitiesCatalog(): Promise<FacilitiesCatalog> {
  const response = await fetch(`${getBaseUrl()}facilitiesData.json`);
  if (!response.ok) throw new Error('Facility recipes could not be loaded. Try again.');
  const data = await response.json() as FacilitiesCatalog;
  const positive = (n: number) => Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER;
  if (data?.schemaVersion !== 1 || typeof data.capturedOn !== 'string' || !Array.isArray(data.items) || !data.items.length ||
    !data.items.every(item => item && typeof item.id === 'string' && typeof item.name === 'string' &&
      ['item', 'vehicle', 'structure'].includes(item.kind) && typeof item.unit === 'string' &&
      (item.icon === undefined || (typeof item.icon === 'string' && /^(Textures|Slate)\/[\w/ .()-]+\.png$/i.test(item.icon) && !item.icon.includes('..'))) &&
      Array.isArray(item.factions) && item.factions.every(faction => ['warden', 'colonial'].includes(faction)) &&
      Array.isArray(item.recipes) && item.recipes.every(recipe => recipe && typeof recipe.id === 'string' && typeof recipe.source === 'string' &&
        (recipe.category === undefined || typeof recipe.category === 'string') && typeof recipe.crated === 'boolean' && positive(recipe.amount) && Number.isSafeInteger(recipe.amount) &&
        (recipe.power === undefined || positive(recipe.power)) &&
        Array.isArray(recipe.inputs) && recipe.inputs.every(input => input && typeof input.itemId === 'string' && positive(input.amount)) &&
        Array.isArray(recipe.byproducts) && recipe.byproducts.every(output => output && typeof output.itemId === 'string' && positive(output.amount))))) {
    throw new Error('The facility catalogue is invalid.');
  }
  const ids = new Set(data.items.map(item => item.id));
  if (ids.size !== data.items.length || data.items.some(item => new Set(item.recipes.map(recipe => recipe.id)).size !== item.recipes.length ||
    item.recipes.some(recipe => [...recipe.inputs, ...recipe.byproducts].some(input => !ids.has(input.itemId))))) throw new Error('Facility recipe references are invalid.');
  return data;
}

export class FacilitiesWorkspace {
  mission: FacilityMission = emptyFacilityMission();
  profile: FacilityProfile = emptyFacilityProfile();
  warning = '';

  load(): void {
    this.warning = '';
    const read = <T>(key: string, valid: (data: unknown) => data is T, fallback: T): T => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const value: unknown = JSON.parse(raw);
        if (!valid(value)) throw new Error('Invalid saved data');
        return value;
      } catch {
        this.warning = 'Some saved facility settings could not be restored. Other modules are unaffected.';
        return fallback;
      }
    };
    this.mission = read(FACILITY_MISSION_KEY, isFacilityMission, emptyFacilityMission());
    this.profile = read(FACILITY_PROFILE_KEY, isFacilityProfile, emptyFacilityProfile());
  }

  save(): void {
    try {
      if (!isFacilityMission(this.mission) || !isFacilityProfile(this.profile)) throw new Error('Invalid facilities state');
      localStorage.setItem(FACILITY_MISSION_KEY, JSON.stringify(this.mission));
      localStorage.setItem(FACILITY_PROFILE_KEY, JSON.stringify(this.profile));
      this.warning = '';
    } catch {
      this.warning = 'Your latest changes could not be saved in this browser. Export the mission to keep a copy.';
    }
  }

  importDocument(raw: string, type: 'profile' | 'mission'): void {
    if (raw.length > 2_000_000) throw new Error('The file is too large.');
    const data: unknown = JSON.parse(raw);
    if (type === 'profile') {
      if (!isFacilityProfile(data)) throw new Error('This is not a facility profile.');
      this.profile = data;
    } else {
      const doc = data as { version?: number; mission?: unknown; profile?: unknown } | null;
      if (!doc || doc.version !== 1 || !isFacilityMission(doc.mission) || !isFacilityProfile(doc.profile)) throw new Error('This is not a facility mission.');
      this.mission = doc.mission; this.profile = doc.profile;
    }
    this.save();
  }
}
