/** The small `WSL` mark on a project row: some of its sessions run inside a WSL distro. */
export function WslBadge({ distros }: { distros: readonly string[] }): React.JSX.Element {
  return (
    <span
      className="pj-wsl"
      title={distros.length > 0 ? `Sessions run in WSL: ${distros.join(', ')}` : 'Sessions run in WSL'}
    >
      WSL
    </span>
  );
}
