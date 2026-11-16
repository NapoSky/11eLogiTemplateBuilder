import type { SectionIcon, Template, TodoListItem } from '../types';

/** Reviewed renames in the supplied game pack; never infer identity by removing suffixes. */
const renamedIcons: Record<string, string> = {
  'Textures/UI/VehicleIcons/AircraftDiveCIcon_copy.png': 'Textures/UI/VehicleIcons/AircraftDiveCIcon.png',
  'Textures/UI/VehicleIcons/AircraftFighterCIcon.png': 'Textures/UI/VehicleIcons/AircraftFigtherCIcon.png',
  'Textures/UI/VehicleIcons/LargeShipBattleshipAircraftCIcon.png': 'Textures/UI/ItemIcons/LargeshipAircraftCIcon.png',
  'Textures/UI/VehicleIcons/LargeShipAircraftCIcon.png': 'Textures/UI/ItemIcons/LargeshipAircraftCIcon.png',
};

/** Relative to assets/icons. Slate and subtype filenames keep their existing layout. */
export function canonicalIconFilename(filename: string): string {
  const prefixed = /^(UI|Vehicles)\//.test(filename) ? `Textures/${filename}` : filename;
  return renamedIcons[prefixed] ?? prefixed;
}

export function iconFilenameFromPath(path: string): string {
  const marker = 'assets/icons/';
  const index = path.indexOf(marker);
  return canonicalIconFilename(index === -1 ? path : path.slice(index + marker.length));
}

/** Rebase recognized icon URLs when loading portable documents; leave unrelated URLs alone. */
export function resolveIconPath(path: string, baseUrl?: string): string {
  const marker = 'assets/icons/';
  const index = path.indexOf(marker);
  if (index === -1) return path;
  const prefix = baseUrl === undefined ? path.slice(0, index) : baseUrl;
  return `${prefix}${marker}${iconFilenameFromPath(path)}`;
}

export function iconAssetUrl(filename: string, baseUrl: string): string {
  return `${baseUrl}assets/icons/${canonicalIconFilename(filename)}`;
}

export function migrateSectionIcon(icon: SectionIcon, baseUrl?: string): SectionIcon {
  const path = resolveIconPath(icon.path, baseUrl);
  if (!icon.path.includes('assets/icons/')) return icon;
  const filename = iconFilenameFromPath(path);
  const oldFilename = icon.path.slice(icon.path.indexOf('assets/icons/') + 'assets/icons/'.length);
  const referencesAsset = icon.iconId === icon.filename || icon.iconId === oldFilename ||
    icon.iconId === oldFilename.split('/').pop();
  return { ...icon, path, filename,
    ...(referencesAsset ? { iconId: filename } : {}),
  };
}

export function migrateTemplateAssets(template: Template, baseUrl?: string): Template {
  return { ...template, sections: template.sections.map(section => ({
    ...section, icons: section.icons.map(icon => migrateSectionIcon(icon, baseUrl)),
  })) };
}

/** Change the path only: recorded costs, names, order counts and crate sizes remain historical. */
export function migrateTodoListItem(item: TodoListItem): TodoListItem {
  return { ...item, iconFilename: canonicalIconFilename(item.iconFilename) };
}
