/**
 * Linear priority values, from the API's numeric `priority` field.
 * See https://linear.app/docs for the canonical ordering.
 */
export const LINEAR_PRIORITY_LABELS: Record<number, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

/** Workflow state types that mean the issue is no longer active */
export const LINEAR_CLOSED_STATE_TYPES = ['completed', 'canceled'];
