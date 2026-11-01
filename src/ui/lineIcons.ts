import type { Ionicons } from '@expo/vector-icons';

export type IconName = keyof typeof Ionicons.glyphMap;
export type LineIcon = { icon: IconName; tint: string; bg: string };

// First matching rule wins; later icons in a rule are alternates used when the first is taken.
const rules: { match: RegExp; icons: IconName[] }[] = [
  { match: /car\s*wash/i, icons: ['water', 'sparkles'] },
  { match: /njangi|tontine|meeting|group/i, icons: ['people', 'people-circle'] },
  { match: /kid|child|baby/i, icons: ['happy', 'balloon', 'color-palette'] },
  { match: /school|tuition|education|class/i, icons: ['school', 'book'] },
  { match: /feed|food|grocer|meal|restaurant|eat/i, icons: ['restaurant', 'nutrition', 'pizza'] },
  { match: /rent|house|home|mortgage/i, icons: ['home', 'business'] },
  { match: /electric|power|light/i, icons: ['flash', 'bulb'] },
  { match: /internet|wifi|data|airtime/i, icons: ['wifi', 'cellular'] },
  { match: /phone|mobile/i, icons: ['call', 'phone-portrait'] },
  { match: /fuel|petrol|diesel|gas\b/i, icons: ['speedometer', 'car-sport'] },
  { match: /transport|taxi|bus|bike|travel/i, icons: ['bus', 'airplane', 'bicycle'] },
  { match: /clean|laundry|soap/i, icons: ['sparkles', 'brush'] },
  { match: /health|medic|pharm|hospital|doctor/i, icons: ['medkit', 'fitness', 'pulse'] },
  { match: /supplie|shop|market|store/i, icons: ['cart', 'bag-handle', 'basket'] },
  { match: /cloth|fashion|shoe/i, icons: ['shirt', 'glasses'] },
  {
    match: /entertain|movie|fun|leisure|game/i,
    icons: ['film', 'game-controller', 'musical-notes'],
  },
  { match: /gift|donat|charity|tithe|church|offering/i, icons: ['gift', 'hand-left'] },
  { match: /insur|tax/i, icons: ['shield-checkmark', 'document-text'] },
  { match: /mom|mum|mother|dad|father|family/i, icons: ['heart', 'rose', 'home'] },
  { match: /saving|goal|invest/i, icons: ['wallet', 'trending-up', 'trophy'] },
  { match: /debt|loan|owe|credit/i, icons: ['card', 'cash', 'receipt'] },
  { match: /misc|other|general/i, icons: ['shapes', 'apps'] },
];

const kindFallback: Record<string, IconName> = {
  running: 'pricetag',
  fixed: 'calendar',
  debt: 'card',
  savings: 'wallet',
  misc: 'shapes',
};

const spare: IconName[] = [
  'star',
  'leaf',
  'diamond',
  'rocket',
  'planet',
  'ribbon',
  'umbrella',
  'compass',
  'flag',
  'cube',
  'sunny',
  'paw',
];

const palette: { tint: string; bg: string }[] = [
  { tint: '#059669', bg: '#d1fae5' },
  { tint: '#2563eb', bg: '#dbeafe' },
  { tint: '#7c3aed', bg: '#ede9fe' },
  { tint: '#dc2626', bg: '#fee2e2' },
  { tint: '#d97706', bg: '#fef3c7' },
  { tint: '#0891b2', bg: '#cffafe' },
  { tint: '#db2777', bg: '#fce7f3' },
  { tint: '#475569', bg: '#e2e8f0' },
];

function colourFor(icon: IconName): { tint: string; bg: string } {
  let hash = 0;
  for (const char of icon) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return palette[hash % palette.length]!;
}

function candidatesFor(name: string, kind: string): IconName[] {
  const rule = rules.find((item) => item.match.test(name));
  return [...(rule?.icons ?? []), kindFallback[kind] ?? 'pricetag', ...spare];
}

// Gives every line in the list its own icon, chosen by name first, then type.
export function assignLineIcons(
  lines: readonly { id: string; name: string; kind: string }[],
): Map<string, LineIcon> {
  const used = new Set<IconName>();
  const result = new Map<string, LineIcon>();
  for (const line of lines) {
    const icon = candidatesFor(line.name, line.kind).find((item) => !used.has(item)) ?? 'ellipse';
    used.add(icon);
    result.set(line.id, { icon, ...colourFor(icon) });
  }
  return result;
}
