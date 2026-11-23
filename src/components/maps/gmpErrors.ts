// =============================================================================
// Google Maps Platform Client-Side Quota Defense Helper (Tier 2)
// - Triggers 'gmp-quota-exceeded' ONLY on explicit quota/billing/rate errors
//   (429, RESOURCE_EXHAUSTED, OVER_QUERY_LIMIT, OverQuotaMapError, QuotaExceededError).
// - Never triggers on empty search/route results or generic network timeouts.
// =============================================================================

function extractErrorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null) {
    const rec = err as Record<string, unknown>;
    if (typeof rec.message === 'string') return rec.message;
    try {
      return JSON.stringify(err);
    } catch {
      return '';
    }
  }
  return '';
}

export function isGmpQuotaError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object') {
    const rec = err as Record<string, unknown>;
    if (rec.status === 429 || rec.code === 'OVER_QUERY_LIMIT' || rec.status === 'RESOURCE_EXHAUSTED') {
      return true;
    }
  }
  const msg = extractErrorText(err);
  return (
    msg.includes('OverQuotaMapError') ||
    msg.includes('QuotaExceededError') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    /\b429\b/.test(msg)
  );
}

export function notifyIfGmpQuotaError(err: unknown): boolean {
  if (!isGmpQuotaError(err)) return false;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
  return true;
}
