import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareGroups, extent, filterRecords, findOutliers, groupCounts, histogram,
  inferDataset, mean, median, parseCsv, pearson, rankCorrelations,
  rankDiscriminatingFeatures, recordMatchesFilter, stdev
} from '../src/core.js';

const rows = [
  { id: 'a', group: 'x', x: 1, y: 2, name: 'alpha' },
  { id: 'b', group: 'x', x: 2, y: 4, name: 'beta' },
  { id: 'c', group: 'y', x: 3, y: 6, name: 'gamma' },
  { id: 'd', group: 'y', x: 100, y: 8, name: 'delta' }
];

test('extent returns numeric range', () => assert.deepEqual(extent(rows, 'x'), [1, 100]));
test('mean works', () => assert.equal(mean(rows, 'y'), 5));
test('median works for even count', () => assert.equal(median(rows, 'y'), 5));
test('stdev is positive', () => assert.ok(stdev(rows, 'x') > 0));
test('pearson identifies strong positive correlation', () => assert.ok(pearson(rows.slice(0,3), 'x', 'y') > .99));
test('eq filter works', () => assert.equal(filterRecords(rows, [{ field:'group', op:'eq', value:'x' }]).length, 2));
test('neq filter works', () => assert.equal(filterRecords(rows, [{ field:'group', op:'neq', value:'x' }]).length, 2));
test('contains filter works', () => assert.equal(filterRecords(rows, [{ field:'name', op:'contains', value:'amm' }]).length, 1));
test('numeric gt filter works', () => assert.equal(filterRecords(rows, [{ field:'x', op:'gt', value:2 }]).length, 2));
test('between filter works', () => assert.equal(filterRecords(rows, [{ field:'x', op:'between', min:2, max:3 }]).length, 2));
test('in filter works', () => assert.equal(filterRecords(rows, [{ field:'name', op:'in', value:['alpha','delta'] }]).length, 2));
test('full record search works', () => assert.equal(filterRecords(rows, [], 'gamma').length, 1));
test('filter predicate tolerates unknown op', () => assert.equal(recordMatchesFilter(rows[0], {field:'x',op:'wat',value:2}), true));
test('groupCounts orders largest first', () => assert.equal(groupCounts(rows, 'group')[0].count, 2));
test('histogram preserves record count', () => assert.equal(histogram(rows, 'x', 5).reduce((s,b)=>s+b.count,0), rows.length));
test('findOutliers finds extreme value', () => assert.equal(findOutliers([...rows, {id:'e',x:1000}], 'x', 1.5)[0].record.id, 'e'));
test('rankCorrelations returns target alternatives', () => assert.ok(rankCorrelations(rows, 'y', ['x','y']).some(x=>x.field==='x')));
test('compareGroups returns numeric and categorical deltas', () => {
  const out = compareGroups(rows.slice(0,2), rows.slice(2), ['x','y'], ['group']);
  assert.equal(out.numeric.length, 2);
  assert.ok(out.categorical.length >= 2);
});
test('rankDiscriminatingFeatures returns ranked evidence', () => assert.ok(rankDiscriminatingFeatures(rows.slice(0,2), rows.slice(2), ['x'], ['group']).length > 0));
test('CSV parser handles quoted commas', () => {
  const out = parseCsv('name,value\n"a,b",2\nc,3\n');
  assert.equal(out[0].name, 'a,b');
  assert.equal(out[0].value, 2);
});
test('CSV parser handles CRLF', () => assert.equal(parseCsv('a,b\r\n1,2\r\n3,4\r\n').length, 2));
test('inferDataset detects numeric fields', () => {
  const d = inferDataset([{id:'1', time:'2026-01-01', value:2, group:'a'}, {id:'2', time:'2026-01-02', value:3, group:'b'}, {id:'3', time:'2026-01-03', value:4, group:'a'}]);
  assert.ok(d.numericFields.includes('value'));
  assert.equal(d.dimensions.time, 'time');
});
