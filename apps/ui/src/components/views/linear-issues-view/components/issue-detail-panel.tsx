import {
  Circle,
  CheckCircle2,
  CheckCircle,
  Clock,
  X,
  Wand2,
  RefreshCw,
  ExternalLink,
  User,
  Flag,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Plus,
  ArrowLeft,
} from 'lucide-react';
import { useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Markdown } from '@/components/ui/markdown';
import { cn } from '@/lib/utils';
import type { LinearIssueDetailPanelProps } from '../types';
import { getPriorityLabel, isClosedState, isValidationStale } from '../utils';
import { ModelOverrideTrigger } from '@/components/shared';
import { useIssueComments } from '../hooks';
import { CommentItem } from './comment-item';

export function IssueDetailPanel({
  issue,
  validatingIssues,
  cachedValidations,
  onValidateIssue,
  onViewCachedValidation,
  onOpenInLinear,
  onClose,
  onShowRevalidateConfirm,
  onCreateFeature,
  formatDate,
  modelOverride,
  isMobile = false,
}: LinearIssueDetailPanelProps) {
  const isClosed = isClosedState(issue.state);
  const isValidating = validatingIssues.has(issue.identifier);
  const cached = cachedValidations.get(issue.identifier);
  const isStale = cached ? isValidationStale(cached.validatedAt) : false;

  // Comments state
  const [commentsExpanded, setCommentsExpanded] = useState(true);
  const [includeCommentsInAnalysis, setIncludeCommentsInAnalysis] = useState(true);
  const {
    comments,
    totalCount,
    loading: commentsLoading,
    error: commentsError,
  } = useIssueComments(issue.id);

  // Helper to get validation options with comments
  const getValidationOptions = (forceRevalidate = false) => {
    return {
      forceRevalidate,
      modelEntry: modelOverride.effectiveModelEntry, // Pass the full PhaseModelEntry to preserve thinking level
      comments: includeCommentsInAnalysis && comments.length > 0 ? comments : undefined,
    };
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Detail Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="shrink-0 -ml-1"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          {isClosed ? (
            <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" />
          ) : (
            <Circle className="h-4 w-4 text-green-500 shrink-0" />
          )}
          <span className="text-sm font-medium truncate">
            {issue.identifier} {issue.title}
          </span>
        </div>
        <div className={cn('flex items-center gap-2 shrink-0', isMobile && 'gap-1')}>
          {(() => {
            if (isValidating) {
              return (
                <Button variant="default" size="sm" loading>
                  {isMobile ? '...' : 'Validating...'}
                </Button>
              );
            }

            if (cached && !isStale) {
              return (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewCachedValidation(issue)}
                    aria-label="View Result"
                    title="View Result"
                  >
                    <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                    {!isMobile && 'View Result'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onShowRevalidateConfirm(getValidationOptions(true))}
                    title="Re-validate"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </>
              );
            }

            if (cached && isStale) {
              return (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewCachedValidation(issue)}
                    aria-label="View (stale)"
                    title="View (stale)"
                  >
                    <Clock className="h-4 w-4 mr-1 text-yellow-500" />
                    {!isMobile && 'View (stale)'}
                  </Button>
                  <ModelOverrideTrigger
                    currentModelEntry={modelOverride.effectiveModelEntry}
                    onModelChange={modelOverride.setOverride}
                    phase="validationModel"
                    isOverridden={modelOverride.isOverridden}
                    size="sm"
                    variant="icon"
                    className="mx-1"
                  />
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onValidateIssue(issue, getValidationOptions(true))}
                    aria-label="Re-validate"
                    title="Re-validate"
                  >
                    <Wand2 className="h-4 w-4 mr-1" />
                    {!isMobile && 'Re-validate'}
                  </Button>
                </>
              );
            }

            return (
              <>
                <ModelOverrideTrigger
                  currentModelEntry={modelOverride.effectiveModelEntry}
                  onModelChange={modelOverride.setOverride}
                  phase="validationModel"
                  isOverridden={modelOverride.isOverridden}
                  size="sm"
                  variant="icon"
                  className="mr-1"
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onValidateIssue(issue, getValidationOptions())}
                  aria-label="Validate with AI"
                  title="Validate with AI"
                >
                  <Wand2 className="h-4 w-4 mr-1" />
                  {!isMobile && 'Validate with AI'}
                </Button>
              </>
            );
          })()}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onCreateFeature(issue)}
            aria-label="Create Feature"
            title="Create a new feature to address this issue"
          >
            <Plus className={cn('h-4 w-4', !isMobile && 'mr-1')} />
            {!isMobile && 'Create Feature'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenInLinear(issue.url)}
            aria-label="Open in Linear"
            title="Open in Linear"
          >
            <ExternalLink className="h-4 w-4" />
            {!isMobile && <span className="ml-1">Open in Linear</span>}
          </Button>
          {!isMobile && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Issue Detail Content */}
      <div className={cn('flex-1 overflow-auto', isMobile ? 'p-4' : 'p-6')}>
        {/* Title */}
        <h1 className="text-xl font-bold mb-2">{issue.title}</h1>

        {/* Meta info */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4 flex-wrap">
          <span
            className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: `${issue.state.color}20`,
              color: issue.state.color,
            }}
          >
            {issue.state.name}
          </span>
          <span>
            {issue.identifier} opened {formatDate(issue.createdAt)}
            {issue.team && (
              <>
                {' in '}
                <span className="font-medium text-foreground">{issue.team.name}</span>
              </>
            )}
          </span>
        </div>

        {/* Priority */}
        <div className="flex items-center gap-2 mb-4">
          <Flag className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Priority:</span>
          <span className="text-sm font-medium">{getPriorityLabel(issue.priority)}</span>
        </div>

        {/* Labels */}
        {issue.labels.length > 0 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {issue.labels.map((label) => (
              <span
                key={label.id}
                className="px-2 py-0.5 text-xs font-medium rounded-full"
                style={{
                  backgroundColor: `${label.color}20`,
                  color: label.color,
                  border: `1px solid ${label.color}40`,
                }}
              >
                {label.name}
              </span>
            ))}
          </div>
        )}

        {/* Assignee */}
        {issue.assignee && (
          <div className="flex items-center gap-2 mb-4">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Assigned to:</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
              {issue.assignee.avatarUrl && (
                <img
                  src={issue.assignee.avatarUrl}
                  alt={issue.assignee.name}
                  className="h-4 w-4 rounded-full"
                />
              )}
              {issue.assignee.name}
            </span>
          </div>
        )}

        {/* Description */}
        {issue.description ? (
          <Markdown className="text-sm">{issue.description}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground italic">No description provided.</p>
        )}

        {/* Comments Section */}
        <div className="mt-6 p-3 rounded-lg bg-muted/30 border border-border">
          <div className="flex items-center justify-between">
            <button
              className="flex items-center gap-2 text-left"
              onClick={() => setCommentsExpanded(!commentsExpanded)}
            >
              <MessageSquare className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">
                Comments {totalCount > 0 && `(${totalCount})`}
              </span>
              {commentsLoading && <Spinner size="xs" />}
              {commentsExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {comments.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={includeCommentsInAnalysis}
                  onCheckedChange={setIncludeCommentsInAnalysis}
                />
                Include in AI analysis
              </label>
            )}
          </div>

          {commentsExpanded && (
            <div className="mt-3">
              {commentsError ? (
                <p className="text-sm text-red-500">{commentsError}</p>
              ) : comments.length === 0 && !commentsLoading ? (
                <p className="text-sm text-muted-foreground italic">No comments yet.</p>
              ) : (
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <CommentItem key={comment.id} comment={comment} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Create Feature CTA */}
        {isMobile && (
          <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Plus className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Create Feature</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Create a new feature task to address this issue.
            </p>
            <Button variant="secondary" onClick={() => onCreateFeature(issue)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Feature
            </Button>
          </div>
        )}

        {/* Open in Linear CTA */}
        <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border">
          <p className="text-sm text-muted-foreground mb-3">
            Update status, add reactions, and more in Linear.
          </p>
          <Button onClick={() => onOpenInLinear(issue.url)}>
            <ExternalLink className="h-4 w-4 mr-2" />
            View Full Issue in Linear
          </Button>
        </div>
      </div>
    </div>
  );
}
