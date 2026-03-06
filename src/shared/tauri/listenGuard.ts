export type UnlistenFn = () => void | Promise<void>;

export function guardUnlisten(
  unlisten: UnlistenFn,
  onError: (error: unknown) => void = () => {},
): () => Promise<void> {
  let settled = false;
  return async () => {
    if (settled) {
      return;
    }
    settled = true;
    try {
      await unlisten();
    } catch (error) {
      onError(error);
    }
  };
}
