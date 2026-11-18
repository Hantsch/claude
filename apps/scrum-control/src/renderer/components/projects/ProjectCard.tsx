/**
 * One project in the Projects tab (CONCEPT §7): a compact row that expands into the
 * scrum-cockpit's pane lifted into a card - path and actions, the running sprint, the idle rows.
 */

import { useState } from 'react';
import type { ProjectView } from '../../../shared/ipc.ts';
import { api } from '../../api.ts';
import { milestoneLabel } from '../../lib/projectRows.ts';
import {
  architectRow,
  backlogText,
  compactRow,
  compactSprintLine,
  hasWslHost,
  nextRow,
  phaseRow,
  releaseRow,
  techDebtRow,
  wslDistros,
  type Cell,
  type Tone,
} from '../../lib/projectCard.ts';
import { StatusRollup } from '../StatusRollup.tsx';
import { Meter } from './Meter.tsx';
import { SprintBlock } from './SprintBlock.tsx';

function Row({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: Tone | null;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="pv-row">
      <dt>{label}</dt>
      <dd className={tone ?? undefined}>{children}</dd>
    </div>
  );
}

/** Opens the project's window or folder; an `ok: false` answer is shown on the card. */
export function useProjectActions(project: ProjectView): {
  message: string | null;
  openWindow: () => void;
  openFolder: () => void;
} {
  const [message, setMessage] = useState<string | null>(null);
  return {
    message,
    openWindow: () => {
      setMessage(null);
      void api.focusProject(project.key).then((result) => {
        if (!result.ok) setMessage(result.message);
      });
    },
    openFolder: () => {
      setMessage(null);
      void api.openProjectFolder(project.key).then((result) => {
        if (!result.ok) setMessage(result.message);
      });
    },
  };
}

/**
 * One project as a compact, expandable row (CONCEPT §7). Collapsed it is a single line on the
 * list's shared grid, so every project's sprint, release and meters line up in columns; a click
 * (or Enter / Space) opens the full card underneath - path, actions, the running sprint and the
 * idle rows. Works for `other` projects too: they simply have no scrum cells.
 */
