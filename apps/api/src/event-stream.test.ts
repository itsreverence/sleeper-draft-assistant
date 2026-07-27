import { describe, expect, it, vi } from "vitest";
import { createEventStreamChannel } from "./event-stream";

describe("event stream channel", () => {
  it("stops writing after cancellation", () => {
    const enqueue = vi.fn();
    const controller = { enqueue } as unknown as ReadableStreamDefaultController<Uint8Array>;
    const channel = createEventStreamChannel();

    expect(channel.send(controller, "snapshot", { pick: 1 })).toBe(true);
    channel.close();
    expect(channel.send(controller, "heartbeat", { pick: 1 })).toBe(false);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("treats a closed controller as a disconnected client", () => {
    const enqueue = vi.fn(() => {
      throw new TypeError("Controller is already closed");
    });
    const controller = { enqueue } as unknown as ReadableStreamDefaultController<Uint8Array>;
    const channel = createEventStreamChannel();

    expect(channel.send(controller, "pick", { pick: 9 })).toBe(false);
    expect(channel.send(controller, "heartbeat", { pick: 9 })).toBe(false);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
