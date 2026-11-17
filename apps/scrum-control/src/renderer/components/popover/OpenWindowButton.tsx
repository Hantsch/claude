/**
 * "Open window" on a project row: brings the project's VS Code window forward. A nested button
 * inside a row that is itself a `div[role=button]`, so it stops the click and the keydown from
 * reaching the row, whose own handlers toggle the expansion.
 */
export function OpenWindowButton({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      className="pj-open"
      title="Bring this project's VS Code window forward"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      Open window
    </button>
  );
}
