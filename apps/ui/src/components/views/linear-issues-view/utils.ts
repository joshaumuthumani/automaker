import type { LinearState } from '@/lib/electron';
import {
  LINEAR_CLOSED_STATE_TYPES,
  LINEAR_PRIORITY_LABELS,
  VALIDATION_STALENESS_HOURS,
} from './constants';

/**
 * Whether a Linear workflow state means the issue is finished.
 * Linear has no open/closed flag - state types carry that meaning.
 */
export function isClosedState(state: LinearState | null | undefined): boolean {
  return !!state && LINEAR_CLOSED_STATE_TYPES.includes(state.type);
}

/**
 * Human-readable label for Linear's numeric priority field.
 */
export function getPriorityLabel(priority: number): string {
  return LINEAR_PRIORITY_LABELS[priority] ?? 'No priority';
}

export function isValidationStale(validatedAt: string): boolean {
  const hoursSinceValidation = (Date.now() - new Date(validatedAt).getTime()) / (1000 * 60 * 60);
  return hoursSinceValidation > VALIDATION_STALENESS_HOURS;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
