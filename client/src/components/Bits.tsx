import type { ReactNode } from 'react';
import { BOARD_META } from '../api';
import type { Board } from '../types';

export function BoardBadge({ board }: { board: Board }) {
  const meta = BOARD_META[board] || BOARD_META.algebra;
  return (
    <span className={`board-badge ${meta.tone}`}>
      {meta.icon} {meta.name}
    </span>
  );
}

const STATUS_LABELS: Record<string, { text: string; tone: string }> = {
  pending: { text: '待完成', tone: 'pending' },
  draft: { text: '草稿', tone: 'pending' },
  submitted: { text: '已提交', tone: 'submitted' },
  graded: { text: '已批阅', tone: 'graded' },
  withdrawn: { text: '已撤回', tone: 'withdrawn' },
};

export function StatusBadge({ status }: { status: string }) {
  const info = STATUS_LABELS[status] || { text: status, tone: 'pending' };
  return <span className={`status-badge ${info.tone}`}>{info.text}</span>;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className={`modal${wide ? ' wide' : ''}`} onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
