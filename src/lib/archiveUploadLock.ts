let uploadQueue: Promise<void> = Promise.resolve();

export async function acquireArchiveUploadLock(): Promise<() => void> {
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = uploadQueue;
  uploadQueue = previous.then(() => current, () => current);
  await previous;
  return release;
}
