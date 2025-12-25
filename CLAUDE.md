# 📊 AI Prompt: Dashboard Generation für Living Apps

## 🎯 Ziel

Erstelle ein **vollständiges, funktionsfähiges Dashboard** für Living Apps Backend basierend auf den bereitgestellten App-Metadaten.


**Technologie-Stack:**
- ⚛️ **React 18** + **TypeScript** (via Vite)
- 🎨 **shadcn/ui** Komponenten (Tailwind CSS v4)
- 🔌 **Living Apps REST API** (direkter fetch)
- 📅 **date-fns** für Datumsformatierung
- 📊 **recharts** für Visualisierungen

**WICHTIG:**
- NUR Dashboard generieren (keine CRUD-Seiten, kein Layout, kein Router)

---

## 📋 Input: App-Metadaten JSON

**Das JSON enthält die VOLLSTÄNDIGEN, ECHTEN Metadaten von der Living Apps REST API.**

**WICHTIG**: Das JSON definiert die App!

**📍 Die App-Struktur findest du in:**

```
app_metadata.json
```

**Diese Datei enthält die vollständigen, echten Metadaten von der Living Apps REST API.**

**Wichtig**: 
- `controls` ist ein **Objekt** (nicht Array!)
- Jedes control hat `identifier`, `label`, `type`, `subtype`, `fulltype`
- `lookup/select` hat `lookup_data` mit allen Optionen
- `applookup/select` hat `lookup_app` URL zur verknüpften App

---

## 📁 Projektstruktur - Was bereits existiert!

**⚠️ WICHTIG: Die folgenden Dateien sind BEREITS VORHANDEN und sollen NICHT neu erstellt werden!**

### ✅ Bereits vorhanden - NUR NUTZEN:

| Datei | Beschreibung |
|-------|--------------|
| `src/types/*.ts` | TypeScript Types für alle Living Apps (aus app_metadata.json generiert) |
| `src/services/livingAppsService.ts` | Service-Klasse mit allen API-Methoden |
| `src/components/ui/*` | Alle shadcn Komponenten |
| `vite.config.ts` | Vite Konfiguration (nur `base` anpassen!) |

### 🎯 Deine einzige Aufgabe:

**NUR `src/pages/Dashboard.tsx` erstellen**

```typescript
// SO importieren (NICHT selbst implementieren!):
import type { Workout, Ernaehrung, Ziel } from '@/types/gym';
import { LivingAppsService } from '@/services/livingAppsService';

// Dann einfach nutzen:
const workouts = await LivingAppsService.getWorkouts();
const ernaehrung = await LivingAppsService.getErnaehrung();
```

### ❌ NICHT selbst erstellen:

- ❌ Keine neuen Type-Definitionen (nutze `src/types/*.ts`)
- ❌ Keine neuen Service-Funktionen (nutze `LivingAppsService`)
- ❌ Keine Helper-Funktionen die schon in `livingAppsService.ts` existieren
- ❌ Keine API-Base-URL Konstanten (bereits in Service definiert)

### 📖 Workflow:

1. **Lies `src/types/*.ts`** um die verfügbaren Types zu verstehen
2. **Lies `src/services/livingAppsService.ts`** um die verfügbaren Methoden zu sehen
3. **Erstelle `src/pages/Dashboard.tsx`** mit Imports aus den bestehenden Dateien
4. **Passe `src/App.tsx`** an um das Dashboard einzubinden

---

## ⚠️ Living Apps API Besonderheiten

### 1. Datumsformat-Konvertierungen

**KRITISCH:** Living Apps erwartet spezifische Formate!

```typescript
// Für date/datetimeminute Felder (control.type === 'date/datetimeminute'):
const dateForAPI = formData.datum + 'T12:00';  // YYYY-MM-DDTHH:MM (OHNE Sekunden!)
// FALSCH: '2025-11-06T12:00:00' ❌
// RICHTIG: '2025-11-06T12:00' ✅

// Für date/date Felder (control.type === 'date/date'):
const dateForAPI = formData.datum;  // YYYY-MM-DD
// RICHTIG: '2025-11-06' ✅

// Beim Anzeigen von API-Daten in <input type="date">:
const dateForInput = apiData.datum.split('T')[0];  // Extrahiere nur YYYY-MM-DD
// API gibt: '2025-11-06T12:00'
// Input braucht: '2025-11-06'
```

