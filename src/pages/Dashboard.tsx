import { useState, useEffect, useRef, useMemo } from 'react';
import { format, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, subMonths, startOfWeek, getWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  TrendingUp,
  Plus,
  Search,
  Dumbbell,
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronLeft,
  Minus,
  Activity,
  Trophy,
  History,
  Home,
  StickyNote,
  Flame,
  Zap,
  Award,
  Share2,
  X,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

// === TYPES ===
type ViewType = 'home' | 'exercise-detail' | 'stats';

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

interface PRAnalysis {
  isWeightPR: boolean;
  isRepPR: boolean;
  isVolumePR: boolean;
  previousBest: {
    weight: number;
    reps: number;
    volume: number;
  };
}

interface ShareData {
  exerciseName: string;
  weight: number;
  reps: number;
  sets: number;
  date: string;
  isPR?: boolean;
  totalPRs?: number;
}

// === HELPER FUNCTIONS ===

// PR-Analyse
function analyzePR(
  newWeight: number,
  newReps: number,
  previousEntries: PrEintraege[]
): PRAnalysis {
  if (previousEntries.length === 0) {
    return {
      isWeightPR: true,
      isRepPR: true,
      isVolumePR: true,
      previousBest: { weight: 0, reps: 0, volume: 0 },
    };
  }

  const maxWeight = Math.max(...previousEntries.map((e) => e.fields.weight_kg || 0));
  const maxVolume = Math.max(
    ...previousEntries.map((e) => (e.fields.weight_kg || 0) * (e.fields.reps || 0))
  );

  // Rep-PR bei gleichem Gewicht
  const sameWeight = previousEntries.filter((e) => e.fields.weight_kg === newWeight);
  const maxRepsAtWeight = sameWeight.length > 0
    ? Math.max(...sameWeight.map((e) => e.fields.reps || 0))
    : 0;

  const newVolume = newWeight * newReps;

  return {
    isWeightPR: newWeight > maxWeight,
    isRepPR: newReps > maxRepsAtWeight && sameWeight.length > 0,
    isVolumePR: newVolume > maxVolume,
    previousBest: { weight: maxWeight, reps: maxRepsAtWeight, volume: maxVolume },
  };
}

// === MAIN COMPONENT ===
export default function Dashboard() {
  // State Management
  const [view, setView] = useState<ViewType>('home');
  const [selectedExercise, setSelectedExercise] = useState<ExerciseWithPRs | null>(null);
  const [exercises, setExercises] = useState<ExerciseWithPRs[]>([]);
  const [allPrEntries, setAllPrEntries] = useState<PrEintraege[]>([]);
  const [recentPRs, setRecentPRs] = useState<Array<PrEintraege & { exerciseName: string }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dayDetailOpen, setDayDetailOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const [shareData, setShareData] = useState<ShareData | null>(null);


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

      setAllPrEntries(prEintraege);

      // Group PRs by exercise
      const exercisesWithPRs: ExerciseWithPRs[] = uebungen.map((ex) => {
        const exercisePRs = prEintraege
          .filter((pr) => {
            const exId = extractRecordId(pr.fields.exercise_id);
            return exId === ex.record_id;
          })
          .sort((a, b) => {
            const dateA = a.fields.date ? new Date(a.fields.date).getTime() : 0;
            const dateB = b.fields.date ? new Date(b.fields.date).getTime() : 0;
            return dateB - dateA;
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

      // Recent PRs for Hero Carousel
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

  // PRs grouped by date for calendar
  const prsByDate = useMemo(() => {
    const grouped: Record<string, PrEintraege[]> = {};
    allPrEntries.forEach((pr) => {
      const date = pr.fields.date?.split('T')[0];
      if (date) {
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(pr);
      }
    });
    return grouped;
  }, [allPrEntries]);

  // "Heute vs. Letztes Mal" - Last PR for selected exercise
  const lastPRForExercise = useMemo(() => {
    if (!formData.exercise_id) return null;
    const exercise = exercises.find((ex) => ex.record_id === formData.exercise_id);
    return exercise?.lastPR || null;
  }, [formData.exercise_id, exercises]);

  // Live comparison while typing
  const liveComparison = useMemo(() => {
    if (!lastPRForExercise || !formData.weight_kg || !formData.reps) return null;
    const newWeight = parseFloat(formData.weight_kg);
    const newReps = parseInt(formData.reps);
    if (isNaN(newWeight) || isNaN(newReps)) return null;

    const lastWeight = lastPRForExercise.fields.weight_kg || 0;
    const lastReps = lastPRForExercise.fields.reps || 0;

    return {
      weightDiff: newWeight - lastWeight,
      repsDiff: newReps - lastReps,
    };
  }, [lastPRForExercise, formData.weight_kg, formData.reps]);

  // Stats calculations
  const statsData = useMemo(() => {
    if (allPrEntries.length === 0) return null;

    // Unique training days
    const uniqueDates = new Set(allPrEntries.map((pr) => pr.fields.date?.split('T')[0]).filter(Boolean));
    const totalSessions = uniqueDates.size;

    // Sessions per week
    const sortedDates = Array.from(uniqueDates).sort();
    const firstDate = sortedDates[0] ? new Date(sortedDates[0]) : new Date();
    const daysSinceFirst = Math.max(1, differenceInDays(new Date(), firstDate));
    const weeksActive = Math.max(1, Math.ceil(daysSinceFirst / 7));
    const sessionsPerWeek = (totalSessions / weeksActive).toFixed(1);

    // Top 3-5 exercises by frequency
    const exerciseFrequency: Record<string, number> = {};
    allPrEntries.forEach((pr) => {
      const exId = extractRecordId(pr.fields.exercise_id);
      if (exId) {
        exerciseFrequency[exId] = (exerciseFrequency[exId] || 0) + 1;
      }
    });

    const topExerciseIds = Object.entries(exerciseFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    const topExercises = exercises.filter((ex) => topExerciseIds.includes(ex.record_id));

    // Strength Gain % - Compare first PR weight to current best weight for each exercise
    const now = new Date();
    
    // Group entries by exercise
    const entriesByExercise: Record<string, PrEintraege[]> = {};
    allPrEntries.forEach((pr) => {
      const exId = extractRecordId(pr.fields.exercise_id);
      if (exId) {
        if (!entriesByExercise[exId]) entriesByExercise[exId] = [];
        entriesByExercise[exId].push(pr);
      }
    });
    
    // Calculate strength gain for each exercise (first PR vs current best)
    let totalGainPercent = 0;
    let exercisesWithGain = 0;
    
    Object.values(entriesByExercise).forEach((entries) => {
      if (entries.length < 2) return; // Need at least 2 entries to compare
      
      // Sort by date (oldest first)
      const sorted = entries.sort((a, b) => {
        const dateA = a.fields.date ? new Date(a.fields.date).getTime() : 0;
        const dateB = b.fields.date ? new Date(b.fields.date).getTime() : 0;
        return dateA - dateB;
      });
      
      // First PR weight (baseline)
      const firstWeight = sorted[0].fields.weight_kg || 0;
      // Current best weight
      const currentBestWeight = Math.max(...entries.map(e => e.fields.weight_kg || 0));
      
      if (firstWeight > 0 && currentBestWeight > firstWeight) {
        const gainPercent = ((currentBestWeight - firstWeight) / firstWeight) * 100;
        totalGainPercent += gainPercent;
        exercisesWithGain++;
      }
    });
    
    const strengthGainPercent = exercisesWithGain > 0 
      ? Math.round(totalGainPercent / exercisesWithGain * 10) / 10 
      : 0;

    // Consistency streak - count consecutive weeks with ≥1 session from current week backwards
    const weeklyTraining: Record<number, number> = {};
    uniqueDates.forEach((dateStr) => {
      if (dateStr) {
        const date = new Date(dateStr);
        const weekNum = getWeek(date, { weekStartsOn: 1 });
        const year = date.getFullYear();
        const key = year * 100 + weekNum;
        weeklyTraining[key] = (weeklyTraining[key] || 0) + 1;
      }
    });

    // Get current week key
    const currentWeekNum = getWeek(now, { weekStartsOn: 1 });
    const currentYear = now.getFullYear();
    let currentWeekKey = currentYear * 100 + currentWeekNum;
    
    // Count consecutive weeks backwards from current week
    let currentStreak = 0;
    
    // Allow current week to be empty (week just started) - check if last week had training
    const hasCurrentWeekTraining = weeklyTraining[currentWeekKey] >= 1;
    if (!hasCurrentWeekTraining) {
      // Check from last week
      if (currentWeekNum === 1) {
        currentWeekKey = (currentYear - 1) * 100 + 52;
      } else {
        currentWeekKey = currentYear * 100 + (currentWeekNum - 1);
      }
    }
    
    // Count backwards
    let checkYear = Math.floor(currentWeekKey / 100);
    let checkWeek = currentWeekKey % 100;
    
    for (let i = 0; i < 52; i++) { // Max 1 year
      const key = checkYear * 100 + checkWeek;
      if (weeklyTraining[key] >= 1) {
        currentStreak++;
        // Move to previous week
        checkWeek--;
        if (checkWeek < 1) {
          checkWeek = 52;
          checkYear--;
        }
      } else {
        break; // Streak broken
      }
    }

    return {
      totalSessions,
      sessionsPerWeek,
      strengthGainPercent,
      currentStreak,
      topExercises,
    };
  }, [allPrEntries, exercises]);

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
      const newWeight = parseFloat(formData.weight_kg);
      const newReps = parseInt(formData.reps);
      const exercise = exercises.find((ex) => ex.record_id === formData.exercise_id);

      // Analyze PRs
      const prAnalysis = exercise
        ? analyzePR(newWeight, newReps, exercise.prs)
        : null;

      const data: PrEintraege['fields'] = {
        exercise_id: createRecordUrl(APP_IDS.UEBUNGEN, formData.exercise_id),
        date: formData.date,
        weight_kg: newWeight,
        reps: newReps,
        sets: parseInt(formData.sets),
        note: formData.note || undefined,
      };

      await LivingAppsService.createPrEintraegeEntry(data);

      // Show PR badges if any
      if (prAnalysis) {
        const prTypes: string[] = [];
        if (prAnalysis.isWeightPR) prTypes.push('Gewichts-PR');
        if (prAnalysis.isVolumePR) prTypes.push('Volumen-PR');
        if (prAnalysis.isRepPR) prTypes.push('Rep-PR');

        if (prTypes.length > 0) {
          // Trigger confetti with new key to restart animation
          setConfettiKey(prev => prev + 1);
          setShowConfetti(true);
          toast.success(`Neuer ${prTypes.join(' + ')}! 🎉`);
        } else {
          toast.success('Eingetragen!');
        }
      } else {
        toast.success('Eingetragen!');
      }

      setSheetOpen(false);
      await loadData();
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

  function openDayDetail(date: Date) {
    setSelectedDate(date);
    setDayDetailOpen(true);
  }

  function openShareCard(pr: PrEintraege, exerciseName: string, totalPRs?: number, isPR?: boolean) {
    setShareData({
      exerciseName,
      weight: pr.fields.weight_kg || 0,
      reps: pr.fields.reps || 0,
      sets: pr.fields.sets || 1,
      date: pr.fields.date || '',
      isPR,
      totalPRs,
    });
    setShareCardOpen(true);
  }


  // Filtered exercises for search
  const filteredExercises = exercises.filter((ex) =>
    ex.fields.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get PRs for selected date
  const prsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return (prsByDate[dateStr] || []).map((pr) => {
      const exId = extractRecordId(pr.fields.exercise_id);
      const exercise = exercises.find((ex) => ex.record_id === exId);
      return { ...pr, exerciseName: exercise?.fields.name || 'Unbekannt' };
    });
  }, [selectedDate, prsByDate, exercises]);

  // Calendar heatmap intensity
  function getHeatmapIntensity(dateStr: string): 'none' | 'low' | 'medium' | 'high' {
    const count = prsByDate[dateStr]?.length || 0;
    if (count === 0) return 'none';
    if (count <= 2) return 'low';
    if (count <= 4) return 'medium';
    return 'high';
  }

  // === VIEWS ===

  // Top App Bar
  function TopAppBar() {
    const title =
      view === 'home'
        ? 'Heute'
        : view === 'exercise-detail'
        ? selectedExercise?.fields.name
        : view === 'stats'
        ? 'Statistiken'
        : 'PR Historie';

    return (
      <div className="sticky top-0 z-50 backdrop-blur-lg bg-[var(--background)]/80 border-b border-[var(--border-dim)]">
        <div className="flex items-center justify-between px-4 h-14 stagger-fade-in">
          <div className="flex items-center gap-3">
            {(view === 'exercise-detail') && (
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
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
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
                    <h3 className="font-display font-bold text-base leading-tight">
                      {pr.exerciseName}
                    </h3>
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
                    <CalendarIcon className="w-3 h-3" />
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
                    <h3 className="font-display font-bold text-base mb-1 truncate">
                      {ex.fields.name}
                    </h3>
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
                  <ChevronRight className="w-5 h-5 text-[var(--text-dim)]" />
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    );
  }

  // Exercise Detail View with Charts
  function ExerciseDetailView() {
    if (!selectedExercise) return null;

    // Prepare chart data
    const chartData = useMemo(() => {
      return selectedExercise.prs
        .slice()
        .reverse()
        .map((pr) => ({
          date: pr.fields.date ? format(new Date(pr.fields.date), 'dd.MM', { locale: de }) : '',
          fullDate: pr.fields.date,
          weight: pr.fields.weight_kg || 0,
          reps: pr.fields.reps || 0,
          volume: (pr.fields.weight_kg || 0) * (pr.fields.reps || 0),
        }));
    }, [selectedExercise.prs]);

    return (
      <div className="flex-1 overflow-auto pb-20">
        {/* Hero Header */}
        <section className="px-4 pt-8 pb-6 stagger-fade-in">
          <h1 className="font-display text-3xl font-bold mb-4 leading-tight">
            {selectedExercise.fields.name}
          </h1>

          {/* KPI Chips */}
          <div className="flex flex-wrap gap-2 mb-6">
            {selectedExercise.bestKg && (
              <div className="px-4 py-2 rounded-[var(--radius-chip)] bg-[var(--surface-2)] border border-[var(--border)] flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-sm font-medium">
                  <span className="font-display font-bold text-[var(--accent)]">
                    {selectedExercise.bestKg}
                  </span>{' '}
                  <span className="text-[var(--text-muted)]">kg</span>
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

          {/* CTA Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={() => openPRSheet(selectedExercise.record_id)}
              className="flex-1 h-12 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium rounded-[var(--radius-button)] press-feedback glow-accent"
            >
              <Plus className="w-5 h-5 mr-2" />
              PR hinzufügen
            </Button>
            {selectedExercise.lastPR && (
              <Button
                onClick={() => openShareCard(selectedExercise.lastPR!, selectedExercise.fields.name || '', selectedExercise.prs.length)}
                variant="outline"
                className="h-12 px-4 border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 rounded-[var(--radius-button)] press-feedback"
              >
                <Share2 className="w-5 h-5" />
              </Button>
            )}
          </div>
        </section>

        {/* Progress Charts */}
        {chartData.length >= 2 && (
          <section className="px-4 pb-6 stagger-fade-in stagger-delay-1">
            <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Progress
            </h2>
            <Tabs defaultValue="weight" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-[var(--surface-1)] rounded-[var(--radius-button)] p-1 h-10">
                <TabsTrigger value="weight" className="text-xs rounded-[var(--radius-button)] data-[state=active]:bg-[var(--surface-2)]">Gewicht</TabsTrigger>
                <TabsTrigger value="volume" className="text-xs rounded-[var(--radius-button)] data-[state=active]:bg-[var(--surface-2)]">Volumen</TabsTrigger>
              </TabsList>
              <TabsContent value="weight" className="mt-4">
                <div className="h-[200px] w-full bg-[var(--surface-1)] rounded-[var(--radius)] p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ff8fa8" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ff8fa8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" stroke="#727280" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#727280" fontSize={10} tickLine={false} axisLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1c1c24', border: '1px solid #2a2a35', borderRadius: '8px' }}
                        labelStyle={{ color: '#e8e8f0' }}
                        itemStyle={{ color: '#ff8fa8' }}
                        formatter={(value: number) => [`${value} kg`, 'Gewicht']}
                      />
                      <Area type="monotone" dataKey="weight" stroke="#ff8fa8" strokeWidth={2} fill="url(#colorWeight)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>
              <TabsContent value="volume" className="mt-4">
                <div className="h-[200px] w-full bg-[var(--surface-1)] rounded-[var(--radius)] p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ff8fa8" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ff8fa8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" stroke="#727280" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#727280" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1c1c24', border: '1px solid #2a2a35', borderRadius: '8px' }}
                        labelStyle={{ color: '#e8e8f0' }}
                        itemStyle={{ color: '#ff8fa8' }}
                        formatter={(value: number) => [`${value}`, 'Volumen']}
                      />
                      <Area type="monotone" dataKey="volume" stroke="#ff8fa8" strokeWidth={2} fill="url(#colorVolume)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>
            </Tabs>
          </section>
        )}

        {/* Timeline / History */}
        <section className="px-4 pb-6 stagger-fade-in stagger-delay-2">
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
                    <div className="flex items-center gap-2">
                      {pr.fields.date && (
                        <div className="text-xs text-[var(--text-dim)] text-right">
                          {format(new Date(pr.fields.date), 'dd. MMM yyyy', { locale: de })}
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openShareCard(pr, selectedExercise.fields.name || '');
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)] transition-colors"
                      >
                        <Share2 className="w-4 h-4 text-[var(--text-dim)]" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
                    <span>{pr.fields.reps} reps × {pr.fields.sets} sets</span>
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

  // Stats View with Calendar
  function StatsView() {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const days = eachDayOfInterval({ start: startOfWeek(monthStart, { weekStartsOn: 1 }), end: monthEnd });

    // Pad to full weeks
    while (days.length % 7 !== 0) {
      days.push(new Date(days[days.length - 1].getTime() + 86400000));
    }

    return (
      <div className="flex-1 overflow-auto pb-20">
        {/* Stats Overview */}
        {statsData && (
          <section className="px-4 pt-6 pb-4 stagger-fade-in">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-[var(--radius)] bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface-1)] border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-xs text-[var(--text-muted)]">Strength Increase</span>
                </div>
                <span className={`font-display text-3xl font-bold ${statsData.strengthGainPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {statsData.strengthGainPercent >= 0 ? '+' : ''}{statsData.strengthGainPercent}
                </span>
                <span className="text-sm text-[var(--text-muted)] ml-1">%</span>
              </div>
              <div className="p-4 rounded-[var(--radius)] bg-[var(--surface-1)] border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-[var(--text-muted)]" />
                  <span className="text-xs text-[var(--text-muted)]">Sessions/Woche</span>
                </div>
                <span className="font-display text-3xl font-bold">{statsData.sessionsPerWeek}</span>
              </div>
              <div className="p-4 rounded-[var(--radius)] bg-[var(--surface-1)] border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-2">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span className="text-xs text-[var(--text-muted)]">Streak</span>
                </div>
                <span className="font-display text-3xl font-bold">{statsData.currentStreak}</span>
                <span className="text-sm text-[var(--text-muted)] ml-1">Wochen</span>
              </div>
              <div className="p-4 rounded-[var(--radius)] bg-[var(--surface-1)] border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarIcon className="w-4 h-4 text-[var(--text-muted)]" />
                  <span className="text-xs text-[var(--text-muted)]">Total</span>
                </div>
                <span className="font-display text-3xl font-bold">{statsData.totalSessions}</span>
                <span className="text-sm text-[var(--text-muted)] ml-1">Sessions</span>
              </div>
            </div>
          </section>
        )}

        {/* Calendar Heatmap */}
        <section className="px-4 pt-4 pb-6 stagger-fade-in stagger-delay-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[var(--text-muted)] flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" />
              Trainings-Kalender
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface-1)] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium min-w-[100px] text-center">
                {format(calendarMonth, 'MMMM yyyy', { locale: de })}
              </span>
              <button
                onClick={() => setCalendarMonth(new Date(calendarMonth.getTime() + 30 * 86400000))}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface-1)] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
              <div key={day} className="text-center text-xs text-[var(--text-dim)] py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const intensity = getHeatmapIntensity(dateStr);
              const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
              const isToday = isSameDay(day, new Date());
              const hasPRs = (prsByDate[dateStr]?.length || 0) > 0;

              return (
                <button
                  key={idx}
                  onClick={() => hasPRs && openDayDetail(day)}
                  disabled={!hasPRs}
                  className={`
                    aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-all
                    ${!isCurrentMonth ? 'opacity-30' : ''}
                    ${isToday ? 'ring-2 ring-[var(--accent)]' : ''}
                    ${intensity === 'none' ? 'bg-[var(--surface-1)]' : ''}
                    ${intensity === 'low' ? 'bg-[var(--accent)]/20' : ''}
                    ${intensity === 'medium' ? 'bg-[var(--accent)]/40' : ''}
                    ${intensity === 'high' ? 'bg-[var(--accent)]/60' : ''}
                    ${hasPRs ? 'cursor-pointer hover:ring-2 hover:ring-[var(--accent)]/50' : 'cursor-default'}
                  `}
                >
                  <span className={isToday ? 'font-bold' : ''}>{format(day, 'd')}</span>
                  {hasPRs && (
                    <div className="flex gap-0.5 mt-0.5">
                      <div className="w-1 h-1 rounded-full bg-[var(--accent)]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-[var(--text-dim)]">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-[var(--surface-1)]" />
              <span>0</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-[var(--accent)]/20" />
              <span>1-2</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-[var(--accent)]/40" />
              <span>3-4</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-[var(--accent)]/60" />
              <span>5+</span>
            </div>
          </div>
        </section>

        {/* Top Exercises */}
        {statsData && statsData.topExercises.length > 0 && (
          <section className="px-4 pb-6 stagger-fade-in stagger-delay-2">
            <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 flex items-center gap-2">
              <Award className="w-4 h-4" />
              Top Übungen
            </h2>
            <div className="space-y-2">
              {statsData.topExercises.map((ex, idx) => (
                <div
                  key={ex.record_id}
                  onClick={() => handleExerciseClick(ex)}
                  className="flex items-center justify-between p-3 rounded-[var(--radius)] bg-[var(--surface-1)] border border-[var(--border)] cursor-pointer hover:border-[var(--accent)]/50 transition-all press-feedback"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-xs font-bold">
                      {idx + 1}
                    </span>
                    <span className="font-medium">{ex.fields.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-display font-bold text-[var(--accent)]">{ex.bestKg}</span>
                    <span className="text-xs text-[var(--text-muted)] ml-1">kg</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
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
      {view === 'stats' && <StatsView />}

      {/* PR Add Sheet with "Heute vs. Letztes Mal" */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="h-[90dvh] rounded-t-[var(--radius-sheet)] bg-[var(--surface-3)] border-t border-[var(--border)] p-0"
        >
          <div className="flex flex-col h-full">
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-[var(--border-dim)]">
              <SheetTitle className="font-display text-xl font-bold">PR eintragen</SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-auto px-6 py-6 space-y-5">
              {/* Exercise Selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[var(--text-muted)]">Übung</Label>
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

              {/* Weight Input */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[var(--text-muted)]">Gewicht (kg)</Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="z.B. 80"
                  value={formData.weight_kg}
                  onChange={(e) => setFormData((prev) => ({ ...prev, weight_kg: e.target.value }))}
                  className="h-16 text-3xl font-display font-bold text-center bg-[var(--surface-2)] border-[var(--border)] rounded-[var(--radius-button)] focus:border-[var(--accent)]"
                />
              </div>

              {/* Comparison: Shows last PR or live diff */}
              {lastPRForExercise && (
                <div className={`p-4 rounded-[var(--radius)] border ${liveComparison ? 'bg-gradient-to-r from-[var(--accent)]/10 to-transparent border-[var(--accent)]/30' : 'bg-[var(--surface-2)] border-[var(--border)]'}`}>
                  {liveComparison ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-4 h-4 text-[var(--accent)]" />
                        <span className="text-sm font-medium text-[var(--accent)]">vs. Letztes Mal</span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <span className={liveComparison.weightDiff >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {liveComparison.weightDiff >= 0 ? '+' : ''}{liveComparison.weightDiff}kg
                        </span>
                        <span className={liveComparison.repsDiff >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {liveComparison.repsDiff >= 0 ? '+' : ''}{liveComparison.repsDiff} reps
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <History className="w-4 h-4 text-[var(--text-muted)]" />
                        <span className="text-xs text-[var(--text-muted)]">Letztes Mal</span>
                      </div>
                      <span className="font-display text-lg font-bold">
                        {lastPRForExercise.fields.weight_kg}kg × {lastPRForExercise.fields.reps}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Reps & Sets */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[var(--text-muted)]">Wiederholungen</Label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decrementValue('reps')}
                      className="w-10 h-10 flex items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors press-feedback"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <Input
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
                  <Label className="text-sm font-medium text-[var(--text-muted)]">Sätze</Label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decrementValue('sets')}
                      className="w-10 h-10 flex items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors press-feedback"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <Input
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
                <Label className="text-sm font-medium text-[var(--text-muted)]">Datum</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                  className="h-12 bg-[var(--surface-2)] border-[var(--border)] rounded-[var(--radius-button)]"
                />
              </div>

              {/* Note */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[var(--text-muted)]">Notiz (optional)</Label>
                <Textarea
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

      {/* Day Detail Sheet */}
      <Sheet open={dayDetailOpen} onOpenChange={setDayDetailOpen}>
        <SheetContent
          side="bottom"
          className="h-[60dvh] rounded-t-[var(--radius-sheet)] bg-[var(--surface-3)] border-t border-[var(--border)] p-0"
        >
          <div className="flex flex-col h-full">
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-[var(--border-dim)]">
              <SheetTitle className="font-display text-xl font-bold">
                {selectedDate && format(selectedDate, 'EEEE, dd. MMMM yyyy', { locale: de })}
              </SheetTitle>
              <p className="text-sm text-[var(--text-muted)]">
                {prsForSelectedDate.length} Übung{prsForSelectedDate.length !== 1 ? 'en' : ''}
              </p>
            </SheetHeader>

            <div className="flex-1 overflow-auto px-6 py-4 space-y-2">
              {prsForSelectedDate.map((pr) => (
                <div
                  key={pr.record_id}
                  className="p-4 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)]"
                >
                  <h3 className="font-display font-bold mb-2">{pr.exerciseName}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-2xl font-bold text-[var(--accent)]">
                      {pr.fields.weight_kg}
                    </span>
                    <span className="text-sm text-[var(--text-muted)]">kg</span>
                    <span className="text-[var(--text-muted)] mx-1">×</span>
                    <span className="font-display text-lg font-semibold">{pr.fields.reps}</span>
                    <span className="text-sm text-[var(--text-muted)]">reps</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Bottom Tab Bar - 2 Tabs */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-dim)] bg-[var(--surface-2)]/95 backdrop-blur-lg">
        <div className="flex items-center justify-around h-16 max-w-md mx-auto px-4">
          <button
            onClick={() => setView('home')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors press-feedback ${
              view === 'home' || view === 'exercise-detail'
                ? 'text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <Home className="w-6 h-6" style={{ strokeWidth: view === 'home' || view === 'exercise-detail' ? 2.5 : 2 }} />
            <span className={`text-xs font-medium ${view === 'home' || view === 'exercise-detail' ? 'font-bold' : ''}`}>
              Home
            </span>
          </button>
          <button
            onClick={() => setView('stats')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors press-feedback ${
              view === 'stats' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <CalendarIcon className="w-6 h-6" style={{ strokeWidth: view === 'stats' ? 2.5 : 2 }} />
            <span className={`text-xs font-medium ${view === 'stats' ? 'font-bold' : ''}`}>Stats</span>
          </button>
        </div>
      </div>


      {/* Confetti Animation - CSS only, no state change needed to hide */}
      {showConfetti && (
        <div 
          key={confettiKey}
          className="fixed inset-0 pointer-events-none z-50 overflow-hidden animate-confetti-container"
        >
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-20px',
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            >
              <span className="text-2xl">{['🎉', '💪', '🔥', '⭐', '🏆'][Math.floor(Math.random() * 5)]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Share Card Overlay - Fullscreen Instagram Story */}
      {shareCardOpen && shareData && (
        <div
          className="fixed inset-0 z-[100] flex flex-col"
          style={{
            background: 'linear-gradient(165deg, #1a1a24 0%, #0a0a0f 40%, #0d0d14 60%, #141419 100%)',
          }}
        >
          {/* Close Button - wird beim Screenshot nicht sichtbar wenn man schnell ist */}
          <button
            onClick={() => setShareCardOpen(false)}
            className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {/* Decorative Glow Elements */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-[var(--accent)]/15 rounded-full blur-[100px] -translate-y-1/3 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-[var(--accent)]/10 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/3" />
          <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-[var(--accent)]/5 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2" />

          {/* Content - Fullscreen */}
          <div className="relative flex-1 flex flex-col px-8 py-12 safe-area-inset">
            {/* Top: PR Badge */}
            {shareData.isPR && (
              <div className="flex justify-center mb-6">
                <div className="px-5 py-2.5 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/40 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-[var(--accent)]" />
                  <span className="text-base font-bold text-[var(--accent)] tracking-wide">NEW PR</span>
                </div>
              </div>
            )}

            {/* Exercise Name */}
            <div className="text-center mt-auto mb-8">
              <h2 className="font-display text-3xl font-bold text-white mb-2 leading-tight">
                {shareData.exerciseName}
              </h2>
              <p className="text-base text-white/40">
                {shareData.date && format(new Date(shareData.date), 'dd. MMMM yyyy', { locale: de })}
              </p>
            </div>

            {/* Main Stats - Hero */}
            <div className="text-center mb-10">
              <div className="flex items-baseline justify-center gap-3 mb-3">
                <span
                  className="font-display text-8xl font-bold text-[var(--accent)]"
                  style={{ textShadow: '0 0 60px rgba(255, 143, 168, 0.6), 0 0 120px rgba(255, 143, 168, 0.3)' }}
                >
                  {shareData.weight}
                </span>
                <span className="text-3xl text-white/50 font-medium">kg</span>
              </div>
              <div className="flex items-center justify-center gap-4 text-2xl text-white/70">
                <span className="font-display font-semibold">{shareData.reps}</span>
                <span className="text-white/40">reps</span>
                <span className="text-white/20">×</span>
                <span className="font-display font-semibold">{shareData.sets}</span>
                <span className="text-white/40">sets</span>
              </div>
            </div>

            {/* Total PRs Badge */}
            {shareData.totalPRs && shareData.totalPRs > 1 && (
              <div className="flex justify-center mt-8">
                <div className="flex items-center gap-2 text-white/40 text-base">
                  <Award className="w-5 h-5" />
                  <span>{shareData.totalPRs} PRs total</span>
                </div>
              </div>
            )}

            {/* Bottom Branding */}
            <div className="mt-auto pt-8 flex items-center justify-center gap-3 text-white/25">
              <Dumbbell className="w-5 h-5" />
              <span className="text-sm font-medium tracking-[0.2em]">PR TRACKER</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
