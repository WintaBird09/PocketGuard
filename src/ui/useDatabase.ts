import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { openAppDatabase, type DatabaseLike } from '@/src/data/db';
import { getActiveHouseholdId } from '@/src/data/household';

export type DatabaseState = {
  db: DatabaseLike | null;
  householdId: string;
  error: string | null;
  /** Increments whenever the screen regains focus or `refresh` is called. */
  tick: number;
  refresh: () => void;
};

export function useDatabase(): DatabaseState {
  const [db, setDb] = useState<DatabaseLike | null>(null);
  const [householdId, setHouseholdId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    openAppDatabase()
      .then((database) => {
        const id = getActiveHouseholdId(database);
        if (!active) return;
        setDb(database);
        setHouseholdId(id);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Unable to open the database.');
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setTick((current) => current + 1);
    }, []),
  );

  const refresh = useCallback(() => setTick((current) => current + 1), []);
  return { db, householdId, error, tick, refresh };
}
