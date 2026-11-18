import type { PhaseStrip } from '../../lib/projectCard.ts';
import type { ScrumRowModel } from '../../lib/projectRows.ts';
import { StatusDot } from '../StatusDot.tsx';
import { StatusRollup } from '../StatusRollup.tsx';
import { OpenWindowButton } from './OpenWindowButton.tsx';
import { WslBadge } from './WslBadge.tsx';

/**
 * The head of one scrum project in the popover (CONCEPT section 6), compact: dot, name, the
 * sprint's phase strip (`S23 ▮▮▣▯▯▯ Build 4/6`, or the band line without a sprint), the session
 * counts and Open window on one line; the attention marks on a second only when there are any.
 * The milestone, the story in focus and its deliverables are in the expanded body. It is one
 * keyboard stop (`data-nav-key="p:<key>"`): Enter or Space expands it, as does a click on the row.
 *
 * Presentational only; every rule behind what it shows is in `lib/projectRows.ts` and
 * `lib/projectCard.ts`.
 */
export function ScrumProjectRow({
  row,
  strip,
  path,
  expanded,
  onToggle,
  onOpenWindow,
}: {
  row: ScrumRowModel;
  strip: PhaseStrip | null;
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
        {strip ? (
          <span className="pj-strip" title={strip.title}>
            <span className="pj-strip-id">{strip.sprintId}</span>
            {strip.steps.map((step) => (
              <span
                key={step.phase}
                className={`pj-step ${step.state}`}
                aria-current={step.state === 'current' ? 'step' : undefined}
              >
                {step.state === 'done' ? '✓' : ''}
                {step.text}
                {step.state === 'current' && strip.count && <span className="pj-strip-count">{strip.count}</span>}
              </span>
            ))}
            {!strip.steps.some((step) => step.state === 'current') && (
              <span className="pj-strip-label">{strip.label}</span>
            )}
          </span>
        ) : (
          <span className="pj-line" title={row.line}>
            {row.line}
          </span>
        )}
        {row.counts.length > 0 && <StatusRollup counts={row.counts} />}
        {row.canOpenWindow && <OpenWindowButton onOpen={onOpenWindow} />}
      </span>
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
