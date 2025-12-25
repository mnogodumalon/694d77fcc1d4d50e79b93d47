// AUTOMATICALLY GENERATED SERVICE
import { APP_IDS } from '@/types/app';
import type { Uebungen, PrEintraege } from '@/types/app';

// Base Configuration
const API_BASE_URL = 'https://my.living-apps.de/rest';

// --- HELPER FUNCTIONS ---
export function extractRecordId(url: string | null | undefined): string | null {
  if (!url) return null;
  // Extrahiere die letzten 24 Hex-Zeichen mit Regex
  const match = url.match(/([a-f0-9]{24})$/i);
  return match ? match[1] : null;
}

export function createRecordUrl(appId: string, recordId: string): string {
  return `https://my.living-apps.de/rest/apps/${appId}/records/${recordId}`;
}

async function callApi(method: string, endpoint: string, data?: any) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',  // Nutze Session Cookies für Auth
    body: data ? JSON.stringify(data) : undefined
  });
  if (!response.ok) throw new Error(await response.text());
  // DELETE returns often empty body or simple status
  if (method === 'DELETE') return true;
  return response.json();
}

export class LivingAppsService {
  // --- UEBUNGEN ---
  static async getUebungen(): Promise<Uebungen[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.UEBUNGEN}/records`);
    return Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec
    }));
  }
  static async getUebungenEntry(id: string): Promise<Uebungen | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.UEBUNGEN}/records/${id}`);
    return { record_id: data.id, ...data };
  }
  static async createUebungenEntry(fields: Uebungen['fields']) {
    return callApi('POST', `/apps/${APP_IDS.UEBUNGEN}/records`, { fields });
  }
  static async updateUebungenEntry(id: string, fields: Partial<Uebungen['fields']>) {
    return callApi('PATCH', `/apps/${APP_IDS.UEBUNGEN}/records/${id}`, { fields });
  }
  static async deleteUebungenEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.UEBUNGEN}/records/${id}`);
  }

  // --- PR_EINTRAEGE ---
  static async getPrEintraege(): Promise<PrEintraege[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.PR_EINTRAEGE}/records`);
    return Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec
    }));
  }
  static async getPrEintraegeEntry(id: string): Promise<PrEintraege | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.PR_EINTRAEGE}/records/${id}`);
    return { record_id: data.id, ...data };
  }
  static async createPrEintraegeEntry(fields: PrEintraege['fields']) {
    return callApi('POST', `/apps/${APP_IDS.PR_EINTRAEGE}/records`, { fields });
  }
  static async updatePrEintraegeEntry(id: string, fields: Partial<PrEintraege['fields']>) {
    return callApi('PATCH', `/apps/${APP_IDS.PR_EINTRAEGE}/records/${id}`, { fields });
  }
  static async deletePrEintraegeEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.PR_EINTRAEGE}/records/${id}`);
  }

}