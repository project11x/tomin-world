// SVG generator for stamps. One template, parameterised by label, icon,
// kind (drives colour), and earned-state (drives opacity / saturation).
// Output is an inline SVG string so callers can drop it straight into
// any container.

const KIND_COLOR = {
  travel: '#8B1538', // burgundy
  skill:  '#1e3a8a', // navy
  secret: '#a16207', // brass / gold
};

function safeId(label) {
  return 's' + Math.abs(
    [...label].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
  );
}

export function stampSVG({ label, icon, kind = 'travel', earned = true }) {
  const color = KIND_COLOR[kind] || '#444';
  const op = earned ? 0.88 : 0.28;
  const text = String(label || '').toUpperCase().slice(0, 22);
  const id = safeId(String(label || '') + kind);

  // Curve path: top half-circle for the label to follow.
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
      <defs>
        <path id="curve-${id}" d="M 14 50 A 36 36 0 0 1 86 50" fill="none" />
      </defs>
      <circle cx="50" cy="50" r="44" fill="none" stroke="${color}" stroke-width="2.5" opacity="${op}" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="${color}" stroke-width="0.6" opacity="${op * 0.55}" />
      <text font-family="ui-monospace, 'JetBrains Mono', monospace"
            font-size="7.5" font-weight="700"
            fill="${color}" opacity="${op * 0.95}" letter-spacing="0.7">
        <textPath href="#curve-${id}" startOffset="50%" text-anchor="middle">${escapeXml(text)}</textPath>
      </text>
      <text x="50" y="60" text-anchor="middle" font-size="26" opacity="${op}">${escapeXml(icon || '')}</text>
    </svg>
  `;
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }[c] || c));
}