**Regel**: 
- `date/datetimeminute` → `YYYY-MM-DDTHH:MM` (ohne Sekunden!)
- `date/date` → `YYYY-MM-DD`

---

### 3. applookup URL-Referenzen

**KRITISCH:** Für `applookup/select` Felder VOLLSTÄNDIGE URLs verwenden!

```typescript
// Helper-Funktion (MUSS so implementiert werden!):
export function createRecordUrl(appId: string, recordId: string): string {
  // MUSS vollständige URL sein, NICHT /api/rest!
  return `https://my.living-apps.de/rest/apps/${appId}/records/${recordId}`;
}

// Beim Erstellen/Updaten von Records mit applookup-Feldern:
const data = {
  kategorie: createRecordUrl('690cae764701a533c09cd881', selectedKategorieId),
  // FALSCH: kategorie: '/api/rest/690cae764701a533c09cd881/records/690abc' ❌
  // RICHTIG: kategorie: 'https://my.living-apps.de/rest/apps/690cae764701a533c09cd881/records/690abc' ✅
};

// Beim Lesen von applookup-Feldern aus der API:
export function extractRecordId(url: string): string {
  const parts = url.split('/');
  return parts[parts.length - 1];
}

// Beispiel:
const kategorieId = extractRecordId(ausgabe.fields.kategorie);
// Input: 'https://my.living-apps.de/rest/apps/690cae764701a533c09cd881/records/690abc'
// Output: '690abc'
```

**⚠️ KRITISCH: NIEMALS Record-IDs manuell extrahieren!**

```typescript
// ❌ FALSCH - Manuelle ID-Extraktion:
const parts = url.split('/');
const recordId = parts[parts.length - 1];

// ✅ RICHTIG - Verwende IMMER extractRecordId():
const recordId = extractRecordId(url);
if (!recordId) return; // Null-Check nicht vergessen!

// Warum wichtig?
// - extractRecordId() verwendet Regex für robuste ID-Extraktion
// - extractRecordId() ist null-safe und gibt null zurück wenn URL ungültig ist
// - Manuelle Extraktion kann fehlschlagen bei URLs mit Query-Parametern oder anderen Formaten
```

**Wichtig**: 
- Für API-Calls: `/api/rest` (wegen Proxy)
- Für applookup-Werte: `https://my.living-apps.de/rest` (vollständige URL!)
- **IMMER** `extractRecordId()` verwenden, niemals manuell mit `split('/')` extrahieren!

---

### 4. API Response Transformation

**WICHTIG:** Living Apps API gibt Objekt zurück, NICHT Array!

```typescript
// API Response-Format:
{
  "690abc...": {
    "createdat": "2025-11-06T10:00:00",
    "updatedat": null,
    "fields": {
      "name": "Lebensmittel",
      "beschreibung": "Essen und Trinken"
    }
  },
  "690def...": {
    "createdat": "2025-11-06T11:00:00",
    "updatedat": null,
    "fields": {
      "name": "Transport",
      "beschreibung": "Auto, Bahn, etc."
    }
  }
}

// FALSCHE Transformation (verliert record_id!):
const kategorien = Object.values(data);  // ❌ Keine record_id!

// RICHTIGE Transformation:
static async getKategorien(): Promise<Kategorie[]> {
  const data = await callLivingAppsAPI('GET', `/apps/${APP_IDS.KATEGORIEN}/records`);
  
  // Object.entries() verwenden, um record_id aus Key zu extrahieren!
  return Object.entries(data).map(([record_id, record]: [string, any]) => ({
    record_id,              // ← WICHTIG: record_id aus Key!
    createdat: record.createdat,
    updatedat: record.updatedat,
    fields: record.fields,
  }));
}
```

**Warum wichtig?** 
- `record_id` wird als React `key` prop benötigt
- `record_id` wird für Updates/Deletes benötigt
- Ohne `record_id` → React Warnings + funktionsunfähiges UI

---

### 5. TypeScript verbatimModuleSyntax

**MUSS beachtet werden:**

```typescript
// FALSCH (TypeScript Error):
import { Kategorie, Ausgabe, Budget } from '@/types/finance';

// RICHTIG (Option 1 - bevorzugt):
import type { Kategorie, Ausgabe, Budget } from '@/types/finance';

// RICHTIG (Option 2):
import { type Kategorie, type Ausgabe, type Budget } from '@/types/finance';
```

