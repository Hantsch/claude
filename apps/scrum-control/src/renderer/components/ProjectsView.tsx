/**
 * The Projects tab (CONCEPT §7): one compact row per project - scrum projects first, then every
 * other open window or session folder - on a shared grid, each expandable into its full card. Fed by
 * `getProjects()` on mount and `onProjectsChanged`.
 */

import { useEffect, useState } from 'react';
import type { ProjectView } from '../../shared/ipc.ts';
import { api, EMPTY_PROJECTS } from '../api.ts';
import { parseExpanded } from '../lib/projectCard.ts';
import { ProjectCard } from './projects/ProjectCard.tsx';
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

/** Where the expanded rows are remembered, so a tab switch or a reopened window keeps them. */
const EXPANDED_KEY = 'scrum-control.projects.expanded';

function loadExpanded(): Set<string> {
  try {
    return parseExpanded(window.localStorage.getItem(EXPANDED_KEY));
  } catch {
    return new Set();
  }
}

function saveExpanded(keys: Set<string>): void {
  try {
    window.localStorage.setItem(EXPANDED_KEY, JSON.stringify([...keys]));
  } catch {
    /* storage unavailable: expansion simply does not survive */
  }
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
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const scrum = projects.filter((project) => project.section === 'scrum');
  const other = projects.filter((project) => project.section === 'other');

  useEffect(() => saveExpanded(expanded), [expanded]);
  const toggle = (key: string): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const anyOpen = projects.some((project) => expanded.has(project.key));

  if (projects.length === 0) {
    return (
      <div className="empty">
        {loaded
          ? 'No project to show. Open a folder in VS Code, or start a Claude Code session, and it appears here.'
          : 'Loading projects…'}
      </div>
    );
  }

  const rows = (list: ProjectView[]): React.JSX.Element[] =>
    list.map((project) => (
      <ProjectCard
        key={project.key}
        project={project}
        now={now}
        expanded={expanded.has(project.key)}
        onToggle={() => toggle(project.key)}
      />
    ));

  return (
    <div className="pv">
      <div className="pv-toolbar">
        <span className="section-title">Projects</span>
        <span className="spacer" />
        <button
          type="button"
          onClick={() => setExpanded(anyOpen ? new Set() : new Set(projects.map((project) => project.key)))}
        >
          {anyOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <div className="pv-line pv-header" aria-hidden="true">
        <span />
        <span>Project</span>
        <span>Sprint</span>
        <span className="pv-c-bar" />
        <span className="pv-c-title">Goal / milestone</span>
        <span>Release</span>
        <span>Debt</span>
        <span>Architect</span>
        <span>Sessions</span>
        <span className="pv-c-age">Trail</span>
        <span />
      </div>
      {rows(scrum)}
      {other.length > 0 && (
        <>
          <div className="pv-divider">Other</div>
          {rows(other)}
        </>
      )}
    </div>
  );
}
