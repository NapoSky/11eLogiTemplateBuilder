import { isTransportSupply } from '../services/transportScope';
import { buildBacklineCargo } from '../services/stockpileLogistics';

describe('depot replenishment transport scope', () => {
  test.each([
    'Construction Materials', 'Processed Construction Materials', 'Steel Construction Materials',
    'Assembly Materials', 'Assembly Materials I', 'Assembly Materials II', 'Assembly Materials III',
    'Assembly Materials IV', 'Assembly Materials V', 'Rare Metal', 'Rare Alloys', 'Rare Materials',
    'Unstable Substances', 'Thermal Shielding', 'Heavy Oil', 'Enriched Oil', 'Water',
    'Coal', 'Coke', 'Salvage', 'Components', 'Damaged Components', 'Sulfur', 'Oil',
    'Copper', 'Copper Alloy', 'Gravel', 'Wreckage', 'Relic Materials',
  ])('excludes industrial or bulk resource %s in either packaging', name => {
    expect(isTransportSupply(name)).toBe(false);
    expect(isTransportSupply(`${name} (Crate)`)).toBe(false);
    expect(isTransportSupply(name.toLowerCase())).toBe(false);
  });

  test.each([
    'Basic Materials', 'Refined Materials', 'Explosive Powder', 'Heavy Explosive Powder',
    'Diesel', 'Petrol', '120mm', '150mm', '75mm', 'Bandages', 'Barbed Wire', 'Metal Beam',
    'Sandbag', 'Resource Container', 'BMS - Universal Assembly Rig', 'Unlisted Cargo',
  ])('keeps replenishment supply %s regardless of its production source', name => {
    expect(isTransportSupply(name)).toBe(true);
    expect(isTransportSupply(`${name} (Crate)`)).toBe(true);
  });

  test('uses canonical identity and French names rather than display artwork', () => {
    expect(isTransportSupply('Custom alias', {
      itemName: 'Construction Materials', legacyItemName: 'Old name', aliases: ['Custom alias'],
    })).toBe(false);
    expect(isTransportSupply('Matériaux de Construction (Caisse)')).toBe(false);
    expect(isTransportSupply('Matériaux Basiques (Caisse)')).toBe(true);
  });

  test('manual and automatic cargo cannot opt industrial resources back in through exclusions', () => {
    const stock = new Map([
      ['Construction Materials (Crate)', 100], ['Water (Crate)', 10], ['Rare Alloys', 30],
      ['Coal', 5000], ['120mm (Crate)', 20], ['Petrol (Crate)', 5], ['Refined Materials (Crate)', 10],
    ]);
    expect(buildBacklineCargo(stock, new Set(), new Set())).toEqual([
      { itemName: '120mm', quantity: 20, kind: 'container-crate' },
      { itemName: 'Petrol', quantity: 5, kind: 'container-crate' },
      { itemName: 'Refined Materials', quantity: 10, kind: 'container-crate' },
    ]);
    expect(stock.get('Coal')).toBe(5000);
  });
});
