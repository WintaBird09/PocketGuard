import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { assignLineIcons } from './lineIcons';

const seedNames = [
  'Car Wash',
  'Cleaner',
  'Debt – Mom',
  'Debt – Petra',
  'Electricity',
  'Fuel',
  'Health',
  'Household Feeding',
  'Internet',
  'Kids Account Savings',
  'Kids Feeding (Kayden & Liam)',
  'Kids savings',
  'Miscellaneous',
  'Mom Meeting (Njangi)',
  'Rent',
  'Supplies',
];
const lines = seedNames.map((name, index) => ({
  id: String(index),
  name,
  kind: name.startsWith('Debt') ? 'debt' : 'running',
}));

describe('assignLineIcons', () => {
  it('never repeats an icon within one list', () => {
    const icons = [...assignLineIcons(lines).values()].map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('picks meaningful icons by name', () => {
    const map = assignLineIcons(lines);
    expect(map.get('4')?.icon).toBe('flash');
    expect(map.get('5')?.icon).toBe('speedometer');
    expect(map.get('6')?.icon).toBe('medkit');
    expect(map.get('14')?.icon).toBe('home');
  });

  it('is stable for the same input and handles unknown names', () => {
    const unknown = [
      { id: 'a', name: 'Zzz', kind: 'running' },
      { id: 'b', name: 'Qqq', kind: 'running' },
    ];
    const first = assignLineIcons(unknown);
    expect(assignLineIcons(unknown)).toEqual(first);
    expect(first.get('a')?.icon).not.toBe(first.get('b')?.icon);
  });

  it('only uses icons that exist in Ionicons', () => {
    const glyphs = JSON.parse(
      readFileSync(
        'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json',
        'utf8',
      ),
    ) as Record<string, number>;
    const source = readFileSync('src/ui/lineIcons.ts', 'utf8');
    const arrays = [...source.matchAll(/(?:icons: |spare: IconName\[\] = )\[([^\]]+)\]/g)];
    const icons = arrays.flatMap((match) =>
      [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!),
    );
    const fallbacks = [...source.matchAll(/^\s+\w+: '([a-z-]+)',$/gm)].map((m) => m[1]!);
    expect(icons.length).toBeGreaterThan(40);
    for (const icon of [...icons, ...fallbacks]) expect(glyphs[icon], icon).toBeDefined();
  });
});
