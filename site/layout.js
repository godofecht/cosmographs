// Point layout. Pure functions, so the layout can be tested without a browser.

export const LAYOUT_CENTER = 2048;
export const DOMAIN_RING_RADIUS = 900;

export function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const domainKey = (node) => node.kind === 'owner' ? 'Owner' : node.domain;

// One centre per domain, placed around a ring. Build this once from the full
// catalogue. A filtered view must reuse the same map, otherwise hiding one
// domain moves every other domain to a new angle.
export function buildDomainCenters(nodes) {
  const domains = [...new Set(nodes.map(domainKey))].sort();
  const radius = domains.length > 1 ? DOMAIN_RING_RADIUS : 0;
  return new Map(domains.map((domain, i) => {
    const angle = (i / Math.max(1, domains.length)) * Math.PI * 2;
    return [domain, [LAYOUT_CENTER + Math.cos(angle) * radius, LAYOUT_CENTER + Math.sin(angle) * radius]];
  }));
}

export function buildPositions(nodes, centers) {
  const out = [];
  for (const n of nodes) {
    const [cx, cy] = centers.get(domainKey(n)) || [LAYOUT_CENTER, LAYOUT_CENTER];
    const seed = hash(n.id);
    const angle = ((seed % 10000) / 10000) * Math.PI * 2;
    const radial = n.kind === 'repo' ? 40 + ((seed >>> 8) % 280) : 0;
    out.push(cx + Math.cos(angle) * radial, cy + Math.sin(angle) * radial);
  }
  return new Float32Array(out);
}
