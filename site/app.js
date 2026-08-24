import { Graph } from '@cosmos.gl/graph';

const DOMAIN_COLORS = {
  'Flow': '#8B5CF6', 'Audio / DSP': '#22D3EE', 'Games / Graphics': '#F59E0B',
  'AI / ML': '#F472B6', 'Research / Science': '#34D399', 'Web / Product': '#60A5FA',
  'Systems / Tooling': '#94A3B8', 'Creative': '#FB7185', 'Other': '#A3A3A3',
  'Owner': '#FFFFFF', 'Domain': '#E4E4E7'
};

const el = (id) => document.getElementById(id);
const graphEl = el('graph');
const loadingEl = el('loading');
const emptyEl = el('empty');
const inspectorEl = el('inspector');
const searchEl = el('search');
const domainEl = el('domain-filter');
const languageEl = el('language-filter');
const visibilityEl = el('visibility-filter');
const forkEl = el('fork-filter');
const archiveEl = el('archive-filter');
const resultsEl = el('search-results');
const tooltipEl = el('tooltip');

let graph;
let allNodes = [];
let allLinks = [];
let viewNodes = [];
let viewLinks = [];
let sourceName = '';
let firstRender = true;
let pointerX = 0;
let pointerY = 0;

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift();
  return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

function coerceNode(n) {
  return {
    ...n,
    index: Number(n.index),
    size_kb: Number(n.size_kb || 0),
    visual_size: Number(n.visual_size || 3),
    label_weight: Number(n.label_weight || .5),
    is_private: String(n.is_private).toLowerCase() === 'true',
    is_fork: String(n.is_fork).toLowerCase() === 'true',
    archived: String(n.archived).toLowerCase() === 'true'
  };
}

function coerceLink(l) {
  return {
    ...l,
    source_index: Number(l.source_index),
    target_index: Number(l.target_index),
    strength: Number(l.strength || .5),
    width: Number(l.width || .5)
  };
}

