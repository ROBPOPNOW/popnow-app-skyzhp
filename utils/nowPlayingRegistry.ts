type NowPlayingToken = object;

interface NowPlayingEntry {
  token: NowPlayingToken;
  stop: () => void;
}

let current: NowPlayingEntry | null = null;

// Claims the "currently playing" slot. If another player already holds it,
// that player's stop() runs first so only one video is ever active at a time.
export function setActive(token: NowPlayingToken, stop: () => void): void {
  if (current && current.token !== token) {
    try {
      current.stop();
    } catch (e) {}
  }
  current = { token, stop };
}

// Releases the slot if this token still holds it. No-op if some other
// player has since taken over, or if this token was never current.
export function clear(token: NowPlayingToken): void {
  if (current?.token === token) {
    current = null;
  }
}
