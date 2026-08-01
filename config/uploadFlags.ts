/**
 * Feature flags for the Bunny.net key-removal migration.
 * Shared by app/upload.tsx and app/(tabs)/profile.tsx's handleRetryUpload so both
 * paths stay in sync — flip here to test/revert both at once.
 */
export const USE_TUS_UPLOAD = true; // flip to false to revert to the direct-key upload path
export const USE_EDGE_STATUS_CHECK = true; // flip to false to revert to the direct-key status check
export const USE_EDGE_DELETE = true; // flip to false to revert to the direct-key delete path
export const USE_EDGE_DOWNLOAD = true; // flip to false to revert to the direct-key download-url path
