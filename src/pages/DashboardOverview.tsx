import { useState, useEffect, useRef, useMemo } from 'react';
import { format, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, subMonths, subDays, startOfWeek, getWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  IconTrendingUp,
  IconPlus,
  IconSearch,
  IconBarbell,
  IconCalendar,
  IconChevronRight,
  IconChevronLeft,
  IconMinus,
  IconActivity,
  IconTrophy,
  IconHistory,
  IconHome,
  IconNote,
  IconFlame,
  IconBolt,
  IconAward,
  IconShare,
  IconX,
  IconSparkles,
} from '@tabler/icons-react';
import type { Uebungen, PrEintraege } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { useActions } from '@/context/ActionsContext';

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

// Exercise avatar helper - generates a colored circle with a 2-letter abbreviation
function getExerciseAvatar(name?: string): { color: string; letter: string } {
  if (!name) return { color: 'hsl(0, 60%, 52%)', letter: '?' };
  // Hash the full name for a stable unique value
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Distribute across full 360° hue spectrum → virtually no color collisions
  const hue = Math.abs(hash) % 360;
  const saturation = 55 + (Math.abs(hash >> 4) % 18); // 55–72%
  const lightness = 46 + (Math.abs(hash >> 8) % 14);  // 46–59%
  const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  // 2-letter abbreviation: initials from first 2 words, or first 2 chars
  const words = name.trim().split(/\s+/);
  const letter = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { color, letter };
}

// === DARK THEME (scoped to Dashboard, overrides global CSS vars) ===
const DARK_THEME: React.CSSProperties = {
  '--background': '#0a0a0f',
  '--foreground': '#e8e8f0',
  '--surface-1': '#141419',
  '--surface-2': '#1c1c24',
  '--surface-3': '#252530',
  '--text': '#e8e8f0',
  '--text-muted': '#a0a0b0',
  '--text-dim': '#727280',
  '--accent': '#ff8fa8',
  '--accent-hover': '#ffa8bc',
  '--accent-glow': 'rgba(255, 143, 168, 0.35)',
  '--border': '#2a2a35',
  '--border-dim': '#1a1a20',
  '--radius': '0.75rem',
  '--radius-sheet': '1rem',
  '--radius-chip': '624.9375rem',
  '--radius-button': '0.625rem',
  '--font-display': "'Space Grotesk', system-ui, sans-serif",
  background: '#0a0a0f',
  color: '#e8e8f0',
} as React.CSSProperties;

