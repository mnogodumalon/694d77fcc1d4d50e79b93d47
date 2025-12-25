import { useEffect, useState } from 'react';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import type { Uebungen, PrEintraege } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import {
  TrendingUp,
  Dumbbell,
  Trophy,
  Calendar,
  PlusCircle,
  Flame,
  Target,
  ArrowUpRight,
} from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

interface DashboardStats {
  totalUebungen: number;
  totalPRs: number;
  lastPRDate: string | null;
  trainingStreak: number;
}

interface PRHistoryData {
  date: string;
  count: number;
}

interface TopUebung {
  name: string;
  prCount: number;
  lastPR: {
    weight: number;
    reps: number;
    date: string;
  } | null;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uebungen, setUebungen] = useState<Uebungen[]>([]);
  const [prEintraege, setPrEintraege] = useState<PrEintraege[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalUebungen: 0,
    totalPRs: 0,
    lastPRDate: null,
    trainingStreak: 0,
  });
  const [prHistory, setPRHistory] = useState<PRHistoryData[]>([]);
  const [topUebungen, setTopUebungen] = useState<TopUebung[]>([]);
  const [recentPRs, setRecentPRs] = useState<(PrEintraege & { uebungName: string })[]>([]);

  // Dialog State für neuen PR-Eintrag
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    exercise_id: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    weight_kg: '',
    reps: '',
    sets: '',
    note: '',
  });

  // Daten laden
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [uebungenData, prEintraegeData] = await Promise.all([
        LivingAppsService.getUebungen(),
        LivingAppsService.getPrEintraege(),
      ]);

      setUebungen(uebungenData);
      setPrEintraege(prEintraegeData);

      // Stats berechnen
      calculateStats(uebungenData, prEintraegeData);
      calculatePRHistory(prEintraegeData);
      calculateTopUebungen(uebungenData, prEintraegeData);
      calculateRecentPRs(uebungenData, prEintraegeData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Daten');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Stats berechnen
  const calculateStats = (uebungenData: Uebungen[], prEintraegeData: PrEintraege[]) => {
    const totalUebungen = uebungenData.length;
    const totalPRs = prEintraegeData.length;

    // Letztes PR-Datum
    const sortedByDate = [...prEintraegeData]
      .filter((pr) => pr.fields.date)
      .sort((a, b) => {
        const dateA = a.fields.date || '';
        const dateB = b.fields.date || '';
        return dateB.localeCompare(dateA);
      });
    const lastPRDate = sortedByDate.length > 0 ? sortedByDate[0].fields.date || null : null;

    // Training Streak (Tage seit letztem PR)
    let trainingStreak = 0;
    if (lastPRDate) {
      try {
        const daysSince = differenceInDays(new Date(), parseISO(lastPRDate));
        trainingStreak = daysSince;
      } catch {
        trainingStreak = 0;
      }
    }

    setStats({
      totalUebungen,
      totalPRs,
      lastPRDate,
      trainingStreak,
    });
  };

  // PR-Historie berechnen (letzte 30 Tage)
  const calculatePRHistory = (prEintraegeData: PrEintraege[]) => {
    const last30Days: Record<string, number> = {};

    // Initialisiere letzte 30 Tage
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = format(date, 'yyyy-MM-dd');
      last30Days[dateStr] = 0;
    }

    // Zähle PRs pro Tag
    prEintraegeData.forEach((pr) => {
      if (pr.fields.date) {
        const dateStr = pr.fields.date.split('T')[0];
        if (last30Days[dateStr] !== undefined) {
          last30Days[dateStr]++;
        }
      }
    });

    const historyData = Object.entries(last30Days).map(([date, count]) => ({
      date: format(parseISO(date), 'dd.MM', { locale: de }),
      count,
    }));

    setPRHistory(historyData);
  };

  // Top Übungen berechnen (nach PR-Anzahl)
  const calculateTopUebungen = (uebungenData: Uebungen[], prEintraegeData: PrEintraege[]) => {
    const uebungStats: Record<
      string,
      {
        name: string;
        prCount: number;
        lastPR: { weight: number; reps: number; date: string } | null;
      }
    > = {};

    // Initialisiere alle Übungen
    uebungenData.forEach((uebung) => {
      uebungStats[uebung.record_id] = {
        name: uebung.fields.name || 'Unbenannte Übung',
        prCount: 0,
        lastPR: null,
      };
    });

    // Zähle PRs pro Übung
    prEintraegeData.forEach((pr) => {
      const exerciseId = extractRecordId(pr.fields.exercise_id);
      if (!exerciseId) return;

      if (uebungStats[exerciseId]) {
        uebungStats[exerciseId].prCount++;

        // Letzten PR speichern
        if (pr.fields.date && pr.fields.weight_kg && pr.fields.reps) {
          const currentLastPR = uebungStats[exerciseId].lastPR;
          if (!currentLastPR || pr.fields.date > currentLastPR.date) {
            uebungStats[exerciseId].lastPR = {
              weight: pr.fields.weight_kg,
              reps: pr.fields.reps,
              date: pr.fields.date,
            };
          }
        }
      }
    });

    const topData = Object.values(uebungStats)
      .sort((a, b) => b.prCount - a.prCount)
      .slice(0, 5);

    setTopUebungen(topData);
  };

  // Neueste PRs berechnen
  const calculateRecentPRs = (uebungenData: Uebungen[], prEintraegeData: PrEintraege[]) => {
    const uebungMap = new Map(uebungenData.map((u) => [u.record_id, u.fields.name || 'Unbenannte Übung']));

    const recent = [...prEintraegeData]
      .filter((pr) => pr.fields.date)
      .sort((a, b) => {
        const dateA = a.fields.date || '';
        const dateB = b.fields.date || '';
        return dateB.localeCompare(dateA);
      })
      .slice(0, 5)
      .map((pr) => {
        const exerciseId = extractRecordId(pr.fields.exercise_id);
        const uebungName = exerciseId ? uebungMap.get(exerciseId) || 'Unbekannt' : 'Unbekannt';
        return {
          ...pr,
          uebungName,
        };
      });

    setRecentPRs(recent);
  };

  // Neuen PR-Eintrag erstellen
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.exercise_id || !formData.date || !formData.weight_kg || !formData.reps) {
      alert('Bitte fülle alle Pflichtfelder aus');
      return;
    }

    try {
      setSubmitting(true);

      const newPR: PrEintraege['fields'] = {
        exercise_id: createRecordUrl(APP_IDS.UEBUNGEN, formData.exercise_id),
        date: formData.date, // date/date Format: YYYY-MM-DD
        weight_kg: parseFloat(formData.weight_kg),
        reps: parseInt(formData.reps, 10),
        sets: formData.sets ? parseInt(formData.sets, 10) : undefined,
        note: formData.note || undefined,
      };

      await LivingAppsService.createPrEintraegeEntry(newPR);

      // Dialog schließen und Daten neu laden
      setDialogOpen(false);
      setFormData({
        exercise_id: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        weight_kg: '',
        reps: '',
        sets: '',
        note: '',
      });
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Lade Daten...</p>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Fehler</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={loadData}>Erneut versuchen</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-2">
              <Trophy className="h-8 w-8 text-primary" />
              Fitness PR Tracker
            </h1>
            <p className="text-muted-foreground mt-1">
              Verfolge deine Personal Records und Trainingsfortschritte
            </p>
          </div>

          {/* Action Button - Neuer PR */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2">
                <PlusCircle className="h-5 w-5" />
                Neuer PR
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Neuer Personal Record</DialogTitle>
                  <DialogDescription>
                    Trage deinen neuen PR ein und tracke deinen Fortschritt
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="exercise_id">
                      Übung <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.exercise_id}
                      onValueChange={(value) => setFormData({ ...formData, exercise_id: value })}
                    >
                      <SelectTrigger id="exercise_id">
                        <SelectValue placeholder="Übung auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {uebungen.map((uebung) => (
                          <SelectItem key={uebung.record_id} value={uebung.record_id}>
                            {uebung.fields.name || 'Unbenannte Übung'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="date">
                      Datum <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="date"
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="weight_kg">
                        Gewicht (kg) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="weight_kg"
                        type="number"
                        step="0.5"
                        placeholder="80"
                        value={formData.weight_kg}
                        onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value })}
                        required
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="reps">
                        Wiederholungen <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="reps"
                        type="number"
                        placeholder="10"
                        value={formData.reps}
                        onChange={(e) => setFormData({ ...formData, reps: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="sets">Sätze</Label>
                    <Input
                      id="sets"
                      type="number"
                      placeholder="3"
                      value={formData.sets}
                      onChange={(e) => setFormData({ ...formData, sets: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="note">Notiz</Label>
                    <Textarea
                      id="note"
                      placeholder="Heute ging es besonders gut..."
                      value={formData.note}
                      onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                    Abbrechen
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Speichere...' : 'PR hinzufügen'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Übungen</CardTitle>
              <Dumbbell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUebungen}</div>
              <p className="text-xs text-muted-foreground">Verschiedene Übungen</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesamt PRs</CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPRs}</div>
              <p className="text-xs text-muted-foreground">Personal Records</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Letzter PR</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.lastPRDate
                  ? format(parseISO(stats.lastPRDate), 'dd.MM.yy', { locale: de })
                  : 'Keine Daten'}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.lastPRDate && stats.trainingStreak === 0 && 'Heute'}
                {stats.lastPRDate && stats.trainingStreak === 1 && 'Gestern'}
                {stats.lastPRDate && stats.trainingStreak > 1 && `vor ${stats.trainingStreak} Tagen`}
                {!stats.lastPRDate && 'Noch kein PR eingetragen'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Trainingssträhne</CardTitle>
              <Flame className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.trainingStreak === 0 && '🔥 Heute'}
                {stats.trainingStreak > 0 && `${stats.trainingStreak} Tage`}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.trainingStreak === 0 && 'Weiter so!'}
                {stats.trainingStreak > 0 && 'seit letztem PR'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* PR-Historie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                PR-Historie (letzte 30 Tage)
              </CardTitle>
              <CardDescription>Anzahl PRs pro Tag</CardDescription>
            </CardHeader>
            <CardContent>
              {prHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={prHistory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  Keine Daten vorhanden
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Übungen */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Top Übungen
              </CardTitle>
              <CardDescription>Übungen nach PR-Anzahl sortiert</CardDescription>
            </CardHeader>
            <CardContent>
              {topUebungen.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={topUebungen} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="prCount" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  Keine Daten vorhanden
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Neueste PRs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5" />
              Neueste PRs
            </CardTitle>
            <CardDescription>Deine letzten 5 Personal Records</CardDescription>
          </CardHeader>
          <CardContent>
            {recentPRs.length > 0 ? (
              <div className="space-y-4">
                {recentPRs.map((pr) => (
                  <div
                    key={pr.record_id}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{pr.uebungName}</h3>
                        <Badge variant="secondary">PR</Badge>
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <span>
                          <strong>Gewicht:</strong> {pr.fields.weight_kg} kg
                        </span>
                        <span>
                          <strong>Wiederholungen:</strong> {pr.fields.reps}
                        </span>
                        {pr.fields.sets && (
                          <span>
                            <strong>Sätze:</strong> {pr.fields.sets}
                          </span>
                        )}
                      </div>
                      {pr.fields.note && <p className="text-sm text-muted-foreground italic">"{pr.fields.note}"</p>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {pr.fields.date && format(parseISO(pr.fields.date), 'dd.MM.yyyy', { locale: de })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Noch keine PRs eingetragen</p>
                <p className="text-sm">Füge deinen ersten Personal Record hinzu!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
