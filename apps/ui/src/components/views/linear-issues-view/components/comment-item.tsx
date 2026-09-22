import { User } from 'lucide-react';
import { Markdown } from '@/components/ui/markdown';
import type { LinearComment } from '@/lib/electron';
import { formatDate } from '../utils';

interface CommentItemProps {
  comment: LinearComment;
}

export function CommentItem({ comment }: CommentItemProps) {
  const authorName = comment.user?.name ?? 'Unknown';

  return (
    <div className="p-3 rounded-lg bg-background border border-border">
      {/* Comment Header */}
      <div className="flex items-center gap-2 mb-2">
        {comment.user?.avatarUrl ? (
          <img src={comment.user.avatarUrl} alt={authorName} className="h-6 w-6 rounded-full" />
        ) : (
          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
            <User className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
        <span className="text-sm font-medium">{authorName}</span>
        <span className="text-xs text-muted-foreground">
          commented {formatDate(comment.createdAt)}
        </span>
      </div>

      {/* Comment Body */}
      {comment.body ? (
        <Markdown className="text-sm">{comment.body}</Markdown>
      ) : (
        <p className="text-sm text-muted-foreground italic">No content</p>
      )}
    </div>
  );
}
