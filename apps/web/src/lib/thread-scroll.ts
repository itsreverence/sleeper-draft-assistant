export type ThreadNewest = { id: string; status: string } | null;

type ThreadFollower = { update(next: ThreadNewest): void; destroy(): void };

// Within this many pixels of the bottom, the reader is following the thread
// rather than reading history.
const FOLLOW_SLACK_PX = 24;

function nearBottom(node: HTMLElement): boolean {
  return node.scrollHeight - node.clientHeight - node.scrollTop <= FOLLOW_SLACK_PX;
}

function revealNewest(node: HTMLElement) {
  const newest = node.lastElementChild;
  if (!newest) return;
  node.scrollTop = newest.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop;
}

// Keeps a message thread on its newest message. A new message always comes into
// view, because the reader just sent it, and counts as following even before the
// scroll event lands. A status change on the newest message (the answer, an
// error, a cancellation) comes into view only while the reader is still at the
// bottom, so reading history is never interrupted. Scrolling is instant: a
// smooth scroll fires scroll events from positions the reader never chose.
export function followNewest(node: HTMLElement, newest: ThreadNewest): ThreadFollower {
  let following = true;
  let current = newest;
  const onScroll = () => { following = nearBottom(node); };
  node.addEventListener("scroll", onScroll, { passive: true });
  revealNewest(node);
  return {
    update(next) {
      const previous = current;
      current = next;
      if (!next) return;
      const appended = next.id !== previous?.id;
      if (!appended && next.status === previous?.status) return;
      if (appended) following = true;
      if (following) revealNewest(node);
    },
    destroy() {
      node.removeEventListener("scroll", onScroll);
    },
  };
}
