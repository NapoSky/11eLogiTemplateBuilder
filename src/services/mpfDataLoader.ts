import { MpfDataEntry } from '../types';
import { getBaseUrl } from '../config';

const BASE_URL = getBaseUrl();

export async function loadMpfData(): Promise<MpfDataEntry[]> {
  try {
    const res = await fetch(`${BASE_URL}mpfData.json`);
    if (!res.ok) {
      console.warn(`mpfData.json not available (${res.status}); todolist mode will be empty.`);
      return [];
    }
    return (await res.json()) as MpfDataEntry[];
  } catch (e) {
    console.error('Failed to load mpfData.json:', e);
    return [];
  }
}
