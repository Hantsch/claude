/**
 * Assembly point: settings + Claude adapter + engine. This is the single place that picks
 * an adapter implementation — "adding an agent means adding a class and registering it"
 * (§9). No plugin discovery.
 */

import { ClaudeAdapter } from './adapters/claude/adapter.ts';
import { resolveClaudePaths, type ClaudePaths } from './adapters/claude/paths.ts';
import { MultiRootAdapter } from './adapters/multiRoot.ts';
import type { AgentAdapter } from './adapters/types.ts';
import { WindowSource } from './context/windowSource.ts';
import { ControlEngine } from './engine.ts';
import { createRootDiscovery, type DiscoverOptions, type HostRoot } from './hosts/roots.ts';
import { WslProcessProbe } from './hosts/wslProbe.ts';
import type { AppSettings } from './model/settings.ts';
import { createProcessProbe, type ProcessProbe } from './registry/liveness.ts';

export interface CreateEngineOptions {
  settings: AppSettings;
  /** Override the process probe (tests, non-Windows hosts). */
  probe?: ProcessProbe;
  now?: () => number;
  /** See `ControlEngineOptions.hasTerminalWindow` — the main-process window-probe cache read. */
  hasTerminalWindow?: (pid: number) => boolean | undefined;
  /**
   * Where the model-window cache lives — Electron's `userData` in the app, the CLI's own
   * resolution otherwise (story 005 D6 supplies both). Omitting it is a supported mode, not
   * a degraded one: no data dir means no `WindowSource`, i.e. the estimate table only.
   */
  dataDir?: string;
  /**
   * Seams for WSL discovery and liveness (tests): `exec` replaces `wsl.exe`, `fs` the
   * directory reads, `wslBase` the UNC mount (default `//wsl.localhost`).
   */
  hosts?: Pick<DiscoverOptions, 'exec' | 'fs' | 'wslBase'>;
  /** Replaces the per-distro `/proc` probe (tests). */
  wslProbe?: (root: HostRoot) => ProcessProbe;
}

export interface CreatedEngine {
  engine: ControlEngine;
  adapter: AgentAdapter;
  /** The Windows root's paths (the one chokidar watches and `ide/` locks live under). */
  paths: ClaudePaths;
  /**
   * The roots in use right now, Windows first — what Settings -> Diagnostics lists. Refreshed
   * with every engine tick (discovery itself is cached for 60 s), so it is empty of WSL roots
   * until the engine has started.
   */
  hostRoots(): HostRoot[];
  /** Null when no `dataDir` was given. Exposed so Settings/Diagnostics can drive it. */
  windowSource: WindowSource | null;
}

export function createEngine(options: CreateEngineOptions): CreatedEngine {
  const paths = resolveClaudePaths(options.settings.claudeDir);
  const windowsRoot: HostRoot = { id: 'windows', kind: 'windows', distro: null, claudeDir: paths.root };
  const windowsProbe = options.probe ?? createProcessProbe();
  const discovery = createRootDiscovery(
    () => ({
      ...options.hosts,
      claudeDir: options.settings.claudeDir,
      // The adapter gates on `settings.wsl.enabled` itself (it follows later changes too).
    }),
    { now: options.now },
  );
  // One probe per distro, shared by every home in it: it only reads that distro's `/proc`.
  const wslProbes = new Map<string, ProcessProbe>();
  const probeFor = (root: HostRoot): ProcessProbe => {
    if (root.kind === 'windows') return windowsProbe;
    const existing = wslProbes.get(root.id);
    if (existing) return existing;
    const probe =
      options.wslProbe?.(root) ??
      new WslProcessProbe({ distro: root.distro!, base: options.hosts?.wslBase });
    wslProbes.set(root.id, probe);
    return probe;
  };
  const adapter = new MultiRootAdapter({
    windowsRoot,
    discovery,
    createAdapter: (root) =>
      new ClaudeAdapter({
        paths: root.kind === 'windows' ? paths : resolveClaudePaths(root.claudeDir),
        host: root,
        tailWindowBytes: options.settings.reading.tailWindowBytes,
        maxTailWindowBytes: options.settings.reading.maxTailWindowBytes,
        probe: probeFor(root),
        thresholds: options.settings.thresholds,
        now: options.now,
      }),
  });
  adapter.applySettings(options.settings);
  // Constructed enabled-or-not straight from the setting, so nothing is fetched and no
  // window resolves before the user has opted in.
  const windowSource = options.dataDir
    ? new WindowSource(options.dataDir, {
        enabled: options.settings.contextWindows.useOnlineTable,
        now: options.now,
      })
    : null;
  const engine = new ControlEngine({
    adapter,
    settings: options.settings,
    now: options.now,
    hasTerminalWindow: options.hasTerminalWindow,
    ...(windowSource ? { windowSource } : {}),
  });
  return { engine, adapter, paths, windowSource, hostRoots: () => adapter.roots() };
}
