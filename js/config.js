// Configuration des icônes et catégories

// Charger le mapping des noms d'icônes
let iconNameMapping = {};
let subtypeNameMapping = {};

export const loadIconMapping = async () => {
    try {
        // D'abord, essayer de charger depuis localStorage
        const localMapping = localStorage.getItem('iconMapping');
        if (localMapping) {
            iconNameMapping = JSON.parse(localMapping);
            console.log('Mapping des icônes chargé depuis localStorage:', Object.keys(iconNameMapping).length, 'entrées');
            return;
        }

        // Sinon, charger depuis le fichier JSON
        const response = await fetch('./iconMapping.json');
        if (response.ok) {
            iconNameMapping = await response.json();
            console.log('Mapping des icônes chargé depuis fichier:', Object.keys(iconNameMapping).length, 'entrées');
        } else {
            console.warn('Impossible de charger iconMapping.json');
        }
    } catch (error) {
        console.warn('Erreur lors du chargement du mapping des icônes:', error);
    }
};

export const loadSubtypeMapping = async () => {
    try {
        // D'abord, essayer de charger depuis localStorage
        const localMapping = localStorage.getItem('subtypeMapping');
        if (localMapping) {
            subtypeNameMapping = JSON.parse(localMapping);
            console.log('Mapping des subtypes chargé depuis localStorage:', Object.keys(subtypeNameMapping).length, 'entrées');
        } else {
            // Sinon, charger depuis le fichier JSON
            const response = await fetch('./subtypeMapping.json');
            if (response.ok) {
                subtypeNameMapping = await response.json();
                console.log('Mapping des subtypes chargé depuis fichier:', Object.keys(subtypeNameMapping).length, 'entrées');
            } else {
                console.warn('Impossible de charger subtypeMapping.json');
            }
        }
    } catch (error) {
        console.warn('Erreur lors du chargement du mapping des subtypes:', error);
    }
};

// Fonction pour obtenir le nom traduit d'une icône
export const getIconDisplayName = (filename) => {
    return iconNameMapping[filename] || filename.replace(/ItemIcon\.png|Icon\.png|\.png/g, '').replace(/([A-Z])/g, ' $1').trim();
};

// Fonction pour obtenir le nom traduit d'un subtype
export const getSubtypeDisplayName = (filename) => {
    return subtypeNameMapping[filename] || filename.replace(/Subtype|Icon\.png|\.png/g, '').replace(/([A-Z])/g, ' $1').trim();
};

// Configuration des icônes et catégories
export const iconCategories = {
    weapons: ['rifle', 'gun', 'pistol', 'carbine', 'rpg', 'launcher', 'mortar', 'machine', 'sniper', 'assault', 'revolver', 'shotgun', 'smg', 'automatic', 'bayonet', 'mace', 'sword'],
    ammo: ['ammo', 'round', 'shell', 'bullet', 'grenade', 'charge', 'mine', 'torpedo', 'depth'],
    uniforms: ['uniform', 'armour', 'armor'],
    materials: ['material', 'concrete', 'metal', 'beam', 'wire', 'bag', 'coal', 'coke', 'sulfur', 'water', 'oil', 'fuel', 'salvage', 'component', 'aluminum', 'iron', 'copper'],
    medical: ['bandage', 'aid', 'plasma', 'trauma', 'medic'],
    vehicles: ['tank', 'vehicle', 'train', 'ship', 'submarine'],
    other: []
};

