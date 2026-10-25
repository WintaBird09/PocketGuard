import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { pickContact, toPickedPerson } from './pickContact';

describe('toPickedPerson', () => {
  it('uses the display name and the primary phone, keeping only those fields', () => {
    expect(
      toPickedPerson({
        id: 'c1',
        name: ' Desmond N. ',
        phoneNumbers: [
          { number: '+237 670 000 222' },
          { number: '+237 670 000 111', isPrimary: true },
        ],
        // extra fields from the OS must not leak through
        ...({ emails: [{ email: 'x@y.z' }], birthday: {} } as object),
      }),
    ).toEqual({ name: 'Desmond N.', phone: '+237 670 000 111', contactId: 'c1' });
  });

  it('falls back to first and last name, first number, and null phone/id', () => {
    expect(
      toPickedPerson({ firstName: 'Aline', lastName: 'M', phoneNumbers: [{ number: '655' }] }),
    ).toEqual({
      name: 'Aline M',
      phone: '655',
      contactId: null,
    });
    expect(toPickedPerson({ name: 'Bob', phoneNumbers: [{ number: '  ' }] })).toEqual({
      name: 'Bob',
      phone: null,
      contactId: null,
    });
  });

  it('uses the number as the name when there is no name, and rejects empty contacts', () => {
    expect(toPickedPerson({ phoneNumbers: [{ number: '655' }] })?.name).toBe('655');
    expect(toPickedPerson({})).toBeNull();
  });
});

describe('pickContact', () => {
  it('returns the picked person', async () => {
    const result = await pickContact(
      async () => ({ id: '9', name: 'Mom', phoneNumbers: [{ number: '1' }] }),
      'android',
    );
    expect(result).toEqual({
      status: 'picked',
      person: { name: 'Mom', phone: '1', contactId: '9' },
    });
  });

  it('reports cancel without an error', async () => {
    expect(await pickContact(async () => null, 'android')).toEqual({ status: 'cancelled' });
  });

  it('never calls the picker on web and asks for manual entry', async () => {
    const picker = vi.fn();
    const result = await pickContact(picker, 'web');
    expect(picker).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'unavailable', reason: 'web' });
  });

  it('falls back to manual entry when permission is denied or the module fails', async () => {
    const result = await pickContact(async () => {
      throw new Error('Permission denied');
    }, 'android');
    expect(result).toMatchObject({ status: 'unavailable', reason: 'error' });
  });

  it('falls back when the contact has no usable details', async () => {
    expect(await pickContact(async () => ({ id: '1' }), 'android')).toMatchObject({
      status: 'unavailable',
      reason: 'error',
    });
  });
});
