// =============================================================================
// Stage 3 / Sprint 3.2 Content Security Policy Builder (L-08)
// - Production build: strict `script-src` (ZERO `'unsafe-inline'`),
//   explicit Google Maps Platform origins (maps.googleapis.com, *.gstatic.com,
//   *.googleapis.com, *.ggpht.com, fonts.gstatic.com, *.google.com),
//   no bare `https:` wildcards.
// - Development preview: allows Vite React Refresh preamble & HMR WebSockets
//   while remaining completely isolated from built production `dist/index.html`.
// =============================================================================

const GMP_SCRIPT_HOSTS = 'https://maps.googleapis.com https://maps.gstatic.com';
const GMP_FONT_HOSTS = 'https://fonts.gstatic.com';
const GMP_IMG_HOSTS =
  'https://maps.gstatic.com https://*.googleapis.com https://*.ggpht.com https://*.gstatic.com';
const GMP_CONNECT_HOSTS =
  'https://maps.googleapis.com https://places.googleapis.com https://routes.googleapis.com https://*.googleapis.com https://*.gstatic.com';
const GMP_FRAME_HOSTS = 'https://*.googleapis.com https://*.google.com';

export function buildContentSecurityPolicy(mode: 'development' | 'production'): string {
  if (mode === 'development') {
    return (
      [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' ${GMP_SCRIPT_HOSTS}`,
        "style-src 'self' 'unsafe-inline'",
        `font-src 'self' data: ${GMP_FONT_HOSTS}`,
        `img-src 'self' data: blob: ${GMP_IMG_HOSTS}`,
        `connect-src 'self' ws: wss: ${GMP_CONNECT_HOSTS}`,
        `frame-src 'self' ${GMP_FRAME_HOSTS}`,
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ') + ';'
    );
  }

  return (
    [
      "default-src 'self'",
      `script-src 'self' ${GMP_SCRIPT_HOSTS}`,
      "style-src 'self' 'unsafe-inline'",
      `font-src 'self' data: ${GMP_FONT_HOSTS}`,
      `img-src 'self' data: blob: ${GMP_IMG_HOSTS}`,
      `connect-src 'self' ${GMP_CONNECT_HOSTS}`,
      `frame-src 'self' ${GMP_FRAME_HOSTS}`,
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ') + ';'
  );
}

