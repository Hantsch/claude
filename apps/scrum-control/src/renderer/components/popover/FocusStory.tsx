import type { FocusLine } from '../../lib/projectCard.ts';

/**
 * The story a building sprint is on, under an expanded popover row: id and title, its stage and
 * step, and how many of its deliverables are ticked off as a small bar (`▮▮▮▯▯ 3/5 deliverables`).
 */
export function FocusStory({ focus }: { focus: FocusLine }): React.JSX.Element {
  const d = focus.deliverables;
  return (
    <div className={`pj-focus${focus.blocked ? ' blocked' : ''}`}>
      <div className="pj-focus-title" title={`${focus.id} ${focus.title}`}>
        <span className="pj-focus-id">{focus.id}</span> {focus.title}
      </div>
      <div className="pj-focus-meta">
        {focus.stage && <span className="pj-focus-stage">{focus.stage}</span>}
        {d && (
          <span className="pj-deliv" title={`${d.done} of ${d.total} deliverables done`}>
            <span className="pj-dmeter" role="meter" aria-valuemin={0} aria-valuemax={d.total} aria-valuenow={d.done}>
              {Array.from({ length: d.meter.cells }, (_, index) => (
                <span key={index} className={index < d.meter.filled ? 'cell on' : 'cell'} />
              ))}
            </span>
            {d.done}/{d.total} deliverables
          </span>
        )}
        {focus.since && <span className="pj-focus-since">{focus.since}</span>}
      </div>
    </div>
  );
}
