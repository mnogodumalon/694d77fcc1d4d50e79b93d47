import type { EnrichedPrEintraege } from '@/types/enriched';
import type { PrEintraege, Uebungen } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface PrEintraegeMaps {
  uebungenMap: Map<string, Uebungen>;
}

export function enrichPrEintraege(
  prEintraege: PrEintraege[],
  maps: PrEintraegeMaps
): EnrichedPrEintraege[] {
  return prEintraege.map(r => ({
    ...r,
    exercise_idName: resolveDisplay(r.fields.exercise_id, maps.uebungenMap, 'name'),
  }));
}
