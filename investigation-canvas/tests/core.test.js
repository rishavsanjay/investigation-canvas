import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareGroups, extent, filterRecords, findOutliers, groupCounts, histogram,
  inferDataset, mean, median, parseCsv, pearson, rankCorrelations,
  rankDiscriminatingFeatures, recordMatchesFilter, safeNumber, stdev,
  summarizeRecords, findCounterevidence, buildReasoningGraph
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
test('filter predicate rejects unknown op', () => assert.equal(recordMatchesFilter(rows[0], {field:'x',op:'wat',value:2}), false));
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
test('missing and boolean values are not coerced to numeric zero', () => {
  assert.equal(safeNumber(''), null);
  assert.equal(safeNumber(null), null);
  assert.equal(safeNumber(false), null);
  assert.equal(mean([{x:''},{x:null},{x:10}], 'x'), 10);
});
test('constant summaries report their real minimum and maximum', () => {
  const summary=summarizeRecords([{x:5},{x:5}],['x']);
  assert.equal(summary.metrics.x.min,5);
  assert.equal(summary.metrics.x.max,5);
});
test('extent handles large arrays without argument-spread overflow', () => {
  const large=Array.from({length:200000},(_,i)=>({x:i}));
  assert.deepEqual(extent(large,'x'),[0,199999]);
});
test('small imported datasets still infer numeric fields', () => {
  assert.deepEqual(inferDataset([{x:1,y:2}]).numericFields,['x','y']);
  assert.deepEqual(inferDataset([{x:1},{x:2}]).numericFields,['x']);
});
test('counterevidence requires a hypothesis term match', () => {
  const hits=findCounterevidence({title:'Safari crash',supporting:[],contradicting:[]},[{id:'x',title:'Normal cafeteria menu',text:'Lunch unchanged',tags:[]}]);
  assert.deepEqual(hits,[]);
});
test('reasoning graph never emits dangling causal endpoints', () => {
  const graph=buildReasoningGraph([],[],[],[{source:'a',target:'b',label:'causes'}]);
  const ids=new Set(graph.nodes.map((node)=>node.id));
  assert.ok(graph.edges.every((edge)=>ids.has(edge.source)&&ids.has(edge.target)));
});
test('numeric range filters reject null, undefined, and empty string values', () => {
  assert.equal(recordMatchesFilter({x:null},{field:'x',op:'gte',value:0}), false);
  assert.equal(recordMatchesFilter({x:''},{field:'x',op:'lte',value:0}), false);
  assert.equal(recordMatchesFilter({x:undefined},{field:'x',op:'between',min:0,max:10}), false);
});
test('equality filter treats null and undefined consistently without matching literal undefined', () => {
  assert.equal(recordMatchesFilter({x:undefined},{field:'x',op:'eq',value:'undefined'}), false);
  assert.equal(recordMatchesFilter({x:null},{field:'x',op:'eq',value:'null'}), false);
});
test('reasoning graph labels causal endpoints using known titles when available', () => {
  const graph=buildReasoningGraph([{id:'h1',title:'Leading hypothesis'}],[{id:'doc1',title:'Server log dump'}],[],[{source:'doc1',target:'h1',label:'explains'}]);
  assert.equal(graph.nodes.find(n=>n.id==='doc1')?.label, 'Server log dump');
  assert.equal(graph.nodes.find(n=>n.id==='h1')?.label, 'Leading hypothesis');
});
