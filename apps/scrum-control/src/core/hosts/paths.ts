/**
 * Path mapping between a WSL distro and Windows (CONCEPT §2 "Paths").
 *
 * Canonical Windows form of a Linux path that does not live on a drive:
 * `\\wsl.localhost\<distro>\<path>` with backslashes — what Windows tools show and accept.
 * `normalizePathKey` folds every separator to `/`, so the same folder reached through the
 * forward-slash UNC form that Node reads (`//wsl.localhost/<distro>/...`) or the legacy
 * `\\wsl$\<distro>` host name still gets the same project key.
 */

import type { HostId } from '../model/types.ts';
import type { HostRoot } from './roots.ts';

/** The UNC host that exposes a running distro's file system to Windows. */
export const WSL_UNC_HOST = 'wsl.localhost';

/** `/mnt/<single letter>[/rest]` — a Windows drive seen from Linux (`/mnt/wsl`, `/mnt/wslg` are not). */
const MNT_DRIVE = /^\/mnt\/([a-zA-Z])(?:\/(.*))?$/;
/** `C:\x`, `c:/x`, `C:` — already a Windows path. */
const WINDOWS_DRIVE_PATH = /^[a-zA-Z]:(?:[\\/]|$)/;

/** Distro name of a `wsl:<distro>` id, or null for `windows`. */
export function distroOf(host: HostRoot | HostId): string | null {
  const id = typeof host === 'string' ? host : host.id;
  return id.startsWith('wsl:') ? id.slice('wsl:'.length) : null;
}

export function isWindowsPath(p: string): boolean {
  return WINDOWS_DRIVE_PATH.test(p) || p.startsWith('\\\\');
}

/**
 * The Windows spelling of a working directory reported by `host`. A Windows cwd, and anything
 * reported by the Windows host, is returned unchanged.
 */
export function toWindowsPath(cwd: string, host: HostRoot | HostId): string {
  const distro = distroOf(host);
  if (!distro || isWindowsPath(cwd)) return cwd;

  const drive = MNT_DRIVE.exec(cwd);
  if (drive) {
    const rest = (drive[2] ?? '').replace(/\/+$/, '').replace(/\//g, '\\');
    return `${drive[1]!.toUpperCase()}:\\${rest}`;
  }
  if (!cwd.startsWith('/')) return cwd;
  const tail = cwd.replace(/\/+$/, '').replace(/\//g, '\\');
  return `\\\\${WSL_UNC_HOST}\\${distro}${tail}`;
}

/**
 * The reverse: how `distro` sees a Windows path. `C:\x` is `/mnt/c/x`; a path under this
 * distro's own UNC share loses the prefix. Anything else cannot be reached from Linux and is
 * returned as null.
 */
export function toLinuxPath(windowsPath: string, distro: string): string | null {
  const drive = /^([a-zA-Z]):(?:[\\/](.*))?$/.exec(windowsPath);
  if (drive) {
    const rest = (drive[2] ?? '').replace(/[\\/]+/g, '/').replace(/\/+$/, '');
    return rest ? `/mnt/${drive[1]!.toLowerCase()}/${rest}` : `/mnt/${drive[1]!.toLowerCase()}`;
  }
  const unc = /^[\\/]{2}(?:wsl\.localhost|wsl\$)[\\/]([^\\/]+)(?:[\\/](.*))?$/i.exec(windowsPath);
  if (unc && unc[1]!.toLowerCase() === distro.toLowerCase()) {
    const rest = (unc[2] ?? '').replace(/[\\/]+/g, '/').replace(/\/+$/, '');
    return `/${rest}`;
  }
  return null;
}