**Regel**: Bei Type-Only Imports IMMER `type` Keyword verwenden!

---

### 6. API Error Handling

```typescript
async function callLivingAppsAPI(method: string, endpoint: string, data?: any) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const options: RequestInit = {
    method,
    headers: {
      'X-API-KEY': API_KEY,
      'Content-Type': 'application/json',
    },
  };

  if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Living Apps API Error (${response.status}): ${errorText}`);
  }

  // WICHTIG: Bei DELETE auch response.json() aufrufen!
  return response.json();
}
```

### 7. Null-safe handling for applookup fields

CRITICAL: applookup fields can be null/undefined in Living Apps!

```typescript
// Helper function MUST be null-safe and use Regex for robust extraction:
export function extractRecordId(url: string | null | undefined): string | null {
  if (!url) return null;  // CRITICAL: Check for null/undefined first
  // Extrahiere die letzten 24 Hex-Zeichen mit Regex (Living Apps Record-IDs)
  const match = url.match(/([a-f0-9]{24})$/i);
  return match ? match[1] : null;
}

// ❌ WRONG usage (will crash if field is null):
workoutLogs.forEach((log) => {
  const uebungId = extractRecordId(log.fields.uebung);
  logsByUebung[uebungId] = log;  // ❌ Crashes if uebungId is null
});

// ❌ WRONG usage (manual extraction):
workoutLogs.forEach((log) => {
  const url = log.fields.uebung;
  const parts = url.split('/');  // ❌ NEVER do this manually!
  const uebungId = parts[parts.length - 1];
});

// ✅ RIGHT usage (defensive programming):
workoutLogs.forEach((log) => {
  const uebungId = extractRecordId(log.fields.uebung);
  if (!uebungId) return;  // ✅ Skip records with missing references
  if (!logsByUebung[uebungId]) {
    logsByUebung[uebungId] = [];
  }
  logsByUebung[uebungId].push(log);
});

// ✅ RIGHT usage for optional lookups:
const workoutId = extractRecordId(assignment.fields.workout);
const workout = workoutId ? workouts.find(w => w.record_id === workoutId) : null;
// ✅ Only search if ID exists

if (workout) {
  // Use workout data
} else {
  // Handle missing data gracefully (show placeholder, skip, etc.)
}
```

**Why this happens:**
- Optional/nullable applookup fields in Living Apps schema
- Manual data entry (users skip optional fields)
- Imported/migrated data with missing references
- Draft records not yet complete

**Rule:**
- `extractRecordId()` MUST accept `string | null | undefined`
- `extractRecordId()` MUST return `string | null`
- ALWAYS check if result is `null` before using it
- Use defensive programming: early returns, optional chaining, nullish coalescing
- Handle missing data gracefully (skip record, show placeholder, use default value)

---

## 📁 Erforderliche Dateien


### 3. `src/pages/Dashboard.tsx`

**Das ist deine HAUPTAUFGABE!**

Erstelle ein vollständiges, funktionsfähiges Dashboard

---

## 🎯 Wichtige Hinweise

### 1. shadcn Components

**WICHTIG: Alle shadcn Komponenten sind bereits vorinstalliert!**

Die Komponenten befinden sich in: `/src/components/ui/`

Einfach importieren und verwenden:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
// etc.
```

Falls du nach spezifischen Komponenten oder Beispielen suchst, nutze die shadcn MCP Tools:

```
mcp_shadcn_search_items_in_registries(registries: ['@shadcn'], query: 'chart')
mcp_shadcn_view_items_in_registries(items: ['@shadcn/card'])
mcp_shadcn_get_item_examples_from_registries(registries: ['@shadcn'], query: 'card-demo')
```

**⚠️ KRITISCH: Select Component - Keine leeren Strings als Values!**

Radix UI's Select-Komponente (shadcn/ui) erlaubt **KEINE leeren Strings** als `value` für `SelectItem`:

```typescript
// ❌ FALSCH - Führt zu Runtime Error:
<Select value={formData.lieferant} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="Auswählen (optional)" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="">Keine Auswahl</SelectItem>  {/* ❌ VERBOTEN! */}
    <SelectItem value="option1">Option 1</SelectItem>
  </SelectContent>
</Select>

// ✅ RICHTIG - Für optionale Felder:
<Select value={formData.lieferant} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="Auswählen (optional)" />
  </SelectTrigger>
  <SelectContent>
    {/* Kein "Keine Auswahl" Item - Placeholder zeigt optionalen Zustand */}
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
  </SelectContent>
</Select>

// ✅ ALTERNATIV - Mit speziellem Wert statt leerem String:
<Select value={formData.lieferant || "none"} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="Auswählen" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="none">Keine Auswahl</SelectItem>  {/* ✅ OK */}
    <SelectItem value="option1">Option 1</SelectItem>
  </SelectContent>
</Select>
```

