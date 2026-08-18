/**
 * A small atomic JSON store for an Electron main process.
 *
 * Writes go to `<file>.tmp` and are then renamed over the target, so a crash
 * mid-write can never leave a half-written file. The previous good version is
 * kept as `<file>.bak`; an unparseable file is set aside as
 * `<file>.corrupt-<timestamp>` and the backup is tried, so the user does not
 * silently lose their data.
 *
 * Main-process only: it uses `node:fs`. Give it one instance per file, and give
 * churny data (window geometry) its own file so that write traffic stays away
 * from the state that matters.
 *
 * This file is yours once copied - the plugin will not touch it again.
 */

import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface StoreLogger {
  warn: (message: string) => void
  error: (message: string, error?: unknown) => void
}

export interface MigrationStep {
  /** Schema version this step produces. */
  to: number
  /** Short description, logged when the step runs. */
  describe: string
  apply: (doc: Record<string, unknown>) => Record<string, unknown>
}

export interface JsonStoreOptions<T> {
  filePath: string
  /** Used when the file is absent, empty or unrecoverable. */
  defaults: () => T
  /**
   * Turns unknown JSON into a valid `T`. Must never throw: it is the last line
   * of defence against a hand-edited or truncated file. Give every field a
   * default and parse collections row by row, so one bad entry is dropped
   * instead of taking the whole file with it.
   */
  parse: (raw: unknown) => T
  /** Coalesce bursts of writes (window resizing) into one disk write. */
  debounceMs?: number
  /**
   * Ordered, append-only schema migrations. Rules that keep this safe:
   *  - never edit a shipped step; add a new one
   *  - a step must be pure and must not throw (a bad step means data loss)
   *  - bump the schema version in the same commit as the step
   */
  migrations?: readonly MigrationStep[]
  /** Field holding the schema version in the document. Default: `schemaVersion`. */
  versionField?: string
  logger?: StoreLogger
}

const consoleLogger: StoreLogger = {
  warn: (message) => console.warn(`[json-store] ${message}`),
  error: (message, error) => console.error(`[json-store] ${message}`, error ?? ''),
}

export class JsonStore<T> {
  private readonly options: JsonStoreOptions<T>
  private readonly log: StoreLogger
  private cache: T | null = null
  private writeTimer: ReturnType<typeof setTimeout> | null = null
  private pending: Promise<void> = Promise.resolve()
  /** Set when the loaded file was damaged, so the UI can tell the user. */
  public recoveredFrom: 'backup' | 'defaults' | null = null
  /** Set when a migration ran, so the caller knows the file was rewritten. */
  public migrated = false

  constructor(options: JsonStoreOptions<T>) {
    this.options = options
    this.log = options.logger ?? consoleLogger
  }

  private get tmpPath(): string {
    return `${this.options.filePath}.tmp`
  }

  private get bakPath(): string {
    return `${this.options.filePath}.bak`
  }

  async load(): Promise<T> {
    const primary = await this.tryRead(this.options.filePath)
    if (primary.status === 'ok') {
      this.cache = this.options.parse(this.migrate(primary.value))
      if (this.migrated) await this.flush(this.cache)
      return this.cache
    }

    if (primary.status === 'damaged') {
      const quarantine = `${this.options.filePath}.corrupt-${Date.now()}`
      await rename(this.options.filePath, quarantine).catch(() => undefined)
      this.log.error(`unparseable state file, moved to ${quarantine}`)

      const backup = await this.tryRead(this.bakPath)
      if (backup.status === 'ok') {
        this.cache = this.options.parse(this.migrate(backup.value))
        this.recoveredFrom = 'backup'
        this.log.warn('recovered state from backup')
        await this.flush(this.cache)
        return this.cache
      }
      this.recoveredFrom = 'defaults'
    }

    this.cache = this.options.defaults()
    return this.cache
  }

  /** Current value; `load()` must have run first. */
  get(): T {
    if (this.cache === null) {
      throw new Error(`JsonStore(${this.options.filePath}) read before load()`)
    }
    return this.cache
  }

  /** Replaces the value and schedules a write. */
  set(next: T): T {
    this.cache = next
    this.schedule(next)
    return next
  }

  /** Applies a change to the current value and schedules a write. */
  update(mutate: (current: T) => T): T {
    return this.set(mutate(this.get()))
  }

  /** Resolves once every scheduled write has hit the disk. Call before quitting. */
  async settle(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
      this.enqueue(this.get())
    }
    await this.pending
  }

  /** Runs every migration whose target version is above the document's own. */
  private migrate(raw: unknown): unknown {
    const steps = this.options.migrations ?? []
    if (steps.length === 0 || typeof raw !== 'object' || raw === null) return raw

    const field = this.options.versionField ?? 'schemaVersion'
    let doc = raw as Record<string, unknown>
    const current = typeof doc[field] === 'number' ? (doc[field] as number) : 0

    for (const step of steps) {
      if (step.to <= current) continue
      this.log.warn(`migrating to schema ${step.to}: ${step.describe}`)
      doc = { ...step.apply(doc), [field]: step.to }
      this.migrated = true
    }
    return doc
  }

  private schedule(value: T): void {
    const debounce = this.options.debounceMs ?? 0
    if (debounce <= 0) {
      this.enqueue(value)
      return
    }
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null
      this.enqueue(value)
    }, debounce)
  }

  /** Serialises writes so two updates can never interleave on the same file. */
  private enqueue(value: T): void {
    this.pending = this.pending
      .then(() => this.flush(value))
      .catch((error: unknown) => {
        this.log.error(`failed to persist ${this.options.filePath}`, error)
      })
  }

  private async flush(value: T): Promise<void> {
    const serialized = `${JSON.stringify(value, null, 2)}\n`
    await mkdir(dirname(this.options.filePath), { recursive: true })
    await writeFile(this.tmpPath, serialized, 'utf8')
    // Keep the last known-good version before replacing it.
    await copyFile(this.options.filePath, this.bakPath).catch(() => undefined)
    await rename(this.tmpPath, this.options.filePath)
  }

  private async tryRead(
    path: string,
  ): Promise<{ status: 'ok'; value: unknown } | { status: 'absent' } | { status: 'damaged' }> {
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch {
      return { status: 'absent' }
    }
    if (text.trim().length === 0) return { status: 'damaged' }
    try {
      return { status: 'ok', value: JSON.parse(text) as unknown }
    } catch {
      return { status: 'damaged' }
    }
  }

  /** Test helper: removes the store and its siblings. */
  async destroy(): Promise<void> {
    await Promise.all([
      rm(this.options.filePath, { force: true }),
      rm(this.bakPath, { force: true }),
      rm(this.tmpPath, { force: true }),
    ])
    this.cache = null
  }
}

/*
 * Example migration, for the doc comment on your own MIGRATIONS array:
 *
 * export const MIGRATIONS: readonly MigrationStep[] = [
 *   {
 *     to: 2,
 *     describe: 'move per-item overrides into moduleData.config',
 *     apply: (doc) => {
 *       const items = Array.isArray(doc.items) ? doc.items : []
 *       return {
 *         ...doc,
 *         items: items.map((raw) => {
 *           const item = raw as Record<string, unknown>
 *           const { overrides, ...rest } = item
 *           if (!overrides) return item
 *           const moduleData = (item.moduleData as Record<string, unknown>) ?? {}
 *           return { ...rest, moduleData: { ...moduleData, config: { overrides } } }
 *         }),
 *       }
 *     },
 *   },
 * ]
 */