async function fetchText(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

async function loadFromUrls(nodesUrl, linksUrl, label) {
  loadingEl.hidden = false;
  const [nodesText, linksText] = await Promise.all([fetchText(nodesUrl), fetchText(linksUrl)]);
  setData(parseCSV(nodesText).map(coerceNode), parseCSV(linksText).map(coerceLink), label);
}

function setData(nodes, links, label) {
  allNodes = nodes;
  allLinks = links;
  sourceName = label;
  firstRender = true;
  el('source-label').textContent = label;
  resetControls();
  buildFilters();
  applyFilters();
  loadingEl.hidden = true;
}

function resetControls() {
  searchEl.value = '';
  domainEl.value = '';
  languageEl.value = '';
  visibilityEl.value = '';
  forkEl.checked = false;
  archiveEl.checked = false;
}

function buildFilters() {
  const repos = allNodes.filter(n => n.kind === 'repo');
  const domains = [...new Set(repos.map(n => n.domain).filter(Boolean))].sort();
  const languages = [...new Set(repos.map(n => n.language).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  domainEl.innerHTML = '<option value="">All domains</option>' + domains.map(v => `<option>${escapeHtml(v)}</option>`).join('');
  languageEl.innerHTML = '<option value="">All languages</option>' + languages.map(v => `<option>${escapeHtml(v)}</option>`).join('');
}

function matchesRepo(n) {
  const q = searchEl.value.trim().toLowerCase();
  const haystack = [n.label, n.owner, n.domain, n.language, n.description].join(' ').toLowerCase();
  return (!q || haystack.includes(q)) &&
    (!domainEl.value || n.domain === domainEl.value) &&
    (!languageEl.value || n.language === languageEl.value) &&
    (!visibilityEl.value || n.visibility === visibilityEl.value) &&
    (!forkEl.checked || !n.is_fork) &&
    (!archiveEl.checked || !n.archived);
}

function applyFilters() {
  const repos = allNodes.filter(n => n.kind === 'repo' && matchesRepo(n));
  const repoIds = new Set(repos.map(n => n.id));
  const hubIds = new Set();
  for (const l of allLinks) {
    if (repoIds.has(l.source) && (l.relation === 'owned-by' || l.relation === 'domain')) hubIds.add(l.target);
  }

  const included = new Set([...repoIds, ...hubIds]);
  const selectedNodes = allNodes.filter(n => included.has(n.id));
  const indexById = new Map(selectedNodes.map((n, i) => [n.id, i]));
  viewNodes = selectedNodes.map((n, i) => ({ ...n, index: i }));
  viewLinks = allLinks
    .filter(l => included.has(l.source) && included.has(l.target))
    .map(l => ({ ...l, source_index: indexById.get(l.source), target_index: indexById.get(l.target) }));

  emptyEl.hidden = repos.length !== 0;
  updateStats(repos);
  updateLegend(repos);
  updateSearchResults(repos);
  renderGraph();
}

function renderGraph() {
  if (!graph) {
    graph = new Graph(graphEl, {
      spaceSize: 4096,
      backgroundColor: '#08080a',
      pointDefaultSize: 3,
      pointDefaultColor: '#A3A3A3',
      pointGreyoutOpacity: .08,
      scalePointsOnZoom: true,
      renderLinks: true,
      linkDefaultWidth: .55,
      linkDefaultColor: '#52525B',
      linkOpacity: .34,
      linkGreyoutOpacity: .025,
      curvedLinks: true,
      renderHoveredPointRing: true,
      hoveredPointRingColor: '#FFFFFF',
      focusedPointRingColor: '#FFFFFF',
      enableDrag: true,
      enableSimulation: false,
      transitionDuration: 250,
      attribution: 'GPU graph: <a href="https://github.com/cosmosgl/graph" target="_blank" rel="noreferrer">cosmos.gl</a>',
      onPointClick: (index) => selectNode(index),
      onBackgroundClick: () => clearSelection(),
      onPointMouseOver: (index) => showTooltip(index),
      onPointMouseOut: () => hideTooltip()
    });
  }

  graph.setPointPositions(buildPositions(viewNodes));
  graph.setPointColors(buildPointColors(viewNodes));
  graph.setPointSizes(new Float32Array(viewNodes.map(n => n.kind === 'repo' ? Math.max(2.2, n.visual_size * .72) : n.kind === 'owner' ? 12 : 9)));
  graph.setLinks(new Float32Array(viewLinks.flatMap(l => [l.source_index, l.target_index])));
  graph.setLinkWidths(new Float32Array(viewLinks.map(l => Math.max(.35, l.width * .72))));
  graph.render(0);
  graph.pause();

  if (firstRender) {
    firstRender = false;
    setTimeout(() => graph?.fitView?.(), 100);
  }
}

function buildPositions(nodes) {
  const domains = [...new Set(nodes.map(n => n.kind === 'owner' ? 'Owner' : n.domain))].sort();
  const centers = new Map(domains.map((domain, i) => {
    const angle = (i / Math.max(1, domains.length)) * Math.PI * 2;
    const radius = domains.length > 1 ? 900 : 0;
    return [domain, [2048 + Math.cos(angle) * radius, 2048 + Math.sin(angle) * radius]];
  }));

  const out = [];
  for (const n of nodes) {
    const key = n.kind === 'owner' ? 'Owner' : n.domain;
    const [cx, cy] = centers.get(key) || [2048, 2048];
    const seed = hash(n.id);
    const angle = ((seed % 10000) / 10000) * Math.PI * 2;
    const radial = n.kind === 'repo' ? 40 + ((seed >>> 8) % 280) : 0;
    out.push(cx + Math.cos(angle) * radial, cy + Math.sin(angle) * radial);
  }
  return new Float32Array(out);
}

function buildPointColors(nodes) {
  const values = [];
  for (const n of nodes) values.push(...hexToRgba(n.color || DOMAIN_COLORS[n.domain] || '#A3A3A3'));
  return new Float32Array(values);
}

function hexToRgba(hex) {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean.slice(0, 6), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, 1];
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function selectNode(index) {
  const node = viewNodes[index];
  if (!node || !graph) return;

  const neighbors = graph.getNeighboringPointIndices?.(index) || [];
  const neighborhood = [index, ...neighbors];
  const connectedLinks = graph.getConnectedLinkIndices?.(neighborhood) || [];

  graph.setConfigPartial({
    focusedPointIndex: index,
    focusedLinkIndex: undefined,
    highlightedPointIndices: neighborhood,
    outlinedPointIndices: undefined,
    highlightedLinkIndices: connectedLinks,
    linkGreyoutOpacity: .05
  });
  graph.zoomToPointByIndex?.(index, 700, 3, true, false);
  graph.pause();
  showInspector(node);
}

function clearSelection() {
  graph?.setConfigPartial({
    focusedPointIndex: undefined,
    focusedLinkIndex: undefined,
    highlightedPointIndices: undefined,
    outlinedPointIndices: undefined,
    highlightedLinkIndices: undefined,
    linkGreyoutOpacity: .025
  });
  inspectorEl.classList.remove('open');
}

function updateStats(repos) {
  el('repo-count').textContent = repos.length.toLocaleString();
  el('link-count').textContent = viewLinks.length.toLocaleString();
  el('domain-count').textContent = new Set(repos.map(n => n.domain)).size.toLocaleString();
}

function updateLegend(repos) {
  const counts = new Map();
  for (const repo of repos) counts.set(repo.domain, (counts.get(repo.domain) || 0) + 1);
  el('legend').innerHTML = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([domain, count]) =>
    `<button class="legend-row" data-domain="${escapeAttr(domain)}"><i class="legend-dot" style="background:${DOMAIN_COLORS[domain] || '#A3A3A3'}"></i><span>${escapeHtml(domain)}</span><em>${count}</em></button>`
  ).join('');
}

function updateSearchResults(repos) {
  const q = searchEl.value.trim();
  if (!q) { resultsEl.innerHTML = ''; return; }
  resultsEl.innerHTML = repos.slice(0, 8).map(n =>
    `<button class="search-result" data-id="${escapeAttr(n.id)}"><strong>${escapeHtml(n.label)}</strong><span>${escapeHtml(n.domain)} · ${escapeHtml(n.language || '—')}</span></button>`
  ).join('');
}

function focusNode(id) {
  const index = viewNodes.findIndex(n => n.id === id);
  if (index >= 0) selectNode(index);
}

function showTooltip(index) {
  const n = viewNodes[index];
  if (!n || !tooltipEl) return;
  tooltipEl.innerHTML = `<strong>${escapeHtml(n.label)}</strong><span>${escapeHtml(n.domain)}${n.language ? ` · ${escapeHtml(n.language)}` : ''}</span>`;
  tooltipEl.style.left = `${Math.min(window.innerWidth - 220, pointerX + 14)}px`;
  tooltipEl.style.top = `${Math.min(window.innerHeight - 68, pointerY + 14)}px`;
  tooltipEl.hidden = false;
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.hidden = true;
}

function showInspector(n) {
  if (!n) return;
  inspectorEl.classList.add('open');
  const isRepo = n.kind === 'repo';
  const updated = n.updated_at ? new Date(n.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  inspectorEl.innerHTML = `
    <div class="eyebrow">${escapeHtml(n.kind.toUpperCase())}</div>
    <h2>${escapeHtml(n.label)}</h2>
    <div class="owner">${escapeHtml(n.owner || n.domain || '')}</div>
    <span class="badge">${escapeHtml(n.domain || '—')}</span>
    <p class="description">${escapeHtml(n.description || (isRepo ? 'No description.' : 'Graph hub.'))}</p>
    <div class="meta">
      <div class="meta-row"><span>Language</span><span>${escapeHtml(n.language || '—')}</span></div>
      <div class="meta-row"><span>Visibility</span><span>${escapeHtml(n.visibility || '—')}</span></div>
      <div class="meta-row"><span>Size</span><span>${isRepo ? `${Number(n.size_kb || 0).toLocaleString()} KB` : '—'}</span></div>
      <div class="meta-row"><span>Fork</span><span>${isRepo ? (n.is_fork ? 'yes' : 'no') : '—'}</span></div>
      <div class="meta-row"><span>Updated</span><span>${escapeHtml(updated)}</span></div>
      <div class="meta-row"><span>Source</span><span>${escapeHtml(sourceName)}</span></div>
    </div>
    ${n.url ? `<a class="ghost repo-link" href="${escapeAttr(n.url)}" target="_blank" rel="noreferrer">Open on GitHub ↗</a>` : ''}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]);
}
function escapeAttr(value) { return escapeHtml(value); }

let filterTimer;
function scheduleFilter() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(applyFilters, 100);
}

graphEl.addEventListener('pointermove', e => { pointerX = e.clientX; pointerY = e.clientY; });
searchEl.addEventListener('input', scheduleFilter);
[domainEl, languageEl, visibilityEl, forkEl, archiveEl].forEach(x => x.addEventListener('change', applyFilters));
resultsEl.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) focusNode(b.dataset.id); });
el('legend').addEventListener('click', e => {
  const row = e.target.closest('[data-domain]');
  if (!row) return;
  domainEl.value = row.dataset.domain;
  applyFilters();
});
el('fit-button').addEventListener('click', () => graph?.fitView?.());

el('local-button').addEventListener('click', async () => {
  try { await loadFromUrls('/private-data/nodes.csv', '/private-data/links.csv', 'private local graph'); }
  catch { alert('Private CSVs were not found. Run `python3 generate.py` and `npm run dev`, then try again.'); }
});

el('file-input').addEventListener('change', async e => {
  const files = [...e.target.files];
  const nodesFile = files.find(f => /nodes\.csv$/i.test(f.name));
  const linksFile = files.find(f => /links\.csv$/i.test(f.name));
  if (!nodesFile || !linksFile) { alert('Choose both nodes.csv and links.csv.'); return; }
  setData(parseCSV(await nodesFile.text()).map(coerceNode), parseCSV(await linksFile.text()).map(coerceLink), 'browser-local CSVs');
});

(async () => {
  try { await loadFromUrls('./data/nodes.csv', './data/links.csv', 'public GitHub snapshot'); }
  catch (error) {
    loadingEl.textContent = 'No bundled graph found. Open CSVs or generate a local graph.';
    console.error(error);
  }
})();