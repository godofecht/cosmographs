import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDomainCenters, buildPositions } from '../site/layout.js';

const catalogue = [
  { id: 'owner', kind: 'owner' },
  ...['A', 'B', 'C', 'D'].flatMap((domain) =>
    [1, 2, 3].map((i) => ({ id: `${domain}/repo-${i}`, kind: 'repo', domain })))
];

function positionsById(nodes, centers) {
  const flat = buildPositions(nodes, centers);
  return new Map(nodes.map((n, i) => [n.id, [flat[i * 2], flat[i * 2 + 1]]]));
}

test('hiding one domain leaves every other point where it was', () => {
  const centers = buildDomainCenters(catalogue);
  const full = positionsById(catalogue, centers);
  const filtered = catalogue.filter((n) => n.domain !== 'B');
  const after = positionsById(filtered, centers);
  assert.equal(after.size, catalogue.length - 3);
  for (const [id, xy] of after) assert.deepEqual(xy, full.get(id), id);
});

test('centres built from a filtered view would move the survivors', () => {
  // The old behaviour. This is what the fix removes, kept as a check that the
  // first test can fail.
  const full = positionsById(catalogue, buildDomainCenters(catalogue));
  const filtered = catalogue.filter((n) => n.domain !== 'B');
  const moved = positionsById(filtered, buildDomainCenters(filtered));
  const [x0, y0] = full.get('C/repo-1');
  const [x1, y1] = moved.get('C/repo-1');
  assert.ok(Math.hypot(x1 - x0, y1 - y0) > 800);
});

test('a single domain sits at the centre', () => {
  const centers = buildDomainCenters([{ id: 'x', kind: 'repo', domain: 'A' }]);
  assert.deepEqual(centers.get('A'), [2048, 2048]);
});
