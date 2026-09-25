'use client';

import { createContext, useContext, useMemo, useState } from 'react';

const EMPTY_SNAPSHOT = {
  matrixRows: [],
  compareMatrixRows: [],
  columns: [],
  loading: false,
  compareLoading: false,
  ready: false,
};

const AllDealerMatrixContext = createContext(null);

export function AllDealerMatrixProvider({ children }) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);

  const value = useMemo(
    () => ({ snapshot, setSnapshot }),
    [snapshot],
  );

  return (
    <AllDealerMatrixContext.Provider value={value}>
      {children}
    </AllDealerMatrixContext.Provider>
  );
}

export function useAllDealerMatrix() {
  const ctx = useContext(AllDealerMatrixContext);
  if (!ctx) {
    return { snapshot: EMPTY_SNAPSHOT, setSnapshot: () => {} };
  }
  return ctx;
}
