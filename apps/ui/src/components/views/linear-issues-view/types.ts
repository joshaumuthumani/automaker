import type { LinearIssue, LinearStoredValidation } from '@/lib/electron';
import type { ModelId, PhaseModelEntry } from '@automaker/types';
import type { ValidateLinearIssueOptions } from './hooks/use-issue-validation';

// ============================================================================
// Issues Filter State Types
// ============================================================================

/**
 * Available issue state filter values.
 *
 * Linear has no open/closed flag; "closed" means a workflow state whose type is
 * completed or canceled (see `isClosedState` in ./utils).
 */
export const LINEAR_STATE_FILTER_OPTIONS = ['open', 'closed', 'all'] as const;

export type LinearIssuesStateFilter = (typeof LINEAR_STATE_FILTER_OPTIONS)[number];

/**
 * Main filter state interface for the Linear Issues view
 */
export interface LinearIssuesFilterState {
  /** Filter by issue state (open/closed/all) */
  stateFilter: LinearIssuesStateFilter;
  /** Filter by selected labels (matches any) */
  selectedLabels: string[];
}

/**
 * Result of applying filters to the issues list
 */
export interface LinearIssuesFilterResult {
  /** Array of LinearIssue objects that match the current filters */
  matchedIssues: LinearIssue[];
  /** Available labels from all issues (for filter dropdown population) */
  availableLabels: string[];
  /** Whether any filter is currently active */
  hasActiveFilter: boolean;
  /** Total count of matched issues */
  matchedCount: number;
}

/**
 * Default values for LinearIssuesFilterState
 */
export const DEFAULT_LINEAR_ISSUES_FILTER_STATE: LinearIssuesFilterState = {
  stateFilter: 'open',
  selectedLabels: [],
};

// ============================================================================
// Component Props Types
// ============================================================================

export interface LinearIssueRowProps {
  issue: LinearIssue;
  isSelected: boolean;
  onClick: () => void;
  onOpenExternal: () => void;
  formatDate: (date: string) => string;
  /** Cached validation for this issue (if any) */
  cachedValidation?: LinearStoredValidation | null;
  /** Whether validation is currently running for this issue */
  isValidating?: boolean;
}

export interface LinearIssueDetailPanelProps {
  issue: LinearIssue;
  /** Identifiers of issues currently being validated */
  validatingIssues: Set<string>;
  /** Cached validations keyed by issue identifier */
  cachedValidations: Map<string, LinearStoredValidation>;
  onValidateIssue: (issue: LinearIssue, options?: ValidateLinearIssueOptions) => Promise<void>;
  onViewCachedValidation: (issue: LinearIssue) => Promise<void>;
  onOpenInLinear: (url: string) => void;
  onClose: () => void;
  /** Called when user wants to revalidate - receives the validation options including comments */
  onShowRevalidateConfirm: (options: ValidateLinearIssueOptions) => void;
  /** Called when user wants to create a feature to address this issue */
  onCreateFeature: (issue: LinearIssue) => void;
  formatDate: (date: string) => string;
  /** Model override state */
  modelOverride: {
    effectiveModelEntry: PhaseModelEntry;
    effectiveModel: ModelId;
    isOverridden: boolean;
    setOverride: (entry: PhaseModelEntry | null) => void;
  };
  /** Whether the view is in mobile mode - shows back button and full-screen detail */
  isMobile?: boolean;
}
