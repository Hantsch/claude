import type { ScrumBlockModel } from '../../lib/projectRows.ts';

/**
 * The compact scrum block under an expanded scrum row: release verdict, tech debt, architect,
 * the next planned sprint, time left and update hints. What is shown, and which facts are left
 * out, is decided by `scrumBlockModel()`.
 */
export function ScrumBlock({ block }: { block: ScrumBlockModel }): React.JSX.Element | null {
  if (block.facts.length === 0 && block.hints.length === 0) return null;
  return (
    <div className="pj-scrum">
      {block.facts.map((fact) => (
        <span key={fact.label} className="pj-fact">
          <span className="k">{fact.label}</span>
          <span className={`v${fact.tone ? ` ${fact.tone}` : ''}`} title={fact.value}>
            {fact.value}
          </span>
        </span>
      ))}
      {block.hints.map((hint) => (
        <span key={hint.text} className="pj-hint" title={hint.text}>
          {hint.text}
          {hint.command && <code>{hint.command}</code>}
        </span>
      ))}
    </div>
  );
}
