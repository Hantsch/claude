/**
 * `TrayPresenter` (M2, F3, F4, §6.5; Scrum Control CONCEPT §5).
 *
 * The tray shows sprints, not sessions: `trayStateFromProjects` decides the tile (idle ring,
 * sprint disc, attention notch), the badge (projects that need attention) and the tooltip (one
 * line per running sprint), and `TRAY_TILE_ICON` maps the tile onto the shapes
 * `tray-icons.ts` already draws. Left click opens the compact popover (§8), right click a
 * native menu that lists the projects first and the live sessions after them.
 */

import { Menu, Tray, nativeTheme, screen } from 'electron';
import { STATUS_LABEL } from '../core/model/status.ts';
import type { ProjectView, TrayProjectsState } from '../core/projects/types.ts';
import { TRAY_TILE_ICON, projectMenuLabel, trayStateFromProjects } from '../core/projects/trayState.ts';
import type { AppState } from '../shared/ipc.ts';
import { clampLabel, sessionLabel } from '../shared/presentation.ts';
import { trayImage, trayPixelSize } from './icon-assets.ts';

export interface TrayPresenterDeps {
  onTogglePopover: (bounds: Electron.Rectangle) => void;
  onOpenWindow: (tab: 'projects' | 'sessions' | 'history' | 'settings') => void;
  onFocusSession: (sessionId: string) => void;
  /** A project row of the menu was chosen: focus its VS Code window. */
  onFocusProject: (projectKey: string) => void;
  /** "Mark all as seen" — dismisses every settled session from the tray surfaces. */
  onMarkAllSeen: () => void;
  onRefresh: () => void;
  onQuit: () => void;
}

export class TrayPresenter {
  private readonly deps: TrayPresenterDeps;
  private tray: Tray | null = null;
  private state: AppState | null = null;
  private projects: ProjectView[] = [];
  private tile: TrayProjectsState = trayStateFromProjects([]);
  private lastKey = '';
  /** Physical size of the tile Windows will ask for on this display. */
  private pixelSize = trayPixelSize(1);
  private readonly onDisplayChange = (): void => this.rescale();
  private readonly onThemeChange = (): void => this.retheme();

  constructor(deps: TrayPresenterDeps) {
    this.deps = deps;
  }

  create(): void {
    if (this.tray) return;
    this.pixelSize = trayPixelSize(screen.getPrimaryDisplay().scaleFactor);
    this.tray = new Tray(trayImage(TRAY_TILE_ICON[this.tile.tile], this.tile.badge, this.pixelSize));
    this.tray.setToolTip(this.tile.tooltip);
    this.tray.on('click', (_event, bounds) => this.deps.onTogglePopover(bounds));
    this.tray.on('right-click', () => this.tray?.popUpContextMenu(this.buildMenu()));
    this.tray.on('double-click', () => this.deps.onOpenWindow('projects'));
    // Display scaling can change under a running app — docking a laptop, moving the taskbar
    // to another monitor. The tile has to be rebuilt at the new physical size or Windows
    // resamples the one it has.
    screen.on('display-metrics-changed', this.onDisplayChange);
    // Same reasoning as the DPI listener above: the badge rim depends on
    // `nativeTheme.shouldUseDarkColors`, so a live OS theme switch has to invalidate the cached
    // key and rebuild, not wait for the next unrelated state change.
    nativeTheme.on('updated', this.onThemeChange);
  }

  /** The live sessions changed: only the menu lists them, the tile and tooltip follow the projects. */
  update(state: AppState): void {
    this.state = state;
  }

  /** The projects changed: redraw the tile, the badge and the tooltip. */
  setProjects(projects: ProjectView[]): void {
    this.projects = projects;
    this.tile = trayStateFromProjects(projects);
    this.render();
  }

  private render(): void {
    if (!this.tray) return;
    // Re-rendering the icon on every tick would be wasteful; the visual state is a pure
    // function of (icon, badge, size), so only rebuild when that triple changes.
    const icon = TRAY_TILE_ICON[this.tile.tile];
    const key = `${icon}:${Math.min(this.tile.badge, 10)}:${this.pixelSize}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.tray.setImage(trayImage(icon, this.tile.badge, this.pixelSize));
    }
    this.tray.setToolTip(this.tile.tooltip);
  }

  destroy(): void {
    screen.removeListener('display-metrics-changed', this.onDisplayChange);
    nativeTheme.removeListener('updated', this.onThemeChange);
    this.tray?.destroy();
    this.tray = null;
  }

  getBounds(): Electron.Rectangle | null {
    return this.tray?.getBounds() ?? null;
  }

  private rescale(): void {
    const size = trayPixelSize(screen.getPrimaryDisplay().scaleFactor);
    if (size === this.pixelSize) return;
    this.pixelSize = size;
    this.lastKey = '';
    this.render();
  }

  private retheme(): void {
    this.lastKey = '';
    this.render();
  }

  /**
   * The right-click menu doubles as a keyboard-reachable version of the popover: the
   * sessions are listed so the fast path works even if the popover is unavailable.
   */
  private buildMenu(): Menu {
    // Same list as the popover: what is in flight, unacknowledged, or recent. "Open Claude
    // Control" is one item below for everything else.
    const sessions = this.state?.traySessions ?? [];
    const hidden = (this.state?.sessions.length ?? 0) - sessions.length;
    const items: Electron.MenuItemConstructorOptions[] = [];

    // Projects first: they are what the tile and the badge are about.
    for (const project of this.projects.slice(0, 12)) {
      items.push({
        label: clampLabel(projectMenuLabel(project), 80),
        click: () => this.deps.onFocusProject(project.key),
      });
    }
    if (this.projects.length > 12) {
      items.push({ label: `… ${this.projects.length - 12} more projects`, enabled: false });
    }
    if (this.projects.length > 0) items.push({ type: 'separator' });

    if (sessions.length === 0) {
      items.push({ label: 'Nothing needs you', enabled: false });
    } else {
      for (const session of sessions.slice(0, 12)) {
        items.push({
          label: `${clampLabel(sessionLabel(session), 48)} — ${STATUS_LABEL[session.status]} · ${session.project.name}${session.branch ? ` · ${session.branch}` : ''}`,
          click: () => this.deps.onFocusSession(session.sessionId),
        });
      }
      if (sessions.length > 12) {
        items.push({ label: `… ${sessions.length - 12} more`, enabled: false });
      }
    }
    if (hidden > 0) {
      items.push({ label: `${hidden} settled session(s) hidden`, enabled: false });
    }

    // The badge has to be dismissible, otherwise the icon claims something is open with no
    // way for the user to answer it. Offered only when there is something to dismiss. Same
    // action as the popover's "Mark all as seen": the settled rows leave this menu too, not
    // just the badge.
    if ((this.state?.attention ?? 0) > 0) {
      items.push(
        { type: 'separator' },
        {
          label: `Mark all as seen (${this.state?.attention ?? 0})`,
          click: () => this.deps.onMarkAllSeen(),
        },
      );
    }

    items.push(
      { type: 'separator' },
      { label: 'Open Scrum Control', click: () => this.deps.onOpenWindow('projects') },
      { label: 'History', click: () => this.deps.onOpenWindow('history') },
      { label: 'Settings', click: () => this.deps.onOpenWindow('settings') },
      { type: 'separator' },
      { label: 'Refresh now', click: () => this.deps.onRefresh() },
      { label: 'Quit', click: () => this.deps.onQuit() },
    );

    return Menu.buildFromTemplate(items);
  }
}
