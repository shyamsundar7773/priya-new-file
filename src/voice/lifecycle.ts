export function createIdempotentStop(stop: () => void): () => void {
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    stop();
  };
}