// Liste des fichiers d'icônes
export const iconFiles = [
    'AmmoUniformWIcon.png', 'AntiTankMineItemIcon.png', 'ArmourUniformC.png', 'ArmourUniformW.png',
    'AssaultRifleAmmoItemIcon.png', 'AssaultRifleHeavyCItemIcon.png', 'AssaultRifleHeavyWItemIcon.png',
    'AssaultRifleItemIcon.png', 'ATAmmoIcon.png', 'ATGrenadeWIcon.png', 'ATLaunchedGrenadeWIcon.png',
    'ATMortarAmmoItemIcon.png', 'ATMortarItemIcon.png', 'ATMortarWTripodItemIcon.png', 'ATRifleAmmoItemIcon.png',
    'ATRifleAssaultWIcontga.png', 'ATRifleAutomaticWItemIcon.png', 'ATRifleItemIcon.png', 'ATRifleLightCIcon.png',
    'ATRifleSniperCIcontga.png', 'ATRifleTCIcon.png', 'ATRpgAmmoItemIcon.png', 'ATRPGCItemIcon.png',
    'ATRPGHeavyWIcon.png', 'ATRpgItemIcon.png', 'ATRPGLightCItemIcon.png', 'ATRPGTWIcon.png',
    'BandagesItemIcon.png', 'BannerTCItemIcon.png', 'BannerTWItemIcon.png', 'BarbedWireMaterialItemIcon.png',
    'BasicMaterialsIcon.png', 'BattleTankAmmoItemIcon.png', 'BayonetIcon.png', 'BinocularsItemIcon.png',
    'BloodPlasmaItemIcon.png', 'BunkerSuppliesIcon.png', 'CarbineItemIcon.png', 'ClothItemIcon.png',
    'CoalIcon.png', 'CokeIcon.png', 'ComponentsDamagedIcon.png', 'ComponentsIcon.png', 'ConcreteBagIcon.png',
    'DeadlyGas01Icon.png', 'DeployableTripodItemIcon.png', 'DepthChargeIcon.png', 'EngineerUniformCIcon.png',
    'EngineerUniformWIcon.png', 'ExplosiveMaterialIcon.png', 'ExplosiveTripodIcon.png', 'FacilityMaterials09Icon.png',
    'FacilityMaterials10Icon.png', 'FacilityMaterials11Icon.png', 'FacilityMaterials4Icon.png', 'FacilityOil1Icon.png',
    'FacilityOil2Icon.png', 'FirstAidKitItem.png', 'FlameAmmoIcon.png', 'FlamegunCICon.png', 'FlamegunWICon.png',
    'FlamePackCIcon.png', 'FlamePackWIcon.png', 'FlameRocketAmmoIcon.png', 'GasMaskFilterIcon.png',
    'GasmaskIcon.png', 'GrenadeAdapterIcon.png', 'GrenadeCItemIcon.png', 'GrenadeItemIcon.png',
    'GrenadeLauncherCItemIcon.png', 'GrenadeLauncherTCIcon.png', 'GrenadeUniformCIcon.png', 'GroundMaterialsIcon.png',
    'HammerIcon.png', 'HeavyArtilleryAmmoItemIcon.png', 'HeavyMachineGunIcon.png', 'HEGrenadeItemIcon.png',
    'HELaunchedGrenadeItemIcon.png', 'HERocketAmmoIcon.png', 'InfantryMineIcon.png', 'InfantrySupportGunItemIcon.png',
    'LRArtilleryAmmoItemIcon.png', 'LargeShipSubmarineCIcon.png', 'LightArtilleryAmmoItemIcon.png',
    'LightMachineGunIcon.png', 'LightTankAmmoItemIcon.png', 'ListeningKitIcon.png', 'MGCItemIcon.png',
    'MGHeavyTWItemIcon.png', 'MGWItemIcon.png', 'MachineGunAmmoIcon.png', 'MaintenanceSuppliesIcon.png',
    'MaterialPlatformItemIcon.png', 'MedicUniformCIcon.png', 'MedicUniformWIcon.png', 'MetalBeamMaterialItemIcon.png',
    'MiniTankAmmoItemIcon.png', 'MortarAmmoIcon.png', 'MortarItemIcon.png', 'MortarTankIcon.png',
    'OfficerUniformCIcon.png', 'OfficerUniformWIcon.png', 'PistolAmmoItemIcon.png', 'PistolItemIcon.png',
    'PistolLightWItemIcon.png', 'PistolWItemIcon.png', 'PrototypeKitIcon.png', 'RadioBackpackItemIcon.png',
    'RadioItemIcon.png', 'RainUniformCIcon.png', 'RareMaterialsIcon.png', 'RefinedFuelIcon.png',
    'RefinedMaterialsIcon.png', 'RelicMaterialItemIcon.png', 'ResouceAluminumIcon.png', 'ResouceAluminumRefinedIcon.png',
    'ResouceIronIcon.png', 'ResouceIronRefinedIcon.png', 'ResourceCopperIcon.png', 'ResourceCopperRefinedIcon.png',
    'RevolverAmmoItemIcon.png', 'RevolverItemIcon.png', 'RevolvingRifleWItemIcon.png', 'RifleAmmoItemIcon.png',
    'RifleAutomaticCIcon.png', 'RifleAutomaticW.png', 'RifleCItemIcon.png', 'RifleHeavyCItemIcon.png',
    'RifleLightCItemIcon.png', 'RifleLongC.png', 'RifleLongW.png', 'RifleShortWIcon.png', 'RifleW.png',
    'RocketPartBottomIcon.png', 'RocketPartCenterIcon.png', 'RocketPartTopIcon.png', 'RpgAmmoItemIcon.png',
    'RpgItemIcon.png', 'SMGCItemIcon.png', 'SMGHeavyCItemIcon.png', 'SMGHeavyWItemIcon.png', 'Salvage02Icon.png',
    'SalvageIcon.png', 'SandbagMaterialItemIcon.png', 'SatchelChargeTIcon.png', 'ScoutUniformCIcon.png',
    'ScoutUniformWIcon.png', 'SeaMineIcon.png', 'ShotgunAmmoItemIcon.png', 'ShotgunCItemIcon.png',
    'ShotgunWItemIcon.png', 'ShovelIcon.png', 'SledgeHammerItemIcon.png', 'Smokegrenadeicon1.png',
    'SniperRifleAmmoItemIcon.png', 'SniperRifleCItemIcon.png', 'SniperRifleItemIcon.png', 'SnowUniformCIcon.png',
    'SnowUniformWIcon.png', 'SoldierUniformCIcon.png', 'SoldierUniformWIcon.png', 'StickyBombIcon.png',
    'StilSwordCIcon.png', 'SubMachineGunAmmoIcon.png', 'SubMachineGunIcon.png', 'SulfurIcon.png',
    'TankUniformCIcon.png', 'TankUniformWIcon.png', 'TorpedoIcon.png', 'TrainHospitalItemIcon.png',
    'TraumaKitItemIcon.png', 'TrenchMaceWIcon.png', 'WaterIcon.png', 'WindsockItemIcon.png', 'WorkWrench.png'
];

