type Listener = (event: Event) => void;

export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly CONNECTING = FakeEventSource.CONNECTING;
  readonly OPEN = FakeEventSource.OPEN;
  readonly CLOSED = FakeEventSource.CLOSED;
  readonly listeners = new Map<string, Set<Listener>>();
  readonly draftId: string;
  readonly userRosterId: string | null;
  readyState = FakeEventSource.OPEN;
  withCredentials = false;
  closeCalls = 0;
  closed = false;
  onerror: ((this: EventSource, event: Event) => unknown) | null = null;
  onmessage: ((this: EventSource, event: MessageEvent) => unknown) | null = null;
  onopen: ((this: EventSource, event: Event) => unknown) | null = null;

  constructor(draftId: string, userRosterId: string | null) {
    this.draftId = draftId;
    this.userRosterId = userRosterId;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (!listener) return;
    const callback = typeof listener === "function"
      ? listener
      : (event: Event) => listener.handleEvent(event);
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (!listener) return;
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    const callback = typeof listener === "function"
      ? listener
      : (event: Event) => listener.handleEvent(event);
    listeners.delete(callback);
    if (listeners.size === 0) {
      this.listeners.delete(type);
    }
  }

  close() {
    this.closeCalls += 1;
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  emit(type: string, payload: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(payload) });
    this.listeners.get(type)?.forEach((listener) => listener(event));
    if (type === "message") {
      this.onmessage?.call(this as unknown as EventSource, event);
    }
  }

  emitError() {
    const event = new Event("error");
    this.onerror?.call(this as unknown as EventSource, event);
  }
}
