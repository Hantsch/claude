/**
 * `TrayPresenter` (M2, F3, F4, §6.5; Scrum Control CONCEPT §5).
 *
 * The tray shows sprints, not sessions: `trayStateFromProjects` decides the tile (idle ring,
 * sprint disc, attention notch), the badge (projects that need attention) and the tooltip (one
 * line per running sprint), and `TRAY_TILE_ICON` maps the tile onto the shapes
 * `tray-icons.ts` already draws. Left click opens the compact popover (§8), right click a
 * native menu that lists the projects - each one jumps to its VS Code window - and then the
 * app's own entries. Sessions are not listed there: the popover and the main window have them.
 */

import { Menu, Tray, nativeTheme, screen } from 'electron';
import type { ProjectView, TrayProjectsState } from '../core/projects/types.ts';
import { TRAY_TILE_ICON, projectMenuLabel, trayStateFromProjects } from '../core/projects/trayState.ts';
import { clampLabel } from '../shared/presentation.ts';
import { trayImage, trayPixelSize } from './icon-assets.ts';

export interface TrayPresenterDeps {
  onTogglePopover: (bounds: Electron.Rectangle) => void;
  onOpenWindow: (tab: 'projects' | 'sessions' | 'history' | 'settings') => void;
  /** A project row of the menu was chosen: focus its VS Code window. */
  onFocusProject: (projectKey: string) => void;
  onRefresh: () => void;
  onQuit: () => void;
}

export class TrayPresenter {
  private readonly deps: TrayPresenterDeps;
  private tray: Tray | null = null;
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
   * The right-click menu is navigation: one entry per project that jumps to its VS Code window
   * (greyed out when the project has none open), then the app's own entries.
   */
  private buildMenu(): Menu {
    const items: Electron.MenuItemConstructorOptions[] = [];

    for (const project of this.projects.slice(0, 12)) {
      items.push({
        label: clampLabel(projectMenuLabel(project), 80),
        enabled: project.hasWindow,
        click: () => this.deps.onFocusProject(project.key),
      });
    }
    if (this.projects.length > 12) {
      items.push({ label: `… ${this.projects.length - 12} more projects`, enabled: false });
    }

    if (items.length > 0) items.push({ type: 'separator' });
    items.push(
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
