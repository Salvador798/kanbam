export interface AnnouncementQueue {
  announce(message: string): void;
}

export interface Announcer extends AnnouncementQueue {
  destroy(): void;
}

const ANNOUNCE_DELAY_MS = 50;

function defaultSchedule(fn: () => void): void {
  setTimeout(fn, ANNOUNCE_DELAY_MS);
}

/** Clears the region, then sets the text later so screen readers re-read repeats. */
export function createAnnouncementQueue(
  setText: (text: string) => void,
  schedule: (fn: () => void) => void = defaultSchedule,
): AnnouncementQueue {
  return {
    announce(message) {
      if (message.trim() === '') {
        return;
      }
      setText('');
      schedule(() => setText(message));
    },
  };
}

const VISUALLY_HIDDEN_STYLE = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: '0',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: '0',
} as const;

export function createAnnouncer(container: HTMLElement): Announcer {
  const region = container.ownerDocument.createElement('div');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('role', 'status');
  region.setAttribute('aria-atomic', 'true');
  Object.assign(region.style, VISUALLY_HIDDEN_STYLE);
  container.append(region);
  const queue = createAnnouncementQueue((text) => {
    region.textContent = text;
  });
  return { announce: queue.announce, destroy: () => region.remove() };
}