// Liste des fichiers de subtypes
export const subtypeFiles = [
    'SubtypeAPIcon.png', 'SubtypeATIcon.png', 'SubtypeAmmoIcon.png', 'SubtypeAntiTank.png',
    'SubtypeEngineerIcon.png', 'SubtypeFLIcon.png', 'SubtypeGAIcon.png', 'SubtypeGrenadeIcon.png',
    'SubtypeHBIcon.png', 'SubtypeHEIcon.png', 'SubtypeLRAIcon.png', 'SubtypeMedicIcon.png',
    'SubtypeRainIcon.png', 'SubtypeSBIcon.png', 'SubtypeSEIcon.png', 'SubtypeSHIcon.png',
    'SubtypeSMKIcon.png', 'SubtypeScoutIcon.png', 'SubtypeSnowIcon.png', 'SubtypeTankIcon.png'
];

// Templates prédéfinis
export const predefinedTemplates = {
    operation: {
        title: '11eRC-FL Stockpile operation',
        subtitle: 'This is the content of Operational Stockpiles that the 11eRC-FL expect for each operation made by the regiment.',
        sections: [
            { name: 'Equipment (Crate)', color: 'blue', x: 100, y: 200 },
            { name: 'Uniforms (Crate)', color: 'gray', x: 600, y: 200 },
            { name: 'Medical / Supplies (Crate)', color: 'green', x: 100, y: 500 },
            { name: 'Materials (Crate)', color: 'orange', x: 600, y: 500 }
        ]
    },
    weapons: {
        title: '11eRC-FL Stockpile Template',
        subtitle: 'This is the content of Operational Stockpiles that the 11eRC-FL expect for each operation made by the regiment.',
        sections: [
            { name: 'Small Arms (Crate)', color: 'blue', x: 100, y: 200 },
            { name: 'Heavy Arms (Crate)', color: 'blue', x: 600, y: 200 },
            { name: 'H.Ammo (Crate)', color: 'red', x: 350, y: 450 }
        ]
    },
    logistics: {
        title: '11eRC-FL Stockpile Template',
        subtitle: 'This is the content of Operational Stockpiles that the 11eRC-FL expect for each operation made by the regiment.',
        sections: [
            { name: 'Materials (Facility)', color: 'orange', x: 100, y: 200 },
            { name: 'Materials (Crate)', color: 'orange', x: 600, y: 200 },
            { name: 'Emplacements (Crate/Stockpile)', color: 'purple', x: 350, y: 450 }
        ]
    }
};