import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  TrendingUp,
  Plus,
  Search,
  Dumbbell,
  Calendar,
  ChevronRight,
  X,
  Minus,
  Activity,
  Trophy,
  History,
  Home,
  BarChart3,
  StickyNote,
} from 'lucide-react';
import type { Uebungen, PrEintraege } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

// === TYPES ===
type ViewType = 'home' | 'exercise-detail' | 'prs-feed';

interface ExerciseWithPRs extends Uebungen {
  prs: PrEintraege[];
  bestKg?: number;
  bestReps?: number;
  lastPR?: PrEintraege;
}

interface PRFormData {
  exercise_id: string;
  date: string;
  weight_kg: string;
  reps: string;
  sets: string;
  note: string;
}

// === MAIN COMPONENT ===
export default function Dashboard() {
  // State Management
  const [view, setView] = useState<ViewType>('home');
  const [selectedExercise, setSelectedExercise] = useState<ExerciseWithPRs | null>(null);
  const [exercises, setExercises] = useState<ExerciseWithPRs[]>([]);
  const [recentPRs, setRecentPRs] = useState<Array<PrEintraege & { exerciseName: string }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [formData, setFormData] = useState<PRFormData>({
    exercise_id: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    weight_kg: '',
    reps: '',
    sets: '1',
    note: '',
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Data Fetching & Processing
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [uebungen, prEintraege] = await Promise.all([
        LivingAppsService.getUebungen(),
        LivingAppsService.getPrEintraege(),
      ]);

      // Group PRs by exercise
      const exercisesWithPRs: ExerciseWithPRs[] = uebungen.map((ex) => {
        const exercisePRs = prEintraege.filter((pr) => {
          const exId = extractRecordId(pr.fields.exercise_id);
          return exId === ex.record_id;
        }).sort((a, b) => {
          const dateA = a.fields.date ? new Date(a.fields.date).getTime() : 0;
          const dateB = b.fields.date ? new Date(b.fields.date).getTime() : 0;
          return dateB - dateA; // Newest first
        });

        const bestKg = exercisePRs.reduce((max, pr) => Math.max(max, pr.fields.weight_kg || 0), 0);
        const bestReps = exercisePRs.reduce((max, pr) => Math.max(max, pr.fields.reps || 0), 0);
        const lastPR = exercisePRs[0];

        return {
          ...ex,
          prs: exercisePRs,
          bestKg: bestKg > 0 ? bestKg : undefined,
          bestReps: bestReps > 0 ? bestReps : undefined,
          lastPR,
        };
      });

      setExercises(exercisesWithPRs);

      // Recent PRs for Hero Carousel (last 10 PRs across all exercises)
      const recent = prEintraege
        .sort((a, b) => {
          const dateA = a.fields.date ? new Date(a.fields.date).getTime() : 0;
          const dateB = b.fields.date ? new Date(b.fields.date).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, 10)
        .map((pr) => {
          const exId = extractRecordId(pr.fields.exercise_id);
          const exercise = uebungen.find((ex) => ex.record_id === exId);
          return {
            ...pr,
            exerciseName: exercise?.fields.name || 'Unbekannte Übung',
          };
        });

      setRecentPRs(recent);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Fehler beim Laden der Daten');
    } finally {
      setLoading(false);
    }
  }

  // Handlers
  function handleExerciseClick(exercise: ExerciseWithPRs) {
    setSelectedExercise(exercise);
    setView('exercise-detail');
  }

  function openPRSheet(exerciseId?: string) {
    setFormData({
      exercise_id: exerciseId || '',
      date: format(new Date(), 'yyyy-MM-dd'),
      weight_kg: '',
      reps: '',
      sets: '1',
      note: '',
    });
    setSheetOpen(true);
  }

  async function handleSubmitPR() {
    if (!formData.exercise_id || !formData.weight_kg || !formData.reps) {
      toast.error('Bitte fülle alle Pflichtfelder aus');
      return;
    }

    try {
      const data: PrEintraege['fields'] = {
        exercise_id: createRecordUrl(APP_IDS.UEBUNGEN, formData.exercise_id),
        date: formData.date,
        weight_kg: parseFloat(formData.weight_kg),
        reps: parseInt(formData.reps),
        sets: parseInt(formData.sets),
        note: formData.note || undefined,
      };

      await LivingAppsService.createPrEintraegeEntry(data);
      toast.success('PR erfolgreich eingetragen!');
      setSheetOpen(false);
      loadData();
    } catch (error) {
      console.error('Error creating PR:', error);
      toast.error('Fehler beim Speichern');
    }
  }

  function incrementValue(field: 'reps' | 'sets') {
    setFormData((prev) => ({
      ...prev,
      [field]: String(Math.max(1, parseInt(prev[field] || '0') + 1)),
    }));
  }

  function decrementValue(field: 'reps' | 'sets') {
    setFormData((prev) => ({
      ...prev,
      [field]: String(Math.max(1, parseInt(prev[field] || '0') - 1)),
    }));
  }

  // Filtered exercises for search
  const filteredExercises = exercises.filter((ex) =>
    ex.fields.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // === VIEWS ===

  // Top App Bar (Sticky, Blur)
  function TopAppBar() {
    const title =
      view === 'home'
        ? 'Heute'
        : view === 'exercise-detail'
        ? selectedExercise?.fields.name
        : 'PR Historie';

    return (
      <div className="sticky top-0 z-50 backdrop-blur-lg bg-[var(--background)]/80 border-b border-[var(--border-dim)]">
        <div className="flex items-center justify-between px-4 h-14 stagger-fade-in">
          <div className="flex items-center gap-3">
            {view !== 'home' && (
              <button
                onClick={() => setView('home')}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface-1)] transition-colors press-feedback"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-[var(--accent)]" />
              <h1 className="font-display font-bold text-lg">{title}</h1>
            </div>
          </div>
          <button
            onClick={() => openPRSheet()}
            className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-all press-feedback glow-accent"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // Home View
  function HomeView() {
    return (
      <div className="flex-1 overflow-auto pb-20">
        {/* Hero: Recent PRs Carousel */}
        {recentPRs.length > 0 && (
          <section className="px-4 pt-6 pb-4 stagger-fade-in">
            <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Letzte PRs
            </h2>
            <div
              ref={scrollContainerRef}
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory hide-scrollbar pb-2"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              {recentPRs.map((pr) => (
                <div
                  key={pr.record_id}
                  className="flex-shrink-0 w-[280px] snap-start p-4 rounded-[var(--radius)] bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface-1)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-all cursor-pointer press-feedback"
                  onClick={() => {
                    const exId = extractRecordId(pr.fields.exercise_id);
                    const exercise = exercises.find((ex) => ex.record_id === exId);
                    if (exercise) handleExerciseClick(exercise);
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-display font-bold text-base leading-tight">{pr.exerciseName}</h3>
                    {pr.fields.note && (
                      <Badge variant="outline" className="text-xs">
                        <StickyNote className="w-3 h-3" />
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="font-display text-4xl font-bold text-[var(--accent)]">
                      {pr.fields.weight_kg}
                    </span>
                    <span className="text-sm text-[var(--text-muted)]">kg</span>
                    <span className="text-lg text-[var(--text-muted)] mx-1">×</span>
                    <span className="font-display text-2xl font-semibold">{pr.fields.reps}</span>
                    <span className="text-sm text-[var(--text-muted)]">reps</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-dim)]">
                    <Calendar className="w-3 h-3" />
                    {pr.fields.date && format(new Date(pr.fields.date), 'dd. MMM yyyy', { locale: de })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Search */}
        <section className="px-4 pt-4 pb-2 stagger-fade-in stagger-delay-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
            <Input
              type="text"
              placeholder="Übung suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 bg-[var(--surface-1)] border-[var(--border)] rounded-[var(--radius)] text-base"
            />
          </div>
        </section>

        {/* Exercise List */}
        <section className="px-4 pt-4 pb-4 stagger-fade-in stagger-delay-2">
          <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Übungen ({filteredExercises.length})
          </h2>
          <div className="space-y-2">
            {filteredExercises.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-muted)]">
                {searchQuery ? 'Keine Übungen gefunden' : 'Noch keine Übungen vorhanden'}
              </div>
            ) : (
              filteredExercises.map((ex, idx) => (
                <div
                  key={ex.record_id}
                  onClick={() => handleExerciseClick(ex)}
                  className="flex items-center justify-between p-4 rounded-[var(--radius)] bg-[var(--surface-1)] border border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--surface-2)] transition-all cursor-pointer press-feedback"
                  style={{
                    animation: 'fade-in-stagger 0.4s ease-out forwards',
                    animationDelay: `${idx * 60}ms`,
                    opacity: 0,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-bold text-base mb-1 truncate">{ex.fields.name}</h3>
                    {ex.lastPR && (
                      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                        <span>
                          {ex.lastPR.fields.weight_kg}kg × {ex.lastPR.fields.reps}
                        </span>
                        <span className="text-[var(--text-dim)]">·</span>
                        <span className="text-xs">
                          {ex.lastPR.fields.date &&
                            format(new Date(ex.lastPR.fields.date), 'dd.MM.yy', { locale: de })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {ex.prs.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {ex.prs.length} PRs
                      </Badge>
                    )}
                    <ChevronRight className="w-5 h-5 text-[var(--text-dim)]" />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    );
  }

  // Exercise Detail View
  function ExerciseDetailView() {
    if (!selectedExercise) return null;

    return (
      <div className="flex-1 overflow-auto pb-20">
        {/* Hero Header */}
        <section className="px-4 pt-8 pb-6 stagger-fade-in">
          <h1 className="font-display text-4xl font-bold mb-4 leading-tight">
            {selectedExercise.fields.name}
          </h1>

          {/* KPI Chips */}
          <div className="flex flex-wrap gap-2 mb-6">
            {selectedExercise.bestKg && (
              <div className="px-4 py-2 rounded-[var(--radius-chip)] bg-[var(--surface-2)] border border-[var(--border)] flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-sm font-medium">
                  <span className="font-display font-bold text-[var(--accent)]">{selectedExercise.bestKg}</span>{' '}
                  <span className="text-[var(--text-muted)]">kg max</span>
                </span>
              </div>
            )}
            {selectedExercise.bestReps && (
              <div className="px-4 py-2 rounded-[var(--radius-chip)] bg-[var(--surface-2)] border border-[var(--border)] flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-sm font-medium">
                  <span className="font-display font-bold text-[var(--accent)]">{selectedExercise.bestReps}</span>{' '}
                  <span className="text-[var(--text-muted)]">reps max</span>
                </span>
              </div>
            )}
            {selectedExercise.lastPR && (
              <div className="px-4 py-2 rounded-[var(--radius-chip)] bg-[var(--surface-2)] border border-[var(--border)] flex items-center gap-2">
                <History className="w-4 h-4 text-[var(--text-muted)]" />
                <span className="text-sm text-[var(--text-muted)]">
                  {selectedExercise.lastPR.fields.date &&
                    format(new Date(selectedExercise.lastPR.fields.date), 'dd. MMM', { locale: de })}
                </span>
              </div>
            )}
          </div>

          {/* CTA */}
          <Button
            onClick={() => openPRSheet(selectedExercise.record_id)}
            className="w-full h-12 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium rounded-[var(--radius-button)] press-feedback glow-accent"
          >
            <Plus className="w-5 h-5 mr-2" />
            PR hinzufügen
          </Button>
        </section>

        {/* Timeline / History */}
        <section className="px-4 pb-6 stagger-fade-in stagger-delay-1">
          <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <History className="w-4 h-4" />
            Verlauf ({selectedExercise.prs.length})
          </h2>

          {selectedExercise.prs.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)]">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--surface-1)] flex items-center justify-center">
                <History className="w-6 h-6" />
              </div>
              <p className="mb-4">Noch keine PRs</p>
              <Button
                onClick={() => openPRSheet(selectedExercise.record_id)}
                variant="outline"
                className="press-feedback"
              >
                Ersten PR eintragen
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedExercise.prs.map((pr, idx) => (
                <div
                  key={pr.record_id}
                  className="p-4 rounded-[var(--radius)] bg-[var(--surface-1)] border border-[var(--border)] hover:border-[var(--accent)]/30 transition-all"
                  style={{
                    animation: 'fade-in-stagger 0.4s ease-out forwards',
                    animationDelay: `${idx * 60}ms`,
                    opacity: 0,
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-3xl font-bold text-[var(--accent)]">
                        {pr.fields.weight_kg}
                      </span>
                      <span className="text-sm text-[var(--text-muted)]">kg</span>
                    </div>
                    {pr.fields.date && (
                      <div className="text-xs text-[var(--text-dim)] text-right">
                        {format(new Date(pr.fields.date), 'dd. MMM yyyy', { locale: de })}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-[var(--text-muted)]">
                      {pr.fields.reps} reps × {pr.fields.sets} sets
                    </span>
                  </div>
                  {pr.fields.note && (
                    <div className="mt-3 pt-3 border-t border-[var(--border-dim)] text-sm text-[var(--text-muted)]">
                      {pr.fields.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  // PRs Feed View
  function PRsFeedView() {
    const allPRs = exercises.flatMap((ex) =>
      ex.prs.map((pr) => ({
        ...pr,
        exerciseName: ex.fields.name || 'Unbekannt',
        exerciseId: ex.record_id,
      }))
    );

    return (
      <div className="flex-1 overflow-auto pb-20">
        <section className="px-4 pt-6 pb-6">
          <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Alle PRs ({allPRs.length})
          </h2>

          {allPRs.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)]">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--surface-1)] flex items-center justify-center">
                <BarChart3 className="w-6 h-6" />
              </div>
              <p className="mb-4">Noch keine PRs eingetragen</p>
              <Button onClick={() => openPRSheet()} variant="outline" className="press-feedback">
                Ersten PR eintragen
              </Button>
            </div>
          ) : (
            <div className="space-y-2 stagger-fade-in">
              {allPRs.map((pr, idx) => (
                <div
                  key={pr.record_id}
                  onClick={() => {
                    const exercise = exercises.find((ex) => ex.record_id === pr.exerciseId);
                    if (exercise) handleExerciseClick(exercise);
                  }}
                  className="p-4 rounded-[var(--radius)] bg-[var(--surface-1)] border border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--surface-2)] transition-all cursor-pointer press-feedback"
                  style={{
                    animation: 'fade-in-stagger 0.4s ease-out forwards',
                    animationDelay: `${idx * 40}ms`,
                    opacity: 0,
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-display font-bold text-base">{pr.exerciseName}</h3>
                    {pr.fields.date && (
                      <span className="text-xs text-[var(--text-dim)]">
                        {format(new Date(pr.fields.date), 'dd.MM.yy', { locale: de })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-2xl font-bold text-[var(--accent)]">
                      {pr.fields.weight_kg}
                    </span>
                    <span className="text-sm text-[var(--text-muted)]">kg</span>
                    <span className="text-[var(--text-muted)] mx-1">×</span>
                    <span className="font-display text-lg font-semibold">{pr.fields.reps}</span>
                    <span className="text-sm text-[var(--text-muted)]">reps</span>
                    {pr.fields.sets && pr.fields.sets > 1 && (
                      <>
                        <span className="text-[var(--text-muted)] mx-1">×</span>
                        <span className="text-sm text-[var(--text-muted)]">{pr.fields.sets} sets</span>
                      </>
                    )}
                  </div>
                  {pr.fields.note && (
                    <div className="mt-2 text-sm text-[var(--text-dim)] line-clamp-1">{pr.fields.note}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  // === RENDER ===
  if (loading) {
    return (
      <div className="phone-frame flex items-center justify-center min-h-screen bg-[var(--background)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-muted)]">Lädt...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-frame flex flex-col min-h-screen bg-[var(--background)] text-[var(--text)]">
      <Toaster position="top-center" />
      <TopAppBar />

      {view === 'home' && <HomeView />}
      {view === 'exercise-detail' && <ExerciseDetailView />}
      {view === 'prs-feed' && <PRsFeedView />}

      {/* PR Add Sheet - Inline statt Funktion um Re-Mount zu vermeiden */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="h-[85dvh] rounded-t-[var(--radius-sheet)] bg-[var(--surface-3)] border-t border-[var(--border)] p-0"
        >
          <div className="flex flex-col h-full">
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-[var(--border-dim)]">
              <SheetTitle className="font-display text-xl font-bold">PR eintragen</SheetTitle>
              <p className="text-sm text-[var(--text-muted)] mt-1">in kg</p>
            </SheetHeader>

            <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
              {/* Exercise Selector */}
              <div className="space-y-2">
                <Label htmlFor="exercise" className="text-sm font-medium text-[var(--text-muted)]">
                  Übung
                </Label>
                <Select
                  value={formData.exercise_id}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, exercise_id: value }))}
                >
                  <SelectTrigger className="h-12 bg-[var(--surface-2)] border-[var(--border)] rounded-[var(--radius-button)]">
                    <SelectValue placeholder="Übung auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {exercises.map((ex) => (
                      <SelectItem key={ex.record_id} value={ex.record_id}>
                        {ex.fields.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Weight (dominant) */}
              <div className="space-y-2">
                <Label htmlFor="weight" className="text-sm font-medium text-[var(--text-muted)]">
                  Gewicht (kg)
                </Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.5"
                  placeholder="z.B. 80"
                  value={formData.weight_kg}
                  onChange={(e) => setFormData((prev) => ({ ...prev, weight_kg: e.target.value }))}
                  className="h-16 text-3xl font-display font-bold text-center bg-[var(--surface-2)] border-[var(--border)] rounded-[var(--radius-button)] focus:border-[var(--accent)]"
                />
              </div>

              {/* Reps & Sets (Stepper) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reps" className="text-sm font-medium text-[var(--text-muted)]">
                    Wiederholungen
                  </Label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decrementValue('reps')}
                      className="w-10 h-10 flex items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors press-feedback"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <Input
                      id="reps"
                      type="number"
                      min="1"
                      value={formData.reps}
                      onChange={(e) => setFormData((prev) => ({ ...prev, reps: e.target.value }))}
                      className="h-10 text-center font-display font-bold text-xl bg-[var(--surface-2)] border-[var(--border)] rounded-[var(--radius-button)]"
                    />
                    <button
                      type="button"
                      onClick={() => incrementValue('reps')}
                      className="w-10 h-10 flex items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-2)] border border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors press-feedback"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sets" className="text-sm font-medium text-[var(--text-muted)]">
                    Sätze
                  </Label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decrementValue('sets')}
                      className="w-10 h-10 flex items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors press-feedback"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <Input
                      id="sets"
                      type="number"
                      min="1"
                      value={formData.sets}
                      onChange={(e) => setFormData((prev) => ({ ...prev, sets: e.target.value }))}
                      className="h-10 text-center font-display font-bold text-xl bg-[var(--surface-2)] border-[var(--border)] rounded-[var(--radius-button)]"
                    />
                    <button
                      type="button"
                      onClick={() => incrementValue('sets')}
                      className="w-10 h-10 flex items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-2)] border border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors press-feedback"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label htmlFor="date" className="text-sm font-medium text-[var(--text-muted)]">
                  Datum
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                  className="h-12 bg-[var(--surface-2)] border-[var(--border)] rounded-[var(--radius-button)]"
                />
              </div>

              {/* Note (collapsible) */}
              <div className="space-y-2">
                <Label htmlFor="note" className="text-sm font-medium text-[var(--text-muted)]">
                  Notiz (optional)
                </Label>
                <Textarea
                  id="note"
                  placeholder="z.B. Gefühlt leicht, nächstes Mal mehr..."
                  value={formData.note}
                  onChange={(e) => setFormData((prev) => ({ ...prev, note: e.target.value }))}
                  className="min-h-[80px] bg-[var(--surface-2)] border-[var(--border)] rounded-[var(--radius-button)] resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 pt-4 border-t border-[var(--border-dim)] space-y-3">
              <Button
                onClick={handleSubmitPR}
                className="w-full h-12 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium rounded-[var(--radius-button)] press-feedback glow-accent"
              >
                Speichern
              </Button>
              <Button
                onClick={() => setSheetOpen(false)}
                variant="ghost"
                className="w-full h-12 text-[var(--text-muted)] hover:bg-[var(--surface-2)] rounded-[var(--radius-button)] press-feedback"
              >
                Abbrechen
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Bottom Tab Bar - Inline */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-dim)] bg-[var(--surface-2)]/95 backdrop-blur-lg">
        <div className="flex items-center justify-around h-16 max-w-md mx-auto px-4">
          <button
            onClick={() => setView('home')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors press-feedback ${
              view === 'home' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <Home className="w-6 h-6" style={{ strokeWidth: view === 'home' ? 2.5 : 2 }} />
            <span className={`text-xs font-medium ${view === 'home' ? 'font-bold' : ''}`}>Home</span>
          </button>
          <button
            onClick={() => setView('prs-feed')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors press-feedback ${
              view === 'prs-feed' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <BarChart3 className="w-6 h-6" style={{ strokeWidth: view === 'prs-feed' ? 2.5 : 2 }} />
            <span className={`text-xs font-medium ${view === 'prs-feed' ? 'font-bold' : ''}`}>PRs</span>
          </button>
        </div>
      </div>
    </div>
  );
}
