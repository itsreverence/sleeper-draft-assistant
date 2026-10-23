import { tick } from "svelte";

export async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await tick();
}
