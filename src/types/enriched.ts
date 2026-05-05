import type { PrEintraege } from './app';

export type EnrichedPrEintraege = PrEintraege & {
  exercise_idName: string;
};
