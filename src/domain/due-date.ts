import {
  DUE_DATE_STATUS_LABELS,
  DUE_SOON_THRESHOLD_DAYS,
} from './types.ts';
import type {
  DomainError,
  DueDateEvaluation,
  Result,
} from './types.ts';

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function parseCalendarDateToUtcMs(value: string): number | null {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const utcMs = Date.UTC(year, month - 1, day);
  const check = new Date(utcMs);

  // Guard against calendar rollovers (e.g. 2026-02-29 or 2026-04-31)
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return utcMs;
}

function getCurrentUtcMidnightMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function resolveReferenceUtcMs(referenceDate?: Date | string): number {
  if (referenceDate === undefined) {
    return getCurrentUtcMidnightMs();
  }

  if (referenceDate instanceof Date) {
    if (Number.isNaN(referenceDate.getTime())) {
      return getCurrentUtcMidnightMs();
    }
    return Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
    );
  }

  const calendarMs = parseCalendarDateToUtcMs(referenceDate);
  if (calendarMs !== null) {
    return calendarMs;
  }

  const parsed = new Date(referenceDate);
  if (Number.isNaN(parsed.getTime())) {
    return getCurrentUtcMidnightMs();
  }

  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

export function validateDueDate(dueDate: string | null): Result<string | null, DomainError> {
  if (dueDate === null) {
    return { ok: true, value: null };
  }

  if (typeof dueDate !== 'string' || parseCalendarDateToUtcMs(dueDate) === null) {
    return {
      ok: false,
      error: {
        code: 'INVALID_DUE_DATE',
        message: 'La fecha límite debe tener el formato válido AAAA-MM-DD.',
        field: 'dueDate',
      },
    };
  }

  return { ok: true, value: dueDate };
}

export function getDueDateEvaluation(
  dueDate: string | null,
  referenceDate?: Date | string,
): DueDateEvaluation {
  if (dueDate === null) {
    return {
      status: 'none',
      label: DUE_DATE_STATUS_LABELS.none,
      daysRemaining: null,
    };
  }

  const dueUtcMs = parseCalendarDateToUtcMs(dueDate);
  if (dueUtcMs === null) {
    return {
      status: 'none',
      label: DUE_DATE_STATUS_LABELS.none,
      daysRemaining: null,
    };
  }

  const refUtcMs = resolveReferenceUtcMs(referenceDate);
  const daysRemaining = Math.round((dueUtcMs - refUtcMs) / MS_PER_DAY);

  if (daysRemaining < 0) {
    return {
      status: 'overdue',
      label: DUE_DATE_STATUS_LABELS.overdue,
      daysRemaining,
    };
  }

  if (daysRemaining <= DUE_SOON_THRESHOLD_DAYS) {
    return {
      status: 'due_soon',
      label: DUE_DATE_STATUS_LABELS.due_soon,
      daysRemaining,
    };
  }

  return {
    status: 'on_track',
    label: DUE_DATE_STATUS_LABELS.on_track,
    daysRemaining,
  };
}
