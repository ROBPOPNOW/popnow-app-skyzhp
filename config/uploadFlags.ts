/**
 * Feature flags for the Bunny.net key-removal migration.
 * Shared by app/upload.tsx and app/(tabs)/profile.tsx's handleRetryUpload so both
 * paths stay in sync — flip here to test/revert both at once.
 */
export const USE_TUS_UPLOAD = true; // flip to false to revert to the direct-key upload path
export const USE_EDGE_STATUS_CHECK = true; // flip to false to revert to the direct-key status check
export const USE_EDGE_DELETE = true; // flip to false to revert to the direct-key delete path
export const USE_EDGE_DOWNLOAD = true; // flip to false to revert to the direct-key download-url path

// Gates the Tier 1 pre-upload/background-upload rebuild (upload starts while the user is still
// editing, survives app close). Everything above this line is the current TUS flow and stays
// live and default while USE_PREUPLOAD is false — flip only once the new path is built and tested.
export const USE_PREUPLOAD = false;
