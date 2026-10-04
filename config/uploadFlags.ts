/**
 * Feature flags for the Bunny.net key-removal migration.
 * Shared by app/upload.tsx and app/(tabs)/profile.tsx's handleRetryUpload so both
 * paths stay in sync — flip here to test/revert both at once.
 */
export const USE_TUS_UPLOAD = true; // flip to false to revert to the direct-key upload path
export const USE_EDGE_STATUS_CHECK = true; // flip to false to revert to the direct-key status check
export const USE_EDGE_DELETE = true; // flip to false to revert to the direct-key delete path
export const USE_EDGE_DOWNLOAD = true; // flip to false to revert to the direct-key download-url path

// Gates the Tier 1 pre-upload/background-upload flow: the video uploads silently in the
// background while the user is still on the edit screen, and Post attaches metadata and
// finalizes server-side. ON as of 1.0.17. Set to false to fall back to the legacy post-time
// upload — that flow (the TUS code above) stays in the app as the fallback, and is what
// app versions older than 1.0.17 still run.
export const USE_PREUPLOAD = true;
