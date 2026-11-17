/**
 * Windows toasts (M3, F5, §6.6).
 *
 * The *decision* whether to notify lives in `core/state/notifications.ts` so it is testable
 * without Electron; this file only renders it. Body: session name, project, branch, and
 * either the last assistant sentence (`done`) or the pending tool name (`waiting`).
 * Activating the toast triggers F6. On Windows the toast additionally carries "Jump" and
 * "Mute this session" buttons (D6) — see `toast-protocol.ts` for why those take a detour
 * through a URI scheme instead of a callback.
 *
 * No sound, and no suppression-when-focused rule, in v1.
 */

import { Notification, type NotificationConstructorOptions } from 'electron';
import type { NotificationSettings } from '../core/model/settings.ts';
import { STATUS_LABEL } from '../core/model/status.ts';
import type { SessionId, StatusTransition } from '../core/model/types.ts';
import { NotificationGate, firstSentence } from '../core/state/notifications.ts';
import type { ScrumNotification } from '../core/scrum/types.ts';
import { clampLabel, sessionLabel, waitingOnText } from '../shared/presentation.ts';
import { toastIcon, toastIconUri } from './icon-assets.ts';
import { buildScrumToastXml, buildToastXml } from './toast-protocol.ts';

/** Scrum events that ask for a look, as opposed to reporting progress. */
const SCRUM_ATTENTION_KINDS: ReadonlySet<ScrumNotification['kind']> = new Set(['stalled', 'blocked']);

export interface NotifierDeps {
  settings: () => NotificationSettings;
  /** Invoked when the user activates a toast (F6). */
  onActivate: (sessionId: SessionId) => void;
  /** Per-session mute override (§6.6, D4/D5) — checked ahead of the global settings. */
  isMuted: (sessionId: SessionId) => boolean;
  /** Invoked when the user activates a scrum toast: focus the project's window (CONCEPT section 8). */
  onActivateProject?: (projectKey: string) => void;
}

export class Notifier {
  private readonly deps: NotifierDeps;
  private readonly gate = new NotificationGate();

  constructor(deps: NotifierDeps) {
    this.deps = deps;
  }

  handle(transitions: readonly StatusTransition[]): void {
    const settings = this.deps.settings();
    for (const transition of transitions) {
      const muted = this.deps.isMuted(transition.sessionId);
      if (this.gate.evaluate(transition, settings, muted).notify) this.show(transition);
    }
  }

  /**
   * Scrum toasts (CONCEPT section 8): the same app identity and the same toast layout as the
   * session toasts. The toggles and the once-per-key dedupe are decided upstream, in the projects
   * service; this only renders. Clicking the toast or its button focuses the project's window.
   */
  handleScrum(notifications: readonly ScrumNotification[]): void {
    for (const notification of notifications) this.showScrum(notification);
  }

  private showScrum(notification: ScrumNotification): void {
    if (!Notification.isSupported()) return;
    // The state tiles are the only toast art there is: `waiting` for what asks for a look,
    // `done` for the rest.
    const status = SCRUM_ATTENTION_KINDS.has(notification.kind) || /releasable: (NO|UNVERIFIED)$/.test(notification.title) ? 'waiting' : 'done';
    const plain: NotificationConstructorOptions = {
      title: clampLabel(notification.title, 60),
      body: notification.body,
      icon: toastIcon(status),
      silent: true,
      timeoutType: 'default',
    };
    const toast = new Notification(
      process.platform === 'win32'
        ? {
            ...plain,
            toastXml: buildScrumToastXml({
              title: clampLabel(notification.title, 60),
              lines: [notification.body],
              imageUri: toastIconUri(status),
              projectKey: notification.projectKey,
            }),
          }
        : plain,
    );
    toast.on('click', () => this.deps.onActivateProject?.(notification.projectKey));
    toast.show();
  }

  private show(transition: StatusTransition): void {
    if (!Notification.isSupported()) return;
    const view = transition.view;
    const where = [view.project.name, view.branch].filter(Boolean).join(' · ');
    const detail =
      (transition.to === 'waiting' ? waitingOnText({ ...view, status: 'waiting' }) : null) ??
      firstSentence(view.lastAssistantText) ??
      'Turn finished';

    const title = `${clampLabel(sessionLabel(view), 40)} — ${STATUS_LABEL[transition.to]}`;
    const notification = new Notification(this.options(transition, title, where, detail));
    // Still the plain click handler on both paths: the XML leaves the toast body on Windows'
    // default (foreground) activation, which is exactly what this event is fired by.
    notification.on('click', () => this.deps.onActivate(transition.sessionId));
    notification.show();
  }

  /**
   * The plain toast is the baseline everywhere (F5, click = jump). Windows additionally gets
   * the hand-written `toastXml` carrying the two buttons (§6.6, D6) — `toastXml` is ignored on
   * every other platform, and the fields below stay filled so nothing depends on it working.
   */
  private options(
    transition: StatusTransition,
    title: string,
    where: string,
    detail: string,
  ): NotificationConstructorOptions {
    const plain: NotificationConstructorOptions = {
      title,
      body: `${where}\n${detail}`,
      // The state's own tile, so a toast is readable as "finished" or "needs you" from the
      // logo alone — the two toasts are otherwise the same shape at the same corner.
      icon: toastIcon(transition.to),
      silent: true,
      timeoutType: 'default',
    };
    if (process.platform !== 'win32') return plain;
    return {
      ...plain,
      toastXml: buildToastXml({
        title,
        lines: [where, detail],
        imageUri: toastIconUri(transition.to),
        sessionId: transition.sessionId,
      }),
    };
  }
}
