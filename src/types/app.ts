// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export interface Uebungen {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    name?: string;
    created_at?: string; // Format: YYYY-MM-DD oder ISO String
  };
}

export interface PrEintraege {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    exercise_id?: string; // applookup -> URL zu 'Uebungen' Record
    date?: string; // Format: YYYY-MM-DD oder ISO String
    weight_kg?: number;
    reps?: number;
    sets?: number;
    note?: string;
  };
}

export const APP_IDS = {
  UEBUNGEN: '694d77f2ef696e8bff21287d',
  PR_EINTRAEGE: '694d77f4b641f5b879e4e810',
} as const;

// Helper Types for creating new records
export type CreateUebungen = Uebungen['fields'];
export type CreatePrEintraege = PrEintraege['fields'];