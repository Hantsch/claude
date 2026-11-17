/**
 * One scrum project (CONCEPT §7): the scrum-cockpit's pane lifted into a card - head with the
 * project's name, path and actions, the running sprint when there is one, and the idle rows.
 */

import { useState } from 'react';
import type { ProjectView } from '../../../shared/ipc.ts';
import { STATUS_LABEL, STATUS_COLOR_VAR } from '../../../shared/presentation.ts';
import { api } from '../../api.ts';
import { milestoneLabel } from '../../lib/projectRows.ts';
import {
  architectRow,
  backlogText,
  hasWslHost,
  nextRow,
  phaseRow,
  releaseRow,
  techDebtRow,
  wslDistros,
  type Tone,
} from '../../lib/projectCard.ts';
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
  hide: () => void;
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
    hide: () => void api.hideProject(project.key),
  };
}

export function ProjectCard({ project, now }: { project: ProjectView; now: number }): React.JSX.Element {
  const scrum = project.scrum;
  const actions = useProjectActions(project);
  const wsl = hasWslHost(project.hosts);

  return (
    <section className={`pv-card${project.needsAttention ? ' attention' : ''}`}>
      <header className="pv-head">
        <div className="pv-title">
          <span className="pv-name" title={project.name}>
            {project.name}
          </span>
          {wsl && (
            <span className="pv-badge" title={`Sessions run in WSL: ${wslDistros(project.hosts).join(', ')}`}>
              WSL
            </span>
          )}
          {project.statusCounts.map(({ status, count }) => (
            <span key={status} className="pv-count" title={STATUS_LABEL[status]}>
              <span className="dot sm" style={{ background: `var(${STATUS_COLOR_VAR[status]})` }} /> {count}{' '}
              {STATUS_LABEL[status].toLowerCase()}
            </span>
          ))}
          <span className="spacer" />
          <span className="pv-actions">
            {project.hasWindow && (
              <button type="button" onClick={actions.openWindow} title="Bring this project's VS Code window forward">
                Open window
              </button>
            )}
            <button type="button" onClick={actions.openFolder} title="Show the folder in Explorer">
              Open folder
            </button>
            <button type="button" onClick={actions.hide} title="Leave this project out of the overview. Settings lists it for unhiding.">
              Hide
            </button>
          </span>
        </div>
        <div className="pv-path" title={project.path}>
          {project.path}
        </div>
        {project.attentionReasons.length > 0 && (
          <div className="pv-reasons">
            {project.attentionReasons.map((reason) => (
              <span key={reason} className="pv-reason">
                ⚠ {reason}
              </span>
            ))}
          </div>
        )}
        {actions.message && <div className="pv-reasons">{actions.message}</div>}
      </header>

      {scrum?.error && <div className="pv-error">Could not read the project&rsquo;s ai-scrum state: {scrum.error}</div>}

      {scrum && (
        <>
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
        </>
      )}
    </section>
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
