import { Cosmograph } from 'https://esm.sh/@cosmograph/cosmograph@2?bundle';

const DOMAIN_COLORS = {
  'Flow': '#8B5CF6', 'Audio / DSP': '#22D3EE', 'Games / Graphics': '#F59E0B',
  'AI / ML': '#F472B6', 'Research / Science': '#34D399', 'Web / Product': '#60A5FA',
  'Systems / Tooling': '#94A3B8', 'Creative': '#FB7185', 'Other': '#A3A3A3'
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

let cosmograph;
let allNodes = [];
let allLinks = [];
let viewNodes = [];
let viewLinks = [];
let sourceName = '';

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
  return { ...l, source_index: Number(l.source_index), target_index: Number(l.target_index), strength: Number(l.strength || .5), width: Number(l.width || .5) };
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
  el('source-label').textContent = label;
  buildFilters();
  applyFilters();
  loadingEl.hidden = true;
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
  const config = {
    points: viewNodes,
    links: viewLinks,
    pointIdBy: 'id',
    pointIndexBy: 'index',
    pointColorBy: 'color',
    pointSizeBy: 'visual_size',
    pointLabelBy: 'label',
    pointLabelWeightBy: 'label_weight',
    linkSourceBy: 'source',
    linkSourceIndexBy: 'source_index',
    linkTargetBy: 'target',
    linkTargetIndexBy: 'target_index',
    linkWidthBy: 'width',
    backgroundColor: '#08080a',
    pointGreyoutOpacity: .08,
    linkGreyoutOpacity: .025,
    linkWidthScale: .55,
    simulationRepulsion: .55,
    simulationGravity: .12,
    simulationCenter: .15,
    showFPSMonitor: false,
    onPointClick: (index) => showInspector(viewNodes[index])
  };

  if (!cosmograph) cosmograph = new Cosmograph(graphEl, config);
  else cosmograph.setConfig(config);
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
    `<div class="legend-row"><i class="legend-dot" style="background:${DOMAIN_COLORS[domain] || '#A3A3A3'}"></i><span>${escapeHtml(domain)}</span><em>${count}</em></div>`
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
  if (index < 0 || !cosmograph) return;
  cosmograph.selectPointByIndex(index, true);
  cosmograph.fitViewByPointIndices([index], 450, .3, false);
  showInspector(viewNodes[index]);
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
  filterTimer = setTimeout(applyFilters, 90);
}

searchEl.addEventListener('input', scheduleFilter);
[domainEl, languageEl, visibilityEl, forkEl, archiveEl].forEach(x => x.addEventListener('change', applyFilters));
resultsEl.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) focusNode(b.dataset.id); });
el('fit-button').addEventListener('click', () => cosmograph?.fitView?.(500));

el('local-button').addEventListener('click', async () => {
  try { await loadFromUrls('../out/nodes.csv', '../out/links.csv', 'private local graph'); }
  catch { alert('Private CSVs were not found at ../out/. Run `python3 generate.py`, serve the repo root, then open /site/.'); }
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
    loadingEl.textContent = 'No bundled graph found. Open CSVs or run the local generator.';
    console.error(error);
  }
})();
