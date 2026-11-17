/**
 * The shape the engine, the main process and the renderer share for one project's ai-scrum
 * state (CONCEPT §4). Plain and JSON-serializable: it crosses IPC, so no Map, Set, Date or
 * class instance. Self-contained on purpose — this file is also compiled for the renderer, so
 * it must not import the scrum-cockpit parser or anything from Node.
 */

export type ScrumSprintPhase = 'planned' | 'clarify' | 'refine' | 'build' | 'gate' | 'review' | 'release' | 'done';

export type ScrumStoryStage = 'implement' | 'verify' | 'review' | 'done' | 'blocked';

export type ScrumReleaseKind = 'yes' | 'NO' | 'UNVERIFIED' | 'not tracked';

export interface ScrumStoryRef {
  id: string;
  title: string;
  isDone: boolean;
}

/** The story a building sprint is on, as its trail last names it. */
export interface ScrumFocus {
  id: string;
  title: string;
  stage: ScrumStoryStage | null;
  /** `D4 Migration`, `review 2 (hard)`, or the blocking reason. */
  step: string | null;
  /** The trail's own timestamp of the step's start, as written (`09:52:01`). */
  stepAt: string | null;
}

/** A sprint in progress. A planned sprint is `nextPlanned`; a finished one in phase 4 is `releasing`. */
export interface ScrumSprint {
  id: string;
  title: string;
  phase: ScrumSprintPhase;
  storiesDone: number;
  storiesTotal: number;
  stories: ScrumStoryRef[];
  /** In the refine phase the bar counts refined stories, otherwise finished ones. */
  progress: { done: number; total: number; unit: 'stories' | 'refined' };
  /** The story in focus, only while the sprint builds. */
  focus: ScrumFocus | null;
  /** When progress.md was last written (ms since the epoch): the trail's heartbeat. */
  trailAt: number | null;
  /** Average minutes the finished stories took, null before the first one. */
  avgStoryMinutes: number | null;
  /** Average times the stories still open, in the build phase only. */
  minutesLeft: number | null;
  /** The last progress.md line, without its bullet. */
  lastTrail: string | null;
}

export interface ScrumReleaseSummary {
  kind: ScrumReleaseKind | null;
  /** The verdict line, `releasable: yes · …`. */
  verdict: string | null;
  /** `roadmap-check` or `release-check`. */
  step: string;
  isRunning: boolean;
  sprintId: string | null;
  /** The trail's own timestamp of the step's end. */
  endedAt: string | null;
}

export interface ScrumUpdateHint {
  plugin: string;
  text: string;
  command: string | null;
}

export interface ScrumAttention {
  /** A sprint is in progress, its trail has been silent for 15 minutes or more, and no session of the project works. */
  stalled: boolean;
  /** How long the trail has been silent, 0 unless `stalled`. */
  stalledMinutes: number;
  blocked: boolean;
  blockedStory: string | null;
  /** The last release verdict is NO and no check runs. */
  releaseNo: boolean;
  /** The release record holds a verdict that said yes, then GitHub went red. */
  releaseMissed: boolean;
}

export interface ProjectScrumSummary {
  projectPath: string;
  /** The project has ai-scrum's profile, lock, roadmap or sprints. */
  hasScrum: boolean;
  /** When the files were read (ms since the epoch). */
  readAt: number;
  /** Set when reading the project failed; the rest then holds the last good read, or empty values. */
  error: string | null;
  /** The project's ai-scrum version, from its lock. */
  version: string | null;
  milestone: { id: string; name: string } | null;
  /** The roadmap's current phase. */
  phase: string | null;
  milestonesDone: number;
  milestonesTotal: number;
  /** The sprint in progress, null when none runs. */
  sprint: ScrumSprint | null;
  /** A finished sprint whose phase 4 (roadmap check, release check) is still running. */
  releasing: { id: string; title: string; step: string | null } | null;
  release: ScrumReleaseSummary | null;
  nextPlanned: { id: string; storyCount: number } | null;
  /** Sprints already moved to done/. */
  sprintsDone: number;
  techDebt: { count: number; limit: number; due: boolean };
  architect: { since: number; every: number; due: boolean; lastReview: string | null };
  backlog: { open: number; ready: number; unplanned: number };
  updateHints: ScrumUpdateHint[];
  attention: ScrumAttention;
  /** The one-line sprint text: `S14 Build 4/12 · 026 D4/5`, `no sprint · next S10 planned`, `no sprint`. */
  bandLine: string;
}

// --- Notifications (CONCEPT §8) ---

export const SCRUM_NOTIFICATION_KINDS = [
  'sprintStarted',
  'storyDone',
  'sprintReview',
  'sprintDone',
  'stalled',
  'blocked',
  'releaseVerdict',
] as const;

export type ScrumNotificationKind = (typeof SCRUM_NOTIFICATION_KINDS)[number];

/** One toggle per kind. */
export type ScrumNotificationToggles = Record<ScrumNotificationKind, boolean>;

/** CONCEPT §8: everything on except `storyDone`. */
export const DEFAULT_SCRUM_NOTIFICATIONS: Readonly<ScrumNotificationToggles> = Object.freeze({
  sprintStarted: true,
  storyDone: false,
  sprintReview: true,
  sprintDone: true,
  stalled: true,
  blocked: true,
  releaseVerdict: true,
});

export interface ScrumNotification {
  projectKey: string;
  projectName: string;
  kind: ScrumNotificationKind;
  sprintId: string | null;
  storyId: string | null;
  title: string;
  body: string;
  /** Stable for the same event across scans; the consumer announces each key once. */
  dedupeKey: string;
}
