/**
 * The running sprint inside a project card (CONCEPT §7): the phase stepper, the stories as
 * chips, the story in focus, the time left and the last trail line. Read-only - the app cannot
 * type into a session, so there is no Resume here.
 */

import type { ProjectScrumSummary, ScrumSprint } from '../../../core/scrum/types.ts';
import {
  focusLine,
  sprintHeadline,
  stepper,
  storyChips,
  timeLeftText,
  trailLine,
} from '../../lib/projectCard.ts';

export function SprintBlock({
  sprint,
  scrum,
  now,
}: {
  sprint: ScrumSprint;
  scrum: ProjectScrumSummary;
  now: number;
}): React.JSX.Element {
  const focus = focusLine(sprint);
  const timeLeft = timeLeftText(sprint);
  const trail = trailLine(sprint, scrum.attention.stalled, now);

  return (
    <div className="pv-sprint">
      <div className="pv-sprint-head">
        <span className="pv-sprint-title">{sprintHeadline(sprint)}</span>
        <span className="pv-sprint-name" title={sprint.title}>
          {sprint.title}
        </span>
      </div>

      <ol className="pv-stepper" aria-label="Sprint phase">
        {stepper(sprint.phase).map((step) => (
          <li
            key={step.phase}
            className={`pv-step ${step.state}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            {step.state === 'done' ? '✓ ' : ''}
            {step.label}
          </li>
        ))}
      </ol>

      {sprint.stories.length > 0 && (
        <ul className="pv-chips" aria-label="Stories">
          {storyChips(sprint).map((chip) => (
            <li key={chip.id} className={`pv-chip ${chip.state}`} title={chip.title}>
              {chip.text}
            </li>
          ))}
        </ul>
      )}

      {focus && (
        <div className={`pv-focus${focus.blocked ? ' blocked' : ''}`}>
          <div className="pv-focus-title">
            <span className="pv-focus-id">{focus.id}</span> <span title={focus.title}>{focus.title}</span>
          </div>
          {(focus.stage || focus.since) && (
            <div className="pv-focus-step">
              {focus.stage}
              {focus.stage && focus.since ? ' · ' : ''}
              {focus.since}
            </div>
          )}
        </div>
      )}

      {timeLeft && <div className="pv-timeleft">{timeLeft}</div>}

      {trail && (
        <div className={`pv-trail${trail.stalled ? ' stalled' : ''}`}>
          <span className="pv-trail-text" title={trail.text}>
            {trail.text}
          </span>
          {trail.age && <span className="pv-trail-age">{trail.age}</span>}
        </div>
      )}
    </div>
  );
}