export function ProjectCard({
  project,
  now,
  expanded,
  onToggle,
}: {
  project: ProjectView;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  const scrum = project.scrum;
  const actions = useProjectActions(project);
  const wsl = hasWslHost(project.hosts);
  const row = compactRow(scrum, now);
  const sprintLine = expanded ? null : compactSprintLine(scrum);
  const reasons = project.attentionReasons;

  return (
    <section className={`pv-item${project.needsAttention ? ' attention' : ''}${expanded ? ' open' : ''}`}>
      <div
        className="pv-line"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        title={reasons.length > 0 ? reasons.join('\n') : undefined}
        onClick={onToggle}
        onKeyDown={(event) => {
          // Not for a key that bubbled up from the Open window button.
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <span className={`pv-chev${expanded ? ' open' : ''}`} aria-hidden="true">
          ▶
        </span>
        <span className="pv-c-name">
          <span className="pv-name">{project.name}</span>
          {wsl && (
            <span className="pv-badge" title={`Sessions run in WSL: ${wslDistros(project.hosts).join(', ')}`}>
              WSL
            </span>
          )}
          {reasons.length > 0 && (
            <span className="pv-flag" aria-label={`${reasons.length} need attention`}>
              ⚠
            </span>
          )}
        </span>
        <CellView cell={row.sprint} className="pv-c-sprint" />
        <span className="pv-c-bar">
          {row.percent !== null && (
            <span className="pv-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.percent}>
              <span className="pv-bar-fill" style={{ width: `${row.percent}%` }} />
            </span>
          )}
        </span>
        <span className="pv-c-title" title={row.title ?? undefined}>
          {row.title ?? (scrum ? '' : project.path)}
        </span>
        <CellView cell={row.release} className="pv-c-release" />
        <CellView cell={row.debt} className="pv-c-debt" />
        <CellView cell={row.architect} className="pv-c-arch" />
        <span className="pv-c-sessions">
          {project.statusCounts.length > 0 && <StatusRollup counts={project.statusCounts} />}
        </span>
        <span className={`pv-c-age${row.stalled ? ' warn' : ''}`}>{row.age}</span>
        <span className="pv-c-actions">
          {project.hasWindow && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                actions.openWindow();
              }}
              title="Bring this project's VS Code window forward"
            >
              Open window
            </button>
          )}
        </span>
      </div>
      {sprintLine && (
        // Part of the row: a click here toggles it too. The expanded card shows the full stepper.
        <div className="pv-subline" onClick={onToggle}>
          <ol className="pv-ministeps" aria-label="Sprint phase">
            {sprintLine.steps.map((step) => (
              <li
                key={step.phase}
                className={`pv-ministep ${step.state}`}
                aria-current={step.state === 'current' ? 'step' : undefined}
              >
                {step.state === 'done' ? '✓ ' : ''}
                {step.label}
              </li>
            ))}
          </ol>
          {sprintLine.chips && (
            <ul className="pv-minichips" aria-label="Stories">
              {sprintLine.chips.map((chip) => (
                <li key={chip.id} className={`pv-chip ${chip.state}`} title={chip.title}>
                  {chip.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {actions.message && !expanded && <div className="pv-line-message">{actions.message}</div>}

      {expanded && (
        <div className="pv-body">
          <div className="pv-body-head">
            <span className="pv-path" title={project.path}>
              {project.path}
            </span>
            <span className="pv-actions">
              <button type="button" onClick={actions.openFolder} title="Show the folder in Explorer">
                Open folder
              </button>
            </span>
          </div>
          {reasons.length > 0 && (
            <div className="pv-reasons">
              {reasons.map((reason) => (
                <span key={reason} className="pv-reason">
                  ⚠ {reason}
                </span>
              ))}
            </div>
          )}
          {actions.message && <div className="pv-reasons">{actions.message}</div>}
          {scrum?.error && (
            <div className="pv-error">Could not read the project&rsquo;s ai-scrum state: {scrum.error}</div>
          )}
          {scrum && (
            <div className="pv-body-grid">
              {scrum.sprint ? (
                <SprintBlock sprint={scrum.sprint} scrum={scrum} now={now} />
              ) : scrum.releasing ? (
                <div className="pv-sprint">
                  <div className="pv-sprint-head">
                    <span className="pv-sprint-title">{scrum.releasing.id} Release</span>
                    <span className="pv-sprint-name" title={scrum.releasing.title}>
                      {scrum.releasing.title}
                    </span>
                  </div>
                  <div className="pv-timeleft">
                    phase 4 running{scrum.releasing.step ? ` · ${scrum.releasing.step.replace(/-/g, ' ')}` : ''}
                  </div>
                </div>
              ) : null}
              <IdleRows project={project} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CellView({ cell, className }: { cell: Cell | null; className: string }): React.JSX.Element {
  if (!cell) return <span className={className} />;
  return (
    <span className={`${className}${cell.tone ? ` ${cell.tone}` : ''}`} title={cell.title ?? undefined}>
      {cell.text}
    </span>
  );
}

function IdleRows({ project }: { project: ProjectView }): React.JSX.Element | null {
  const scrum = project.scrum;
  if (!scrum) return null;
  const phase = phaseRow(scrum);
  const release = releaseRow(scrum);
  const debt = techDebtRow(scrum);
  const architect = architectRow(scrum);
  const next = nextRow(scrum);
  const milestone = milestoneLabel(scrum);

  return (
    <dl className="pv-rows">
      <Row label="Phase" tone={phase.tone}>
        {phase.text}
        {milestone && (
          <span className="pv-detail" title={milestone}>
            {milestone}
          </span>
        )}
      </Row>
      <Row label="Release" tone={release.tone}>
        {release.text}
        {release.detail && <span className="pv-detail"> {release.detail}</span>}
      </Row>
      <Row label="Tech debt" tone={debt.due ? 'bad' : null}>
        {debt.text}
        {debt.meter && <Meter meter={debt.meter} />}
      </Row>
      {architect && (
        <Row label="Architect" tone={architect.due ? 'bad' : null}>
          {architect.text}
          {architect.meter && <Meter meter={architect.meter} />}
          <span className="pv-detail"> stories since review · {architect.lastReview}</span>
        </Row>
      )}
      <Row label="Backlog">{backlogText(scrum)}</Row>
      <Row label="Next" tone={next.tone}>
        {next.text}
      </Row>
      {scrum.updateHints.map((hint) => (
        <Row key={`${hint.plugin}:${hint.text}`} label="Update" tone="warn">
          {hint.text}
          {hint.command && <code className="pv-command"> {hint.command}</code>}
        </Row>
      ))}
    </dl>
  );
}
