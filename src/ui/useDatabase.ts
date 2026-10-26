import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { openAppDatabase, type DatabaseLike } from '@/src/data/db';
import { getActiveHouseholdId } from '@/src/data/household';
import { subscribeLocalDateOverride } from '@/src/domain/dates';

export type DatabaseState = {
  db: DatabaseLike | null;
  householdId: string;
  loading: boolean;
  error: string | null;
  /** Increments whenever the screen regains focus or `refresh` is called. */
  tick: number;
  refresh: () => void;
};

export function useDatabase(): DatabaseState {
  const [db, setDb] = useState<DatabaseLike | null>(null);
  const [householdId, setHouseholdId] = useState('');
  const [loading, setLoading] = useState(true);
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
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      subscribeLocalDateOverride(() => {
        setTick((current) => current + 1);
      }),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      setTick((current) => current + 1);
    }, []),
  );

  const refresh = useCallback(() => setTick((current) => current + 1), []);
  return { db, householdId, loading, error, tick, refresh };
}
