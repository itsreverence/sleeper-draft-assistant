export interface EventStreamChannel {
  close(): void;
  send(
    controller: ReadableStreamDefaultController<Uint8Array>,
    event: string,
    data: unknown,
  ): boolean;
}

export function createEventStreamChannel(): EventStreamChannel {
  const encoder = new TextEncoder();
  let closed = false;

  return {
    close() {
      closed = true;
    },
    send(controller, event, data) {
      if (closed) {
        return false;
      }

      const payload = encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      try {
        controller.enqueue(payload);
        return true;
      } catch {
        // A refresh can finish after the browser has already closed the stream.
        closed = true;
        return false;
      }
    },
  };
}
