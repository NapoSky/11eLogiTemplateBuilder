/**
 * French → English item name mapping for Foxhole stockpile CSV imports.
 *
 * The Foxhole game client exports stockpile CSV files using localised item
 * names.  This map lets French-language exports be parsed the same way as
 * English ones without touching any downstream logic.
 *
 * Only items whose French in-game name differs from the English one appear
 * here.  Names that are identical in both locales need no entry.
 *
 * The companion helper `translateFrenchItemName()` also handles the
 * "(Caisse)" → "(Crate)" suffix substitution before consulting this map.
 * Targets use English names from the supplied CSV exports and local wiki
 * snapshot; some snapshot items have no sidebar icon in itemData.json.
 */

const FR_TO_EN: Record<string, string> = {
  // ── Ammunition (caliber formatting differs: spaces / dots) ───────────────
  '7 92 mm': '7.92mm',
  '7 62 mm': '7.62mm',
  '8 mm':     '8mm',
  '9 mm':     '9mm',
  '12 7mm':   '12.7mm',
  '14 5mm':   '14.5mm',
  '20 mm':    '20mm',
  '30 mm':    '30mm',
  '40 mm':    '40mm',
  '68 mm':    '68mm',
  '75 mm':    '75mm',
  '94 5 mm':  '94.5mm',
  '120 mm':   '120mm',
  '150 mm':   '150mm',
  '300 mm':   '300mm',

  // ── Small arms ───────────────────────────────────────────────────────────
  "Fusil d'Assaut Booker Model 838":         'Booker Storm Rifle Model 838',
  "Fusil d'Assaut Aalto 24":                 'Aalto Storm Rifle 24',
  'Grenade Bomastone':                       'Bomastone Grenade',
  'Grenade à Fragmentation A3 Harpa':        'A3 Harpa Fragmentation Grenade',
  'Le Hangman 757':                          'The Hangman 757',
  'Fusil Auto Catena rt.IV':                 'Catena rt.IV Auto-Rifle',
  'Fusil Auto Sampo 77':                     'Sampo Auto-Rifle 77',
  'Fusil Argenti r.II':                      'Argenti r.II Rifle',
  'Chevrotines':                             'Buckshot',
  '"Le Pitch Gun" mc.V':                     '"The Pitch Gun" mc.V',
  'Pistolet-mitrailleur No.1 "The Liar"':    'No.1 "The Liar" Submachine Gun',
  'Pistolet-mitrailleur Fiddler Model 868':  'Fiddler Submachine Gun Model 868',
  'Fusil Antichar Neville':                  'Neville Anti-Tank Rifle',

  // ── Heavy weapons ────────────────────────────────────────────────────────
  'Lance-Roquette Antichar Carnyx':  'Carnyx Anti-Tank Rocket Launcher',
  'Bonesaw MK.3 Monté':              'Mounted Bonesaw MK.3',
  'Torche "Molten Wind" v.II':       '"Molten Wind" v.II Flame Torch',
  'Fissura gd.I monté':              'Mounted Fissura gd.I',

  // ── Grenades / explosives ────────────────────────────────────────────────
  'Grenade Tremola GPb-1':       'Tremola Grenade GPb-1',
  'Grenade Fumigène PT-815':     'PT-815 Smoke Grenade',
  'Grenade Green Ash':           'Green Ash Grenade',
  'Grenade Flacon BF5 White Ash': 'BF5 White Ash Flask Grenade',
  'Bombe Collante Antichar':     'Anti-Tank Sticky Bomb',
  'Charge Havoc':                'Havoc Charge',
  'Détonateur de Charge Havoc':  'Havoc Charge Detonator',

  // ── Rockets / shells ─────────────────────────────────────────────────────
  'Roquette':                       'RPG',
  'Roquette Incendiaire 4C':        '4C-Fire Rocket',
  'Roquette Explosif Lourd 3C':     '3C-High Explosive Rocket',
  'Mortier Cremari':                'Cremari Mortar',
  'Obus de Mortier':                'Mortar Shell',
  'Obus de Mortier à Fragmentation':'Shrapnel Mortar Shell',
  'Obus de Mortier Éclairant':      'Flare Mortar Shell',
  'Obus de Mortier Incendiaire':    'Incendiary Mortar Shell',
  'Obus Antiaérien 950-70b':        '950-70b Anti-Aircraft Shell',
  'Munitions Incendiaires':         'Flame Ammo',
  'Missile Briseur':                'Shatter Missile',
  'Munitions Antiaériennes Absol':  'Absol Anti-Aircraft Rounds',
  'Torpille Quillback':             'Quillback Torpedo',
  'Munitions de "Molten Wind" v.II':'"Molten Wind" v.II Ammo',
  'Munition pour Willow\'s Bane':   "Willow's Bane Ammo",

  // ── Equipment / tools ────────────────────────────────────────────────────
  'Bouée Navale':              'Naval Buoy',
  'Sirène de Raid Aérien':      'Air Raid Siren',
  'Masque de Vol':             'Flight Mask',
  'Jumelles':                  'Binoculars',
  'Kit d\'écoute':             'Listening Kit',
  'Poutrelle Métallique':      'Metal Beam',
  'Sac de Parachutiste':       "Paratrooper's Ruck",
  'Transmetteur Radio':        'Radio Backpack',
  'Transmetteur de Liaison':   'Liaison Transmitter',
  'Sac de sable':              'Sandbag',
  'Pelle':                     'Shovel',
  'Masse':                     'Sledge Hammer',
  'Trépied':                   'Tripod',
  'Manche à Air':              'Wind Sock',
  'Marteau':                   'Hammer',
  'Clé à Molette':             'Wrench',
  'Seau d\'eau':               'Water Bucket',
  'Eau':                       'Water',
  'Masque à gaz':              'Gas Mask',
  'Filtre de Masque à Gaz':    'Gas Mask Filter',
  "L'Ospreay":                 'The Ospreay',
  'Vexillum de Légion':        'Legion Vexillum',
  'Étendard de Guerre':        'War Ensign',
  'Fil Barbelé':               'Barbed Wire',
  "Crow's Foot Mine":          "Crow's Foot Mine",   // same — kept for clarity

  // ── Medical ──────────────────────────────────────────────────────────────
  'Trousse de Premiers Soins':  'First Aid Kit',
  'Kit de Réanimation':         'Trauma Kit',
  'Plasma Sanguin':             'Blood Plasma',
  'Fournitures de Soldat':      'Soldier Supplies',

  // ── Resources / materials ────────────────────────────────────────────────
  'Substances Instables':                    'Unstable Substances',
  'Blindage Thermique':                      'Thermal Shielding',
  'Matériaux de Construction Traités':       'Processed Construction Materials',
  'Matériaux de Construction en Acier':      'Steel Construction Materials',
  'Matériaux d\'Assemblage I':               'Assembly Materials I',
  'Matériaux d\'Assemblage II':              'Assembly Materials II',
  'Matériaux d\'Assemblage III':             'Assembly Materials III',
  'Matériaux d\'Assemblage IV':              'Assembly Materials IV',
  'Matériaux d\'Assemblage V':               'Assembly Materials V',
  'Alliages Rares':                          'Rare Alloys',
  'Pétrole Lourd':                           'Heavy Oil',
  'Pétrole Enrichi':                         'Enriched Oil',
  'Pétrole':                                 'Oil',
  'Essence':                                 'Petrol',
  'Diesel':                                  'Diesel',
  'Tuyau':                                   'Pipe',
  'Alliage d\'Aluminium':                    'Aluminum Alloy',
  'Matériaux Basiques':                      'Basic Materials',
  'Alliage de Cuivre':                       'Copper Alloy',
  'Poudre Explosive':                        'Explosive Powder',
  'Matériaux de Construction':               'Construction Materials',
  'Matériaux Rares':                         'Rare Materials',
  'Métal Rare':                              'Rare Metal',
  // Raw resource names: https://foxhole.wiki.gg/fr/wiki/Ressources
  'Aluminium':                              'Aluminum',
  'Charbon':                                'Coal',
  'Composants':                             'Components',
  'Composants Endommagés':                   'Damaged Components',
  'Cuivre':                                 'Copper',
  'Débris':                                 'Wreckage',
  'Fer':                                    'Iron',
  'Ferraille':                              'Salvage',
  'Soufre':                                 'Sulfur',
  'Gravier':                                 'Gravel',
  'Poudre Explosive Lourde':                 'Heavy Explosive Powder',
  'Alliage de Fer':                          'Iron Alloy',
  'Fournitures de Maintenance':              'Maintenance Supplies',
  'Anciens Matériaux':                       'Relic Materials',
  'Matériaux Raffinés':                      'Refined Materials',
  'Matériaux Béton':                         'Concrete Materials',
  'Conteneur de Liquide':                    'Liquid Container',
  'Container de ressources':                 'Resource Container',
  'Conteneur de ressources':                 'Resource Container',
  'Palette de matériaux':                    'Material Pallet',
  'Conteneur de transport':                  'Shipping Container',

  // ── Uniforms / clothing ──────────────────────────────────────────────────
  "Manteau de Spécialiste":         "Specialist's Overcoat",
  "Gilet pare-balles Velian":       'Velian Flak Vest',
  'Cuirasse':                       "Gunner's Breastplate",
  'Sac à dos Fabri':                'Fabri Rucksack',
  'Tenue de Sapeur':                'Sapper Gear',
  "Baudrier de Grenadiers":         "Grenadier's Baldric",
  'Tenue de Médecin':               'Medic Fatigues',
  'Veste de Médecin':               "Physician's Jacket",
  "Tenue d'Officialis":             "Officialis' Attire",
  "Parure d'Officier":              "Officer's Regalia",
  'Harnais Auster':                 "Auster's Harness",
  "Cloudrunner's Vesture":          "Cloudrunner's Vesture",  // same
  "Lodesman's Lorica":              "Lodesman's Lorica",      // same
  "Vêtement d'Aviateur":            "Aviator's Raiment",
  'Ciré du Légionnaire':            "Legionary's Oilcoat",
  'Camouflage de Reconnaissance':   'Recon Camo',
  "Manteau d'Éclaireur":            "Outrider's Mantle",
  'Pardessus Épais':                'Heavy Topcoat',
  'Parka Caoivienne':               'Caoivish Parka',
  'Uniforme de légionnaire':        'Legionary Fatigues',
  "Tenue d'infanterie":             'Infantry Battledress',
  'Combinaison de Tankiste':        "Tankman's Coveralls",
  'Combinaison Rembourrée':         'Padded Boiler Suit',

  // ── Aircraft components (both factions, sizes and repair states) ────────
  "Moteur d'Avion Colonial (Petit)": 'Colonial Aircraft Engine (Small)',
  "Pièces Mécaniques d'Avion Colonial (Petit)": 'Colonial Aircraft Mechanical Parts (Small)',
  "Moteur d'Avion Colonial Endommagé (Petit)": 'Damaged Colonial Aircraft Engine (Small)',
  "Pièces Mécaniques d'Avion Colonial Endommagées (Petit)": 'Damaged Colonial Aircraft Mechanical Parts (Small)',
  "Moteur d'Avion Warden (Petit)": 'Warden Aircraft Engine (Small)',
  "Pièces Mécaniques d'Avion Warden (Petit)": 'Warden Aircraft Mechanical Parts (Small)',
  "Moteur d'Avion Warden Endommagé (Petit)": 'Damaged Warden Aircraft Engine (Small)',
  "Pièces Mécaniques d'Avion Warden Endommagées (Petit)": 'Damaged Warden Aircraft Mechanical Parts (Small)',
  "Moteur d'Avion Colonial (Grand)": 'Colonial Aircraft Engine (Large)',
  "Pièces Mécaniques d'Avion Colonial (Grand)": 'Colonial Aircraft Mechanical Parts (Large)',
  "Moteur d'Avion Colonial Endommagé (Grand)": 'Damaged Colonial Aircraft Engine (Large)',
  "Pièces Mécaniques d'Avion Colonial Endommagées (Grand)": 'Damaged Colonial Aircraft Mechanical Parts (Large)',
  "Moteur d'Avion Warden (Grand)": 'Warden Aircraft Engine (Large)',
  "Pièces Mécaniques d'Avion Warden (Grand)": 'Warden Aircraft Mechanical Parts (Large)',
  "Moteur d'Avion Warden Endommagé (Grand)": 'Damaged Warden Aircraft Engine (Large)',
  "Pièces Mécaniques d'Avion Warden Endommagées (Grand)": 'Damaged Warden Aircraft Mechanical Parts (Large)',

  // ── Vehicles ─────────────────────────────────────────────────────────────
  "Camion d'incendie R-12b - \"Salva\"": 'R-12b - "Salva" Flame Truck',
  'Ambulance R-12 - "Salus"':              'R-12 - "Salus" Ambulance',
  'Grue Mobile BMS de Classe 2':           'BMS - Class 2 Mobile Auto-Crane',
  'Canon de Campagne 30-250 "Tisiphone"':  '30-250 "Tisiphone" Field Cannon',
  'Canon de campagne 30-250 "Tisiphone"':  '30-250 "Tisiphone" Field Cannon',
  'Camion Plateau BMS - Packmule':         'BMS - Packmule Flatbed',
  'Das Krokodil par VAC':                  'Das Krokodil by VAC',
  'Semi-chenillé Niska Mk. I':             'Niska Mk. I Gun Motor Carriage',
  'Canon de campagne 120-68 "Koronides"':  '120-68 "Koronides" Field Gun',
  'Canon de Campagne 120-68 "Koronides"':  '120-68 "Koronides" Field Gun',
  'Chenillette T12 "Actaeon"':             'T12 "Actaeon" Tankette',
  'Chenillette T14 "Vesta"':               'T14 "Vesta" Tankette',
  'Chenillette T20 "Ixion"':               'T20 "Ixion" Tankette',
  'Batterie de Roquette T13 "Deioneus"':   'T13 "Deioneus" Rocket Battery',
  'Camion-citerne RR-3 "Stolon"':          'RR-3 "Stolon" Tanker',
  'AA-2 "Battering Ram"':                  'AA-2 Battering Ram',
  'Balfour Rampart 68 mm':                 'Balfour Rampart 68mm',
  'Canon Collins de 68 mm':                'Collins Cannon 68mm',
  'Balfour Stockade 75 mm':                'Balfour Stockade 75mm',
  'Balfour Wolfhound 40 mm':               'Balfour Wolfhound 40mm',
  'Dunne Caravaner 2f':                    'Dunne Caravaner 2f',  // same

  // ── Structures / emplacements ────────────────────────────────────────────
  'Bétonnière':             'Concrete Mixer',
  'Équipement de Construction': 'Construction Equipment',
  'Leary Shellbore 68 mm':  'Leary Shellbore 68mm',
  'Huber Lariat 120 mm':    'Huber Lariat 120mm',
  'Huber Starbreaker 94 5 mm': 'Huber Starbreaker 94.5mm',

  // ── Shippable parts / containers ─────────────────────────────────────────
  'Sections de Coque Navale':         'Naval Hull Segments',
  'Placage de Coque Navale':          'Naval Shell Plating',
  'Composants de Turbines Navales':   'Naval Turbine Components',
  'Propulseur de Fusée A0E-9':        'A0E-9 Rocket Booster',
  'Corps de Fusée A0E-9':             'A0E-9 Rocket Body',
  'Ogive de Fusée A0E-9':             'A0E-9 Rocket Warhead',
  'Pièces de Forteresse Souterraine': 'Underground Fortress Parts',
  'Pièces de Construction':           'Construction Parts',
  'Pièces de Structure':              'Structure Parts',
  'Pièces de Canon Storm':            'Storm Cannon Parts',
  'Pièces de Radar d\'Avion':         'Aircraft Radar Parts',
  'Pièces de Centre de renseignement':'Intelligence Center Parts',
  'Pièces de Station Météo':          'Weather Station Parts',
};