// === MAIN COMPONENT ===
export default function Dashboard() {
  // State Management
  const [view, setView] = useState<ViewType>('stats');
  const [selectedExercise, setSelectedExercise] = useState<ExerciseWithPRs | null>(null);
  const [exercises, setExercises] = useState<ExerciseWithPRs[]>([]);
  const [allPrEntries, setAllPrEntries] = useState<PrEintraege[]>([]);
  const [recentPRs, setRecentPRs] = useState<Array<PrEintraege & { exerciseName: string }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [showNewExerciseForm, setShowNewExerciseForm] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
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

  // Real AI chat via global ChatWidget
  const { setChatOpen } = useActions();

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

      // Recent PRs for Hero Carousel - sort by creation time (when added to system)
      const recent = prEintraege
        .sort((a, b) => {
          const createdA = a.createdat ? new Date(a.createdat).getTime() : 0;
          const createdB = b.createdat ? new Date(b.createdat).getTime() : 0;
          return createdB - createdA;
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
    const exercise = exerciseId ? exercises.find((ex) => ex.record_id === exerciseId) : null;
    setFormData({
      exercise_id: exerciseId || '',
      date: format(new Date(), 'yyyy-MM-dd'),
      weight_kg: exercise?.lastPR?.fields.weight_kg ? String(exercise.lastPR.fields.weight_kg) : '',
      reps: exercise?.lastPR?.fields.reps ? String(exercise.lastPR.fields.reps) : '',
      sets: exercise?.lastPR?.fields.sets ? String(exercise.lastPR.fields.sets) : '1',
      note: '',
    });
    setExerciseSearch('');
    setShowNewExerciseForm(false);
    setNewExerciseName('');
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

  async function handleCreateExercise() {
    const name = newExerciseName.trim();
    if (!name) return;
    try {
      await LivingAppsService.createUebungenEntry({ name });
      await loadData();
      setShowNewExerciseForm(false);
      setNewExerciseName('');
      setExerciseSearch(name); // zeigt neue Übung gefiltert an
      toast.success(`"${name}" angelegt`);
    } catch {
      toast.error('Fehler beim Anlegen');
    }
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
                <IconChevronRight className="w-5 h-5 rotate-180" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <IconBarbell className="w-5 h-5 text-[var(--accent)]" />
              <h1 className="font-display font-bold text-lg">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openPRSheet()}
              className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-all press-feedback glow-accent"
            >
              <IconPlus className="w-5 h-5" />
            </button>
          </div>
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
              <IconTrendingUp className="w-4 h-4" />
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
                        <IconNote className="w-3 h-3" />
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
                    <IconCalendar className="w-3 h-3" />
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
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
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
            <IconActivity className="w-4 h-4" />
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
                  className="flex items-center gap-3 p-3 rounded-[var(--radius)] bg-[var(--surface-1)] border border-[var(--border)] hover:border-[var(--accent)]/30 hover:bg-[var(--surface-2)] transition-all"
                  style={{
                    animation: 'fade-in-stagger 0.4s ease-out forwards',
                    animationDelay: `${idx * 60}ms`,
                    opacity: 0,
                  }}
                >
                  {/* Avatar circle with 2-letter abbreviation */}
                  <div
                    className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white font-display font-bold text-xs tracking-tight cursor-pointer"
                    style={{ backgroundColor: getExerciseAvatar(ex.fields.name).color }}
                    onClick={() => handleExerciseClick(ex)}
                  >
                    {getExerciseAvatar(ex.fields.name).letter}
                  </div>
                  {/* Exercise info - clickable area for detail view */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => handleExerciseClick(ex)}
                  >
                    <h3 className="font-display font-bold text-base mb-1 truncate">
                      {ex.fields.name}
                    </h3>
                    {ex.lastPR ? (
                      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                        <span className="font-medium text-[var(--text)]">
                          {ex.lastPR.fields.weight_kg}kg × {ex.lastPR.fields.reps}
                        </span>
                        <span className="text-[var(--text-dim)]">·</span>
                        <span className="text-xs">
                          {ex.lastPR.fields.date &&
                            format(new Date(ex.lastPR.fields.date), 'dd.MM.yy', { locale: de })}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-[var(--text-dim)]">Noch kein PR</span>
                    )}
                  </div>
                  {/* Quick-add PR button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openPRSheet(ex.record_id);
                    }}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-all press-feedback glow-accent"
                    title="PR hinzufügen"
                  >
                    <IconPlus className="w-4 h-4" />
                  </button>
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
          <div className="flex items-center gap-4 mb-4">
            <div
              className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-white font-display font-bold text-base tracking-tight"
              style={{ backgroundColor: getExerciseAvatar(selectedExercise.fields.name).color }}
            >
              {getExerciseAvatar(selectedExercise.fields.name).letter}
            </div>
            <h1 className="font-display text-3xl font-bold leading-tight">
              {selectedExercise.fields.name}
            </h1>
          </div>

          {/* KPI Chips */}
          <div className="flex flex-wrap gap-2 mb-6">
            {selectedExercise.bestKg && (
              <div className="px-4 py-2 rounded-[var(--radius-chip)] bg-[var(--surface-2)] border border-[var(--border)] flex items-center gap-2">
                <IconTrophy className="w-4 h-4 text-[var(--accent)]" />
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
                <IconHistory className="w-4 h-4 text-[var(--text-muted)]" />
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
              <IconPlus className="w-5 h-5 mr-2" />
              PR hinzufügen
            </Button>
            {selectedExercise.lastPR && (
              <Button
                onClick={() => openShareCard(selectedExercise.lastPR!, selectedExercise.fields.name || '', selectedExercise.prs.length)}
                variant="outline"
                className="h-12 px-4 border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 rounded-[var(--radius-button)] press-feedback"
              >
                <IconShare className="w-5 h-5" />
              </Button>
            )}
          </div>
        </section>

        {/* Progress Charts */}
        {chartData.length >= 2 && (
          <section className="px-4 pb-6 stagger-fade-in stagger-delay-1">
            <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 flex items-center gap-2">
              <IconTrendingUp className="w-4 h-4" />
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
            <IconHistory className="w-4 h-4" />
            Verlauf ({selectedExercise.prs.length})
          </h2>

          {selectedExercise.prs.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)]">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--surface-1)] flex items-center justify-center">
                <IconHistory className="w-6 h-6" />
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
                        <IconShare className="w-4 h-4 text-[var(--text-dim)]" />
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
                  <IconTrendingUp className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-xs text-[var(--text-muted)]">Strength Increase</span>
                </div>
                <span className={`font-display text-3xl font-bold ${statsData.strengthGainPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {statsData.strengthGainPercent >= 0 ? '+' : ''}{statsData.strengthGainPercent}
                </span>
                <span className="text-sm text-[var(--text-muted)] ml-1">%</span>
              </div>
              <div className="p-4 rounded-[var(--radius)] bg-[var(--surface-1)] border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-2">
                  <IconActivity className="w-4 h-4 text-[var(--text-muted)]" />
                  <span className="text-xs text-[var(--text-muted)]">Sessions/Woche</span>
                </div>
                <span className="font-display text-3xl font-bold">{statsData.sessionsPerWeek}</span>
              </div>
              <div className="p-4 rounded-[var(--radius)] bg-[var(--surface-1)] border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-2">
                  <IconFlame className="w-4 h-4 text-orange-400" />
                  <span className="text-xs text-[var(--text-muted)]">Streak</span>
                </div>
                <span className="font-display text-3xl font-bold">{statsData.currentStreak}</span>
                <span className="text-sm text-[var(--text-muted)] ml-1">Wochen</span>
              </div>
              <div className="p-4 rounded-[var(--radius)] bg-[var(--surface-1)] border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-2">
                  <IconCalendar className="w-4 h-4 text-[var(--text-muted)]" />
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
              <IconCalendar className="w-4 h-4" />
              Trainings-Kalender
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface-1)] transition-colors"
              >
                <IconChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium min-w-[100px] text-center">
                {format(calendarMonth, 'MMMM yyyy', { locale: de })}
              </span>
              <button
                onClick={() => setCalendarMonth(new Date(calendarMonth.getTime() + 30 * 86400000))}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface-1)] transition-colors"
              >
                <IconChevronRight className="w-4 h-4" />
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
              <IconAward className="w-4 h-4" />
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
      <div className="phone-frame flex items-center justify-center min-h-screen bg-[var(--background)]" style={DARK_THEME}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-muted)]">Lädt...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-frame flex flex-col min-h-screen bg-[var(--background)] text-[var(--text)] overflow-x-hidden" style={DARK_THEME}>
      <Toaster position="top-center" />
      <TopAppBar />

      {view === 'home' && <HomeView />}
      {view === 'exercise-detail' && <ExerciseDetailView />}
      {view === 'stats' && <StatsView />}

      {/* PR Add Sheet with "Heute vs. Letztes Mal" */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="h-[90dvh] rounded-t-[var(--radius-sheet)] bg-[var(--surface-3)] border-t border-[var(--border)] p-0 overflow-x-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex flex-col h-full">
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-[var(--border-dim)]">
              <SheetTitle className="font-display text-xl font-bold">
                {formData.exercise_id
                  ? exercises.find(ex => ex.record_id === formData.exercise_id)?.fields.name || 'PR eintragen'
                  : 'PR eintragen'}
              </SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6 space-y-5">
              {/* Exercise Selector — visual list shown when no exercise pre-selected */}
              {!formData.exercise_id ? (
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-[var(--text-muted)]">Übung auswählen</Label>
                  {/* Search */}
                  <div className="relative">
                    <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <Input
                      placeholder="Suchen..."
                      value={exerciseSearch}
                      onChange={(e) => setExerciseSearch(e.target.value)}
                      className="pl-9 h-10 bg-[var(--surface-2)] border-[var(--border)] rounded-[var(--radius-button)]"
                    />
                  </div>
                  {/* Visual exercise list */}
                  <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-0.5">
                    {exercises
                      .filter((ex) =>
                        !exerciseSearch ||
                        ex.fields.name?.toLowerCase().includes(exerciseSearch.toLowerCase())
                      )
                      .map((ex) => {
                        const avatar = getExerciseAvatar(ex.fields.name);
                        return (
                          <button
                            key={ex.record_id}
                            type="button"
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                exercise_id: ex.record_id,
                                weight_kg: ex.lastPR?.fields.weight_kg ? String(ex.lastPR.fields.weight_kg) : '',
                                reps: ex.lastPR?.fields.reps ? String(ex.lastPR.fields.reps) : '',
                                sets: ex.lastPR?.fields.sets ? String(ex.lastPR.fields.sets) : '1',
                              }));
                              setExerciseSearch('');
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-[var(--radius)] bg-[var(--surface-2)] hover:bg-[var(--surface-1)] border border-[var(--border)] hover:border-[var(--accent)]/40 transition-all text-left press-feedback"
                          >
                            <div
                              className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white font-display font-bold text-xs tracking-tight"
                              style={{ backgroundColor: avatar.color }}
                            >
                              {avatar.letter}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{ex.fields.name}</div>
                              {ex.lastPR ? (
                                <div className="text-xs text-[var(--text-dim)] truncate">
                                  {ex.lastPR.fields.weight_kg} kg × {ex.lastPR.fields.reps} reps
                                </div>
                              ) : (
                                <div className="text-xs text-[var(--text-dim)]">Noch kein PR</div>
                              )}
                            </div>
                            <IconChevronRight className="shrink-0 w-4 h-4 text-[var(--text-dim)]" />
                          </button>
                        );
                      })}
                    {exercises.filter((ex) =>
                      !exerciseSearch ||
                      ex.fields.name?.toLowerCase().includes(exerciseSearch.toLowerCase())
                    ).length === 0 && (
                      <p className="text-center py-6 text-sm text-[var(--text-dim)]">
                        Keine Übungen gefunden
                      </p>
                    )}
                  </div>

                  {/* Neue Übung — subtle inline form */}
                  {!showNewExerciseForm ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewExerciseForm(true);
                        setNewExerciseName(exerciseSearch);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius)] text-sm text-[var(--text-dim)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <IconPlus className="w-3.5 h-3.5 shrink-0" />
                      <span>Neue Übung anlegen</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 pt-1">
                      <Input
                        autoFocus
                        placeholder="Name der Übung"
                        value={newExerciseName}
                        onChange={(e) => setNewExerciseName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateExercise();
                          if (e.key === 'Escape') {
                            setShowNewExerciseForm(false);
                            setNewExerciseName('');
                          }
                        }}
                        className="h-9 flex-1 bg-[var(--surface-2)] border-[var(--border)] rounded-[var(--radius-button)] text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleCreateExercise}
                        disabled={!newExerciseName.trim()}
                        className="h-9 px-3 rounded-[var(--radius-button)] bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-40 transition-opacity press-feedback"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowNewExerciseForm(false); setNewExerciseName(''); }}
                        className="h-9 w-9 flex items-center justify-center rounded-[var(--radius-button)] hover:bg-[var(--surface-2)] transition-colors"
                      >
                        <IconX className="w-4 h-4 text-[var(--text-dim)]" />
                      </button>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Weight Input */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[var(--text-muted)]">Gewicht (kg)</Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, weight_kg: String(Math.max(0, parseFloat(prev.weight_kg || '0') - 2.5)) }))}
                    className="shrink-0 w-14 h-16 flex flex-col items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors press-feedback"
                  >
                    <IconMinus className="w-4 h-4" />
                    <span className="text-[10px] text-[var(--text-dim)] mt-0.5">2.5</span>
                  </button>
                  <Input
                    type="number"
                    step="0.5"
                    placeholder="0"
                    value={formData.weight_kg}
                    onChange={(e) => setFormData((prev) => ({ ...prev, weight_kg: e.target.value }))}
                    className="h-16 text-3xl font-display font-bold text-center bg-[var(--surface-2)] border-[var(--border)] rounded-[var(--radius-button)] focus:border-[var(--accent)] min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, weight_kg: String(parseFloat(prev.weight_kg || '0') + 2.5) }))}
                    className="shrink-0 w-14 h-16 flex flex-col items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-2)] border border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors press-feedback"
                  >
                    <IconPlus className="w-4 h-4" />
                    <span className="text-[10px] mt-0.5">2.5</span>
                  </button>
                </div>
              </div>

              {/* Comparison: Shows last PR or live diff */}
              {lastPRForExercise && (
                <div className={`p-4 rounded-[var(--radius)] border ${liveComparison ? 'bg-gradient-to-r from-[var(--accent)]/10 to-transparent border-[var(--accent)]/30' : 'bg-[var(--surface-2)] border-[var(--border)]'}`}>
                  {liveComparison ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <IconBolt className="w-4 h-4 text-[var(--accent)]" />
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
                        <IconHistory className="w-4 h-4 text-[var(--text-muted)]" />
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
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[var(--text-muted)]">Wiederholungen</Label>
                  {/* Quick chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {[5, 6, 8, 10, 12, 15, 20].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, reps: String(r) }))}
                        className={`h-9 px-3 rounded-full text-sm font-medium border transition-colors press-feedback ${
                          formData.reps === String(r)
                            ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                            : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-muted)]'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  {/* Stepper for custom value */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decrementValue('reps')}
                      className="w-10 h-10 flex items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors press-feedback"
                    >
                      <IconMinus className="w-4 h-4" />
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
                      <IconPlus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[var(--text-muted)]">Sätze</Label>
                  {/* Quick chips for sets */}
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, sets: String(s) }))}
                        className={`h-9 w-10 rounded-full text-sm font-medium border transition-colors press-feedback shrink-0 ${
                          formData.sets === String(s)
                            ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                            : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-muted)]'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Date — quick chips */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[var(--text-muted)]">Datum</Label>
                <div className="flex gap-2">
                  {[
                    { label: 'Heute', value: format(new Date(), 'yyyy-MM-dd') },
                    { label: 'Gestern', value: format(subDays(new Date(), 1), 'yyyy-MM-dd') },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, date: opt.value }))}
                      className={`flex-1 h-11 rounded-[var(--radius-button)] border text-sm font-medium transition-colors press-feedback ${
                        formData.date === opt.value
                          ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                          : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {/* Custom date — only shown when neither today nor yesterday */}
                  <label className={`relative overflow-hidden h-11 px-3 flex items-center justify-center rounded-[var(--radius-button)] border cursor-pointer transition-colors press-feedback ${
                    formData.date !== format(new Date(), 'yyyy-MM-dd') && formData.date !== format(subDays(new Date(), 1), 'yyyy-MM-dd')
                      ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                      : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-muted)]'
                  }`}>
                    <IconCalendar className="w-4 h-4 relative z-10 pointer-events-none" />
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </label>
                </div>
                {/* Show selected date when custom */}
                {formData.date !== format(new Date(), 'yyyy-MM-dd') && formData.date !== format(subDays(new Date(), 1), 'yyyy-MM-dd') && (
                  <p className="text-xs text-[var(--text-dim)] pl-1">
                    {format(new Date(formData.date + 'T12:00:00'), 'EEEE, dd. MMMM yyyy', { locale: de })}
                  </p>
                )}
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

      {/* Bottom Tab Bar - 3 Tabs */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-dim)] bg-[var(--surface-2)]/95 backdrop-blur-lg">
        <div className="flex items-center justify-around h-16 max-w-md mx-auto px-4">
          <button
            onClick={() => setView('stats')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors press-feedback ${
              view === 'stats' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <IconHome className="w-6 h-6" stroke={view === 'stats' ? 2.5 : 1.5} />
            <span className={`text-xs font-medium ${view === 'stats' ? 'font-bold' : ''}`}>Home</span>
          </button>
          <button
            onClick={() => setView('home')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors press-feedback ${
              view === 'home' || view === 'exercise-detail'
                ? 'text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <IconBarbell className="w-6 h-6" stroke={view === 'home' || view === 'exercise-detail' ? 2.5 : 1.5} />
            <span className={`text-xs font-medium ${view === 'home' || view === 'exercise-detail' ? 'font-bold' : ''}`}>
              PRs
            </span>
          </button>
          <button
            onClick={() => setChatOpen(true)}
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors press-feedback text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            <div className="relative">
              <IconSparkles className="w-6 h-6" stroke={1.5} />
            </div>
            <span className="text-xs font-medium">KI</span>
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
            <IconX className="w-6 h-6 text-white" />
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
                  <IconTrophy className="w-5 h-5 text-[var(--accent)]" />
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
                  <IconAward className="w-5 h-5" />
                  <span>{shareData.totalPRs} PRs total</span>
                </div>
              </div>
            )}

            {/* Bottom Branding */}
            <div className="mt-auto pt-8 flex items-center justify-center gap-3 text-white/25">
              <IconBarbell className="w-5 h-5" />
              <span className="text-sm font-medium tracking-[0.2em]">PR TRACKER</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
