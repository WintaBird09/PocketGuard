import { Platform } from 'react-native';

export type PickedPerson = {
  name: string;
  phone: string | null;
  contactId: string | null;
};

export type PickResult =
  | { status: 'picked'; person: PickedPerson }
  | { status: 'cancelled' }
  // The caller shows the manual name/phone fields for these.
  | { status: 'unavailable'; reason: 'web' | 'error'; message: string };

type RawContact = {
  id?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumbers?: { number?: string | null; isPrimary?: boolean }[] | null;
};

export type ContactPicker = () => Promise<RawContact | null>;

// Keeps only the display name and one phone number (the primary one if flagged).
export function toPickedPerson(raw: RawContact): PickedPerson | null {
  const name =
    raw.name?.trim() || [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim() || '';
  const numbers = (raw.phoneNumbers ?? []).filter((item) => item.number?.trim());
  const phone = (numbers.find((item) => item.isPrimary) ?? numbers[0])?.number?.trim() ?? null;
  if (!name && !phone) return null;
  return { name: name || phone || '', phone, contactId: raw.id?.trim() || null };
}

// The OS contact picker shows the user's contacts and returns only the one they choose,
// so the app never reads the address book.
async function systemPicker(): Promise<RawContact | null> {
  const contacts = await import('expo-contacts/legacy');
  return (await contacts.presentContactPickerAsync()) as RawContact | null;
}

export async function pickContact(
  picker: ContactPicker = systemPicker,
  platform: string = Platform.OS,
): Promise<PickResult> {
  if (platform === 'web') {
    return {
      status: 'unavailable',
      reason: 'web',
      message: 'Contacts are not available on web. Type the name and number instead.',
    };
  }
  try {
    const raw = await picker();
    if (!raw) return { status: 'cancelled' };
    const person = toPickedPerson(raw);
    if (!person) {
      return {
        status: 'unavailable',
        reason: 'error',
        message: 'That contact has no name or number. Type the details instead.',
      };
    }
    return { status: 'picked', person };
  } catch {
    return {
      status: 'unavailable',
      reason: 'error',
      message: 'Contacts could not be opened. Type the name and number instead.',
    };
  }
}
