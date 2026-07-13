/** Shared loading placeholder used by page/step loading guards. */
export function Loading({ text = 'Loading...' }: { text?: string }) {
  return <div className="loading">{text}</div>;
}
