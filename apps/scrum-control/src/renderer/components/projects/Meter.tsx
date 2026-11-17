import type { Meter as MeterModel } from '../../lib/projectCard.ts';

/** A ten-cell bar: `███████░░░` drawn as cells, so it reads the same in both themes. */
export function Meter({ meter }: { meter: MeterModel }): React.JSX.Element {
  return (
    <span
      className={`pv-meter ${meter.tone}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={meter.cells}
      aria-valuenow={meter.filled}
    >
      {Array.from({ length: meter.cells }, (_, index) => (
        <span key={index} className={index < meter.filled ? 'cell on' : 'cell'} />
      ))}
    </span>
  );
}
