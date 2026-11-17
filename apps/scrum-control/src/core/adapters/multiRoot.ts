/**
 * `MultiRootAdapter` — one `ClaudeAdapter` per host root (the Windows `~/.claude`, and one
 * per Claude home inside every running WSL distro) behind the single `AgentAdapter` the engine
 * knows (CONCEPT §2).
 *
 * The engine sees one merged set of live sessions, history and details. Everything per-root —
 * the process probe, the cwd mapping, the transcript lookup — stays inside each
 * `ClaudeAdapter`; this class only fans out, merges and routes.
 *
 * The root list is refreshed from `discovery` whenever live sessions are discovered, i.e. on
 * every engine tick; `discovery` itself caches for 60 s, so `wsl.exe` runs at most that often.
 * A discovery that fails or finds nothing leaves the Windows root in place — it is never
 * dropped, and never depends on anything WSL.
 */

import type { HostRoot, RootDiscovery } from '../hosts/roots.ts';
import type { AppSettings } from '../model/settings.ts';
import type {
  HistoryEntry,
  IdeWindowRef,
  LiveSessionRef,
  SessionDetail,
  SessionId,
  SessionSnapshot,
} from '../model/types.ts';
import { isPathInside } from './claude/paths.ts';
import type { ClaudeAdapter } from './claude/adapter.ts';
import type { AgentAdapter, WatchRoot } from './types.ts';

export interface MultiRootAdapterOptions {
  windowsRoot: HostRoot;
  discovery: RootDiscovery;
  /** Builds the per-root adapter (with its own probe). */
  createAdapter: (root: HostRoot) => ClaudeAdapter;
}

interface Member {
  root: HostRoot;
  adapter: ClaudeAdapter;
}

export class MultiRootAdapter implements AgentAdapter {
  readonly id = 'claude-code';

  private readonly options: MultiRootAdapterOptions;
  /** Keyed by `claudeDir`: two homes of one distro share a host id but not a directory. */
  private members = new Map<string, Member>();
  private wslEnabled = true;

  constructor(options: MultiRootAdapterOptions) {
    this.options = options;
    this.members.set(options.windowsRoot.claudeDir, {
      root: options.windowsRoot,
      adapter: options.createAdapter(options.windowsRoot),
    });
  }

  /** The roots in use right now, Windows first. */
  roots(): HostRoot[] {
    return [...this.members.values()].map((member) => member.root);
  }

  /** Re-run discovery now (it is cached, so this is cheap) and adopt the result. */
  async refreshRoots(): Promise<HostRoot[]> {
    const discovered = this.wslEnabled ? await this.options.discovery.roots() : [];
    const wanted = new Map<string, HostRoot>();
    wanted.set(this.options.windowsRoot.claudeDir, this.options.windowsRoot);
    for (const root of discovered) {
      if (root.kind === 'wsl') wanted.set(root.claudeDir, root);
    }

    const next = new Map<string, Member>();
    for (const [dir, root] of wanted) {
      next.set(dir, this.members.get(dir) ?? { root, adapter: this.options.createAdapter(root) });
    }
    this.members = next;
    return this.roots();
  }

  applySettings(settings: AppSettings): void {
    const enabled = settings.wsl.enabled;
    if (enabled === this.wslEnabled) return;
    this.wslEnabled = enabled;
    this.options.discovery.invalidate();
  }

  // ------------------------------------------------------------------ AgentAdapter

  async discoverLiveSessions(): Promise<LiveSessionRef[]> {
    await this.refreshRoots().catch(() => undefined);
    const lists = await Promise.all(
      this.adapters().map((adapter) => adapter.discoverLiveSessions().catch(() => [] as LiveSessionRef[])),
    );
    const seen = new Set<SessionId>();
    const merged: LiveSessionRef[] = [];
    for (const ref of lists.flat()) {
      if (seen.has(ref.sessionId)) continue;
      seen.add(ref.sessionId);
      merged.push(ref);
    }
    return merged;
  }

  /**
   * Windows roots only. File events over the WSL 9P share are unreliable, so WSL roots are
   * covered by the engine's tick (which re-stats every live transcript), not by chokidar.
   */
  watchRoots(): WatchRoot[] {
    return [...this.members.values()]
      .filter((member) => member.root.kind === 'windows')
      .flatMap((member) => member.adapter.watchRoots());
  }

  readStatus(ref: LiveSessionRef): Promise<SessionSnapshot> {
    return this.adapterFor(ref.host, ref.source).readStatus(ref);
  }

  refreshSubagentActivity(snapshot: SessionSnapshot, now: number): Promise<SessionSnapshot> {
    return this.adapterFor(snapshot.ref.host, snapshot.ref.source).refreshSubagentActivity(snapshot, now);
  }

  async *indexHistory(signal: AbortSignal): AsyncIterable<HistoryEntry> {
    await this.refreshRoots().catch(() => undefined);
    for (const adapter of this.adapters()) {
      if (signal.aborted) return;
      try {
        yield* adapter.indexHistory(signal);
      } catch {
        // One unreadable root (a distro that went away mid-walk) must not end the others.
      }
    }
  }

  readHistoryEntry(transcriptPath: string): Promise<HistoryEntry | null> {
    return this.adapterForPath(transcriptPath).readHistoryEntry(transcriptPath);
  }

  async readDetail(id: SessionId, transcriptPath?: string | null): Promise<SessionDetail> {
    if (transcriptPath) return this.adapterForPath(transcriptPath).readDetail(id, transcriptPath);
    let failure: unknown = new Error(`no transcript found for session ${id}`);
    for (const adapter of this.adapters()) {
      try {
        return await adapter.readDetail(id, null);
      } catch (error) {
        failure = error;
      }
    }
    throw failure;
  }

  /**
   * Windows roots only: an IDE lock in a WSL root names a Linux pid, which no Windows window
   * belongs to. Jumping to a WSL session goes by project folder instead (`main/focus`).
   */
  async listIdeWindows(): Promise<IdeWindowRef[]> {
    const lists = await Promise.all(
      [...this.members.values()]
        .filter((member) => member.root.kind === 'windows')
        .map((member) => member.adapter.listIdeWindows().catch(() => [] as IdeWindowRef[])),
    );
    return lists.flat();
  }

  forgetSession(id: SessionId): void {
    for (const adapter of this.adapters()) adapter.forgetSession(id);
  }

  // ------------------------------------------------------------------ routing

  private adapters(): ClaudeAdapter[] {
    return [...this.members.values()].map((member) => member.adapter);
  }

  /** The adapter that read `source` (a registry file) — falls back to any adapter of the host. */
  private adapterFor(host: LiveSessionRef['host'], source: string): ClaudeAdapter {
    const owner = this.ownerOfPath(source);
    if (owner) return owner;
    const sameHost = [...this.members.values()].find((member) => member.root.id === host);
    return (sameHost ?? this.members.get(this.options.windowsRoot.claudeDir)!).adapter;
  }

  /** The adapter whose root contains `path`; a path outside every root goes to the Windows one. */
  private adapterForPath(path: string): ClaudeAdapter {
    return this.ownerOfPath(path) ?? this.members.get(this.options.windowsRoot.claudeDir)!.adapter;
  }

  private ownerOfPath(path: string): ClaudeAdapter | null {
    let best: Member | null = null;
    for (const member of this.members.values()) {
      if (!isPathInside(path, member.root.claudeDir)) continue;
      if (!best || member.root.claudeDir.length > best.root.claudeDir.length) best = member;
    }
    return best?.adapter ?? null;
  }
}
