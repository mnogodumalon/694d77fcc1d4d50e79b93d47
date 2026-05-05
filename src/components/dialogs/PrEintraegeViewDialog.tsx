import type { PrEintraege, Uebungen } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { IconPencil } from '@tabler/icons-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd.MM.yyyy', { locale: de }); } catch { return d; }
}

interface PrEintraegeViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: PrEintraege | null;
  onEdit: (record: PrEintraege) => void;
  uebungenList: Uebungen[];
}

export function PrEintraegeViewDialog({ open, onClose, record, onEdit, uebungenList }: PrEintraegeViewDialogProps) {
  function getUebungenDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return uebungenList.find(r => r.record_id === id)?.fields.name ?? '—';
  }

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>PR-Einträge anzeigen</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            Bearbeiten
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Übung</Label>
            <p className="text-sm">{getUebungenDisplayName(record.fields.exercise_id)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Datum</Label>
            <p className="text-sm">{formatDate(record.fields.date)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Gewicht (kg)</Label>
            <p className="text-sm">{record.fields.weight_kg ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Wiederholungen</Label>
            <p className="text-sm">{record.fields.reps ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Sätze</Label>
            <p className="text-sm">{record.fields.sets ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notiz</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.note ?? '—'}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}