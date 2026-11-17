/**
 * The Projects tab (CONCEPT §7): one card per scrum project, then a compact list of the other
 * projects that have sessions. Fed by `getProjects()` on mount and `onProjectsChanged`.
 */

import { useEffect, useState } from 'react';
import type { ProjectView } from '../../shared/ipc.ts';
import { STATUS_COLOR_VAR, STATUS_LABEL } from '../../shared/presentation.ts';
import { api, EMPTY_PROJECTS } from '../api.ts';
import { hasWslHost } from '../lib/projectCard.ts';
import { ProjectCard, useProjectActions } from './projects/ProjectCard.tsx';
import '../projects-view.css';

export function ProjectsView(): React.JSX.Element {
  const [projects, setProjects] = useState<ProjectView[]>(EMPTY_PROJECTS);
  const [loaded, setLoaded] = useState(false);
  // The trail age ("4m ago") has to keep moving between scans.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void api.getProjects().then((list) => {
      setProjects(list);
      setLoaded(true);
    });
    const off = api.onProjectsChanged((list) => {
      setProjects(list);
      setLoaded(true);
    });
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      off();
      clearInterval(timer);
    };
  }, []);

  return <ProjectsList projects={projects} loaded={loaded} now={now} />;
}

/** The presentational half, so it can be rendered with fixture data. */
export function ProjectsList({
  projects,
  loaded,
  now,
}: {
  projects: ProjectView[];
  loaded: boolean;
  now: number;
}): React.JSX.Element {
  const scrum = projects.filter((project) => project.section === 'scrum');
  const other = projects.filter((project) => project.section === 'other');

  if (projects.length === 0) {
    return (
      <div className="empty">
        {loaded
          ? 'No project to show. Open a folder in VS Code, or start a Claude Code session, and it appears here.'
          : 'Loading projects…'}
      </div>
    );
  }

  return (
    <div className="pv">
      {scrum.length > 0 && <div className="section-title">Scrum projects</div>}
      {scrum.map((project) => (
        <ProjectCard key={project.key} project={project} now={now} />
      ))}
      {other.length > 0 && (
        <>
          <div className="section-title">Other</div>
          <ul className="pv-other">
            {other.map((project) => (
              <OtherRow key={project.key} project={project} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function OtherRow({ project }: { project: ProjectView }): React.JSX.Element {
  const actions = useProjectActions(project);
  return (
    <li className="pv-other-row">
      <span className="pv-name" title={project.name}>
        {project.name}
      </span>
      {hasWslHost(project.hosts) && <span className="pv-badge">WSL</span>}
      <span className="pv-path" title={project.path}>
        {project.path}
      </span>
      {project.statusCounts.map(({ status, count }) => (
        <span key={status} className="pv-count" title={STATUS_LABEL[status]}>
          <span className="dot sm" style={{ background: `var(${STATUS_COLOR_VAR[status]})` }} /> {count}{' '}
          {STATUS_LABEL[status].toLowerCase()}
        </span>
      ))}
      <span className="pv-actions">
        {project.hasWindow && (
          <button type="button" onClick={actions.openWindow}>
            Open window
          </button>
        )}
        <button type="button" onClick={actions.openFolder}>
          Open folder
        </button>
        <button type="button" onClick={actions.hide}>
          Hide
        </button>
      </span>
      {actions.message && <span className="pv-reason">{actions.message}</span>}
    </li>
  );
}
