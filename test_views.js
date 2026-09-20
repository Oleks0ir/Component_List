// Checks the admin view filters: node test_views.js
import assert from 'assert';
import { visibleRows } from './src/views.js';

const parts = [
  { inventory_key: 'a', in_stock: 0 },
  { inventory_key: 'b', in_stock: 1 },
  { inventory_key: 'c', in_stock: 5 },
  { inventory_key: 'd', in_stock: 6 },
  { inventory_key: 'e', in_stock: 99 }
];
const keys = (v, t, z) => visibleRows(parts, v, t, z).map((c) => c.inventory_key).join('');

// out of stock: only the zeroes
assert.equal(keys('out', 5, true), 'a', 'out shows only in_stock === 0');

// low: at or under the threshold, but never the zeroes — those belong to "out"
assert.equal(keys('low', 5, true), 'bc', 'low is inclusive of the threshold and excludes 0');
assert.equal(keys('low', 1, true), 'b', 'low respects a tighter threshold');
assert.equal(keys('low', 0, true), '', 'threshold 0 matches nothing, since 0 stock is not "low"');
assert.equal(keys('low', 99, true), 'bcde', 'a wide threshold still excludes 0');

// suggested: components table is empty, the suggestions render separately
assert.equal(keys('suggested', 5, true), '', 'suggested view shows no components');

// all: the pre-existing zero-stock checkbox still governs
assert.equal(keys('all', 5, true), 'abcde', 'all + show-zero shows everything');
assert.equal(keys('all', 5, false), 'bcde', 'all + hide-zero drops the zeroes');

console.log('view filters ok');