**Warum?**
- Radix UI nutzt intern leere Strings zum Löschen der Auswahl
- `value=""` bei SelectItem führt zu: `Uncaught Error: A <Select.Item /> must have a value prop that is not an empty string`

**Regel:**
- NIEMALS `value=""` bei `<SelectItem>`
- Für optionale Felder: Placeholder nutzen, kein "Keine Auswahl" Item
- Alternative: Spezialwert wie `"none"` oder `"null"` verwenden

### 2. recharts für Visualisierungen

Bereits installiert! Nutze:
- `LineChart` für Zeitreihen
- `BarChart` für Vergleiche
- `PieChart` für Verteilungen
- `AreaChart` für Trends

Siehe: https://recharts.org/

### 3. lucide-react für Icons

Bereits installiert! Nutze passende Icons:
- `TrendingUp`, `TrendingDown` für Trends
- `AlertCircle` für Warnungen
- `CheckCircle` für Erfolg
- `PlusCircle` für Hinzufügen
- etc.

Siehe: https://lucide.dev/

### 4. date-fns für Datumsformatierung

```typescript
import { format, formatDistance, formatRelative } from 'date-fns';
import { de } from 'date-fns/locale';

// Beispiele:
format(new Date(), 'dd.MM.yyyy', { locale: de });  // "06.11.2025"
format(new Date(), 'PPP', { locale: de });          // "6. November 2025"
formatDistance(new Date(), pastDate, { locale: de }); // "vor 3 Tagen"
```

---

## ✅ Definition of Done

Das Dashboard ist fertig wenn:

1. ✅ **User Experience exzellent**: Intuitiv, übersichtlich, professionell
2. ✅ **Action-Button für Hauptaktion vorhanden und funktioniert** (mit Dialog/Modal)
3. ✅ Alle KPIs/Stats korrekt berechnet werden
5. ✅ Loading State funktioniert
6. ✅ Error Handling implementiert
7. ✅ Responsive Design (Mobile + Desktop)
8. ✅ Keine TypeScript Errors
9. ✅ Keine Console Errors
10. ✅ Business Logic korrekt (Budget-Checks, etc.)
11. ✅ Code ist clean und kommentiert
12. ✅ Living Apps API-Besonderheiten beachtet (Datum-Formate, applookup-URLs, Response-Transformation)

---

## 🚀 Los geht's!

**Workflow:**

1. **JSON analysieren**
   - Welche Apps gibt es?
   - Welche Felder haben diese Apps?
   - Welche Beziehungen bestehen? (applookup-Felder)
   - Welche Datentypen? (number, date, lookup)

3. **Code generieren**
   - Types aus JSON erstellen
   - Service-Methoden aus App-Namen ableiten
   - Dashboard mit sinnvollen Features implementieren

4. **Validieren**
   - Alle Living Apps API-Besonderheiten beachtet?
   - TypeScript kompiliert ohne Fehler?
   - Business Logic korrekt?
   - Responsive und visuell ansprechend?

**Nutze das JSON:**
- App-Namen für Titel
- Field-Labels für UI
- Beziehungen für Aggregationen
- Datentypen für Chart-Auswahl

**Denke an UX-Details:**
- Loading States: Spinner statt leere Seite
- Empty States: Hilfreiche Platzhalter wenn keine Daten
- Error States: Freundliche Fehlermeldungen mit Lösungsvorschlägen
- Success Feedback: Toast/Notification bei erfolgreichen Aktionen
- Hover States: Visuelle Rückmeldung bei Interaktionen

---

## 🚀 WICHTIG: Git Push am Ende

**Nach Abschluss aller Arbeiten MUSST du den Code pushen!**

 **RUFE EINFACH DAS TOOL `mcp__deploy_tools__deploy_to_github` AUF.**
   -> Mache KEINE manuellen git init / git push Befehle via Bash. Das Tool erledigt alles.

Viel Erfolg! 🎉