/**
 * Translate French CSV names, preserving the physical crate/assembled distinction.
 * Both suffixes are accepted because mixed-language imports may already have
 * normalized "(Caisse)" to "(Crate)". Unknown and English base names pass through.
 */
export function translateFrenchItemName(name: string): string {
  const crateRe = /\s*\((?:Caisse|Crate)\)\s*$/i;
  const hasCrate = crateRe.test(name);
  const base = hasCrate ? name.replace(crateRe, '').trimEnd() : name;
  const lookupName = base
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  const translated = Object.hasOwn(FR_TO_EN, lookupName) ? FR_TO_EN[lookupName] : base;
  return hasCrate ? `${translated} (Crate)` : translated;
}

// Exact outputs of the former FR dictionary. Do not infer aliases from arbitrary
// legacy catalogue labels: some of those historically identified other vehicles.
const PREVIOUS_TRANSLATIONS: Record<string, string> = {
  'No.1 "The Liar"': 'No.1 "The Liar" Submachine Gun',
  'Paratrooper Backpack': "Paratrooper's Ruck",
  'Pipeline Segment': 'Pipe',
  'Rare Materials (Facilities)': 'Rare Materials',
  'Relic Material': 'Relic Materials',
  'Liquid Container (Fuel Tank)': 'Liquid Container',
  "Airship Pilot's Flight Suit": "Aviator's Raiment",
  'BMS - Universal Assembly Rig (Construction Vehicle)': 'BMS - Universal Assembly Rig',
  'BMS - Packmule Flatbed Truck': 'BMS - Packmule Flatbed',
  'T14 "Vesta" Flame Tankette': 'T14 "Vesta" Tankette',
  'T13 "Deioneus" Tankette': 'T13 "Deioneus" Rocket Battery',
  'AA-2 Battering Ram Gun Truck': 'AA-2 Battering Ram',
  'Rocket Part Bottom': 'A0E-9 Rocket Booster',
  'Rocket Part Center': 'A0E-9 Rocket Body',
  'Rocket Part Top': 'A0E-9 Rocket Warhead',
  'Construction Parts (Shippable)': 'Construction Parts',
  'Structure Equipment (Shippable)': 'Structure Parts',
  'Storm Cannon (Shippable)': 'Storm Cannon Parts',
  'Fort Large Radar (Shippable)': 'Aircraft Radar Parts',
  'Intelligence Center (Shippable)': 'Intelligence Center Parts',
  'Weather Station (Shippable)': 'Weather Station Parts',
};

/** Reapply current translations to saved imports, merging aliases per packaging. */
export function migrateStoredStockpileNames(items: Record<string, number>): Map<string, number> {
  const restored = new Map<string, number>();
  for (const [name, quantity] of Object.entries(items)) {
    const translated = translateFrenchItemName(name)
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    const crated = translated.endsWith(' (Crate)');
    const base = crated ? translated.slice(0, -8) : translated;
    const current = Object.hasOwn(PREVIOUS_TRANSLATIONS, base) ? PREVIOUS_TRANSLATIONS[base] : base;
    const key = `${current}${crated ? ' (Crate)' : ''}`;
    restored.set(key, (restored.get(key) ?? 0) + quantity);
  }
  return restored;
}
