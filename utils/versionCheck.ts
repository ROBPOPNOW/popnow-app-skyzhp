// Parses "1.0.14" -> [1, 0, 14]. Returns null on anything malformed —
// missing, empty, non-numeric segments, whitespace-mangled, etc.
function parseVersion(v: string | null | undefined): number[] | null {
  if (!v || typeof v !== 'string') return null;
  const parts = v.trim().split('.');
  if (parts.length === 0) return null;

  const nums = parts.map((p) => (/^\d+$/.test(p) ? parseInt(p, 10) : NaN));
  if (nums.some((n) => Number.isNaN(n))) return null;

  return nums;
}

// True only if remoteVersion is strictly greater than localVersion.
// Any parse failure on either side fails safe to false (never nudge on
// uncertainty). Segment-count mismatches ("1.0" vs "1.0.14") are handled by
// treating missing trailing segments as 0.
export function isNewerVersion(
  remoteVersion: string | null | undefined,
  localVersion: string | null | undefined
): boolean {
  const remote = parseVersion(remoteVersion);
  const local = parseVersion(localVersion);
  if (!remote || !local) return false;

  const len = Math.max(remote.length, local.length);
  for (let i = 0; i < len; i++) {
    const r = remote[i] ?? 0;
    const l = local[i] ?? 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false; // equal
}
