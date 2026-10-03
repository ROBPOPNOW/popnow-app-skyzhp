// Single source of truth for the pre-upload window.
//
// reconcile-pending-uploads uses this as the abandon threshold: a pre-upload row that is
// still un-posted (status uploading/ready, caption null) this long after it was created
// is deleted along with its Bunny object. If the scoped upload token (design Part B,
// currently deferred) is ever built, its TTL must import UPLOAD_WINDOW_SECONDS from here
// so the token lifetime and the abandon threshold can't drift apart.

export const UPLOAD_WINDOW_HOURS = 3;
export const UPLOAD_WINDOW_SECONDS = UPLOAD_WINDOW_HOURS * 60 * 60;
export const UPLOAD_WINDOW_MS = UPLOAD_WINDOW_SECONDS * 1000;
