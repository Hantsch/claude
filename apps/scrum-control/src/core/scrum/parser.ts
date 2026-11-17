/**
 * The one place the app reaches into the scrum-cockpit mod. ai-scrum's file formats are parsed
 * by `plugins/scrum-cockpit/hooks/scan.ts` and by nothing else (CONCEPT §4); everything in
 * `core/scrum` imports the parser and its types through this module, so the long relative
 * path exists once.
 */

export {
  currentMilestone,
  isArchitectDue,
  isDebtDue,
  isDone,
  refineProgress,
  scan,
  unplannedStories,
  updateHints,
} from '../../../../../plugins/scrum-cockpit/hooks/scan.ts';
export type { Reader } from '../../../../../plugins/scrum-cockpit/hooks/scan.ts';
export type { Snapshot, Sprint, Story } from '../../../../../plugins/scrum-cockpit/types/index';
