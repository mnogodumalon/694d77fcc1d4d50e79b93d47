import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Uebungen, PrEintraege } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [uebungen, setUebungen] = useState<Uebungen[]>([]);
  const [prEintraege, setPrEintraege] = useState<PrEintraege[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [uebungenData, prEintraegeData] = await Promise.all([
        LivingAppsService.getUebungen(),
        LivingAppsService.getPrEintraege(),
      ]);
      setUebungen(uebungenData);
      setPrEintraege(prEintraegeData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Silent background refresh (no loading state change → no flicker)
  useEffect(() => {
    async function silentRefresh() {
      try {
        const [uebungenData, prEintraegeData] = await Promise.all([
          LivingAppsService.getUebungen(),
          LivingAppsService.getPrEintraege(),
        ]);
        setUebungen(uebungenData);
        setPrEintraege(prEintraegeData);
      } catch {
        // silently ignore — stale data is better than no data
      }
    }
    function handleRefresh() { void silentRefresh(); }
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, []);

  const uebungenMap = useMemo(() => {
    const m = new Map<string, Uebungen>();
    uebungen.forEach(r => m.set(r.record_id, r));
    return m;
  }, [uebungen]);

  return { uebungen, setUebungen, prEintraege, setPrEintraege, loading, error, fetchAll, uebungenMap };
}