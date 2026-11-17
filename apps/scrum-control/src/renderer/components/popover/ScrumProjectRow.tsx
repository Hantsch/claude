import type { ScrumRowModel } from '../../lib/projectRows.ts';
import { StatusDot } from '../StatusDot.tsx';
import { StatusRollup } from '../StatusRollup.tsx';
import { OpenWindowButton } from './OpenWindowButton.tsx';
import { WslBadge } from './WslBadge.tsx';

/**
 * The head of one scrum project in the popover (CONCEPT section 6): dot, name, sprint line and
 * Open window on the first line; the progress bar, the milestone and the session counts on the
 * second; the attention marks on a third only when there are any. It is one keyboard stop
 * (`data-nav-key="p:<key>"`): Enter or Space expands it, as does a click on the row.
 *
 * Presentational only; every rule behind what it shows is in `lib/projectRows.ts`.
 */
export function ScrumProjectRow({
  row,
  path,
  expanded,
  onToggle,
  onOpenWindow,
}: {
  row: ScrumRowModel;
  path: string;
  expanded: boolean;
  onToggle: () => void;
  onOpenWindow: () => void;
}): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`pj-row${expanded ? ' open' : ''}`}
      aria-expanded={expanded}
      data-nav-key={`p:${row.key}`}
      onClick={onToggle}
      onKeyDown={(event) => {
        // Not for a keydown that bubbled up from the Open window button: its own native
        // activation must not be swallowed here.
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
    >
      <span className="pj-l1">
        <span className={`pj-chev${expanded ? ' open' : ''}`} aria-hidden="true">
          ▶
        </span>
        <StatusDot status={row.dot} />
        <span className="pj-name" title={path}>
          {row.name}
        </span>
        {row.wsl && <WslBadge distros={row.wslDistros} />}
        <span className="pj-line" title={row.line}>
          {row.line}
        </span>
        {row.canOpenWindow && <OpenWindowButton onOpen={onOpenWindow} />}
      </span>
      {(row.progress || row.milestone || row.counts.length > 0) && (
        <span className="pj-l2">
          {row.progress && (
            <span
              className="pj-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={row.progress.total}
              aria-valuenow={row.progress.done}
              title={row.progress.title}
            >
              <span className="pj-bar-fill" style={{ width: `${row.progress.percent}%` }} />
            </span>
          )}
          <span className="pj-milestone" title={row.milestone ?? undefined}>
            {row.milestone}
          </span>
          {row.counts.length > 0 && <StatusRollup counts={row.counts} />}
        </span>
      )}
      {row.attention.length > 0 && (
        <span className="pj-l3">
          {row.attention.map((mark) => (
            <span key={mark.text} className={`pj-attn ${mark.tone}`}>
              {mark.glyph} {mark.text}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
