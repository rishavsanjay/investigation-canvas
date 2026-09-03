import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_DATASETS } from '../src/sampleData.js';
import { filterRecords, compareGroups, mean } from '../src/core.js';

test('checkout demo contains a strong primary Safari regression', () => {
  const d = SAMPLE_DATASETS.find(x=>x.id==='checkout-regression');
  const affected = filterRecords(d.records, [
    {field:'platform',op:'eq',value:'mobile'},
    {field:'browser',op:'eq',value:'Safari 20.2'},
    {field:'version',op:'eq',value:'web-4.7.2'}
  ]);
  const rest = d.records.filter(r=>!affected.some(a=>a.id===r.id));
  assert.ok(affected.length > 20);
  assert.ok(mean(affected,'conversion') < mean(rest,'conversion') - 2);
  assert.ok(mean(affected,'latency') > mean(rest,'latency') + 250);
  assert.ok(mean(affected,'errorRate') > mean(rest,'errorRate') + 3);
});

test('checkout demo also contains an independent desktop experiment regression', () => {
  const d = SAMPLE_DATASETS.find(x=>x.id==='checkout-regression');
  const affected = filterRecords(d.records, [
    {field:'platform',op:'eq',value:'desktop'},
    {field:'cohort',op:'eq',value:'price-test-B'},
    {field:'version',op:'eq',value:'web-4.7.2'}
  ]);
  const control = filterRecords(d.records, [
    {field:'platform',op:'eq',value:'desktop'},
    {field:'cohort',op:'eq',value:'control'},
    {field:'version',op:'eq',value:'web-4.7.2'}
  ]);
  assert.ok(mean(affected,'conversion') < mean(control,'conversion') - .8);
});

test('ML demo crop failure is analytically recoverable', () => {
  const d = SAMPLE_DATASETS.find(x=>x.id==='model-regression');
  const bad = filterRecords(d.records,[{field:'dataset',op:'eq',value:'dataset-v7'},{field:'crop',op:'eq',value:'center-0.80'}]);
  const good = filterRecords(d.records,[{field:'dataset',op:'eq',value:'dataset-v7'},{field:'crop',op:'neq',value:'center-0.80'}]);
  assert.ok(mean(bad,'valAccuracy') < mean(good,'valAccuracy') - 2.5);
});

test('fraud demo contains a recoverable device/merchant concentration', () => {
  const d = SAMPLE_DATASETS.find(x=>x.id==='fraud-ring');
  const shared = filterRecords(d.records,[{field:'device',op:'in',value:['dev-A12','dev-B77']}]);
  const others = filterRecords(d.records,[{field:'device',op:'in',value:['dev-C03','dev-D91','dev-E44']}]);
  assert.ok(mean(shared,'riskScore') > mean(others,'riskScore') + 5);
});
