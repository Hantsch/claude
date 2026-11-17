/**
 * Ambient stand-ins for the Claude Code engine's own types, which the scrum-cockpit mod's
 * `types/index.d.ts` names. The app imports that file for its data types only (`Snapshot`,
 * `Sprint`, ...); the `declare module 'claude-code'` block at its end describes the mod's state
 * inside the engine and means nothing here. Declaring the module and `Shaped` keeps the file
 * valid for the compiler even where `skipLibCheck` is off, without touching the plugin.
 */

/** The engine's marker type for state that is shaped for the renderer; here the plain type. */
type Shaped<T> = T;

declare module 'claude-code' {
  interface PluginState {}
}
