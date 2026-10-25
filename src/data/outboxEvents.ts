// Lets the sync layer hear about local writes without the data layer depending on it.
type Listener = () => void;

const listeners = new Set<Listener>();

export function onOutboxAppended(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyOutboxAppended(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A failing listener must never fail the local write.
    }
  }
}
