import { useSyncExternalStore } from 'react';

import { getLocalDateOverrideRevision, subscribeLocalDateOverride } from './dates';

export function useDateOverrideRevision(): number {
  return useSyncExternalStore(
    subscribeLocalDateOverride,
    getLocalDateOverrideRevision,
    getLocalDateOverrideRevision,
  );
}
