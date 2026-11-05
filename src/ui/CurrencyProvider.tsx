import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { deviceKeyValueStore } from '../data/deviceKeyValueStore';
import {
  currencyPreferenceKey,
  detectCurrencyCode,
  isSupportedCurrency,
  setActiveCurrency,
} from '../domain/currency';

type CurrencyContextValue = {
  code: string;
  /** True while the code comes from the phone's region rather than a saved choice. */
  detected: boolean;
  setCode: (code: string) => void;
};

const initialCode = detectCurrencyCode();
setActiveCurrency(initialCode);

const CurrencyContext = createContext<CurrencyContextValue>({
  code: initialCode,
  detected: true,
  setCode: () => undefined,
});

export function useCurrency() {
  return useContext(CurrencyContext);
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [code, setCodeState] = useState(initialCode);
  const [detected, setDetected] = useState(true);

  useEffect(() => {
    let active = true;
    void deviceKeyValueStore
      .get(currencyPreferenceKey)
      .then((saved) => {
        if (!active || !isSupportedCurrency(saved)) return;
        setActiveCurrency(saved);
        setCodeState(saved);
        setDetected(false);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const setCode = useCallback((next: string) => {
    if (!isSupportedCurrency(next)) return;
    setActiveCurrency(next);
    setCodeState(next);
    setDetected(false);
    void deviceKeyValueStore.set(currencyPreferenceKey, next).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ code, detected, setCode }), [code, detected, setCode]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}
