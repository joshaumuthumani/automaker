import { Circle, CheckCircle2, ExternalLink, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LinearIssueRowProps } from '../types';
import { isClosedState } from '../utils';

export function IssueRow({
  issue,
  isSelected,
  onClick,
  onOpenExternal,
  formatDate,
}: LinearIssueRowProps) {
  const isClosed = isClosedState(issue.state);

  return (
    <div
      className={cn(
        'group flex items-start gap-3 p-3 cursor-pointer hover:bg-accent/50 transition-colors',
        isSelected && 'bg-accent'
      )}
      onClick={onClick}
    >
      {isClosed ? (
        <CheckCircle2 className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
      ) : (
        <Circle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{issue.title}</span>
        </div>

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {issue.identifier} opened {formatDate(issue.createdAt)}
            {issue.team ? ` in ${issue.team.name}` : ''}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Workflow state */}
          <span
            className="px-1.5 py-0.5 text-[10px] font-medium rounded-full"
            style={{
              backgroundColor: `${issue.state.color}20`,
              color: issue.state.color,
              border: `1px solid ${issue.state.color}40`,
            }}
          >
            {issue.state.name}
          </span>

          {/* Labels */}
          {issue.labels.map((label) => (
            <span
              key={label.id}
              className="px-1.5 py-0.5 text-[10px] font-medium rounded-full"
              style={{
                backgroundColor: `${label.color}20`,
                color: label.color,
                border: `1px solid ${label.color}40`,
              }}
            >
              {label.name}
            </span>
          ))}

          {/* Assignee indicator */}
          {issue.assignee && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <User className="h-3 w-3" />
              {issue.assignee.name}
            </span>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="flex-shrink-0 opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onOpenExternal();
        }}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
