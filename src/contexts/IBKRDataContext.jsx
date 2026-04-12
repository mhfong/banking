import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import localData from '../data/ibkr_parsed.json';

const IBKRDataContext = createContext();

export function IBKRDataProvider({ children }) {
  const { user } = useAuth();
  const [data, setData] = useState(localData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If not logged in, just use local placeholder
    if (!user) {
      setLoading(false);
      return;
    }

    // Subscribe to per-user investment data, fallback to 'latest' for legacy
    const OWNER_UID = '0G3jUSlKzQbzOrbD1cY0ari1Y4i1'
    const docId = user.uid === OWNER_UID ? 'latest' : user.uid
    const unsub = onSnapshot(doc(db, 'investment_data', docId), (snap) => {
      if (snap.exists()) {
        setData(snap.data());
      }
      setLoading(false);
    }, (err) => {
      console.error("Error fetching IBKR data:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  return (
    <IBKRDataContext.Provider value={{ data, loading }}>
      {children}
    </IBKRDataContext.Provider>
  );
}

export const useIBKRData = () => useContext(IBKRDataContext);
