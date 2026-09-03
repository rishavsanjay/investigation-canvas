const mulberry32 = (seed) => () => {
  let t = (seed += 0x6D2B79F5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pick = (rng, values) => values[Math.floor(rng() * values.length)];
const jitter = (rng, scale = 1) => (rng() - 0.5) * 2 * scale;
const round = (value, digits = 2) => Number(value.toFixed(digits));

function buildCheckoutRegression() {
  const rng = mulberry32(20260903);
  const start = Date.parse('2026-08-24T00:00:00Z');
  const hour = 60 * 60 * 1000;
  const browsers = ['Chrome 149', 'Safari 20.1', 'Safari 20.2', 'Firefox 142', 'Edge 149'];
  const regions = ['NA', 'EU', 'APAC', 'LATAM'];
  const platforms = ['desktop', 'mobile'];
  const cohorts = ['control', 'price-test-A', 'price-test-B'];
  const records = [];

  for (let i = 0; i < 720; i += 1) {
    const timestamp = new Date(start + i * hour).toISOString();
    const platform = pick(rng, platforms);
    let browser = pick(rng, browsers);
    if (platform === 'mobile' && rng() < 0.42) browser = pick(rng, ['Safari 20.1', 'Safari 20.2']);
    const region = pick(rng, regions);
    const cohort = pick(rng, cohorts);
    const afterRelease = i >= 385;
    const version = afterRelease ? 'web-4.7.2' : i >= 250 ? 'web-4.7.1' : 'web-4.6.9';
    const safariBug = afterRelease && platform === 'mobile' && browser === 'Safari 20.2';
    const experimentBug = i >= 430 && platform === 'desktop' && cohort === 'price-test-B';
    const apacNoise = region === 'APAC' ? 18 : 0;

    let conversion = 5.95 + jitter(rng, 0.45);
    let latency = 208 + jitter(rng, 42) + apacNoise;
    let errorRate = 0.72 + jitter(rng, 0.28);
    let checkoutAbandonment = 26 + jitter(rng, 3.8);

    if (safariBug) {
      conversion -= 3.15 + jitter(rng, 0.35);
      latency += 405 + jitter(rng, 75);
      errorRate += 5.1 + jitter(rng, 0.7);
      checkoutAbandonment += 20 + jitter(rng, 3.2);
    }
    if (experimentBug) {
      conversion -= 1.65 + jitter(rng, 0.25);
      latency += 35 + jitter(rng, 15);
      errorRate += 0.4 + jitter(rng, 0.18);
      checkoutAbandonment += 9 + jitter(rng, 2);
    }

    const severity = safariBug ? 'critical' : experimentBug ? 'warning' : errorRate > 1.15 ? 'warning' : 'normal';
    records.push({
      id: `req-${String(i + 1).padStart(4, '0')}`,
      timestamp,
      platform,
      browser,
      region,
      cohort,
      version,
      conversion: round(Math.max(0.3, conversion)),
      latency: round(Math.max(80, latency), 0),
      errorRate: round(Math.max(0.05, errorRate)),
      checkoutAbandonment: round(Math.min(80, checkoutAbandonment)),
      sessions: Math.round(8200 + jitter(rng, 2200)),
      service: safariBug ? 'checkout-ui' : experimentBug ? 'pricing-api' : pick(rng, ['checkout-ui', 'pricing-api', 'payment-api']),
      severity,
      note: safariBug
        ? 'Repeated client-side submit retries detected.'
        : experimentBug
          ? 'Variant pricing response increased hesitation at checkout.'
          : 'No notable anomaly.'
    });
  }

  return {
    id: 'checkout-regression',
    title: 'Checkout conversion regression',
    subtitle: 'Production telemetry, release metadata, experiment cohorts, support evidence',
    recordLabel: 'hourly cohort slice',
    dimensions: {
      time: 'timestamp',
      x: 'latency',
      y: 'conversion',
      color: 'platform',
      size: 'sessions'
    },
    keyFields: ['platform', 'browser', 'region', 'cohort', 'version', 'service', 'severity'],
    numericFields: ['conversion', 'latency', 'errorRate', 'checkoutAbandonment', 'sessions'],
    records,
    documents: [
      {
        id: 'doc-release-472',
        title: 'Release web-4.7.2 notes',
        type: 'release-note',
        source: 'Engineering release bot',
        timestamp: '2026-09-09T01:05:00Z',
        trust: 'internal',
        tags: ['release', 'checkout-ui', 'Safari'],
        text: 'web-4.7.2 deployed a redesigned mobile checkout submit state. The change introduced optimistic form locking and a retry fallback for browsers that miss the first completion event. Browser-specific validation was limited to Safari 20.1 during pre-release testing.'
      },
      {
        id: 'doc-support-safari',
        title: 'Support cluster: mobile checkout loops',
        type: 'support-summary',
        source: 'Customer support',
        timestamp: '2026-09-10T08:40:00Z',
        trust: 'untrusted',
        tags: ['support', 'mobile', 'Safari 20.2'],
        text: 'Multiple customers report that tapping Pay briefly disables the button, then restores it without completing checkout. Most reports mention recent iPhone updates. One user says the flow eventually works after three or four attempts.'
      },
      {
        id: 'doc-experiment-b',
        title: 'Pricing experiment B specification',
        type: 'experiment',
        source: 'Growth team',
        timestamp: '2026-09-10T12:00:00Z',
        trust: 'internal',
        tags: ['experiment', 'price-test-B', 'desktop'],
        text: 'Variant B shows the annualized price prominently before the monthly equivalent. It targets desktop traffic only and began ramping from 10% to 50% on September 10. Primary metric is checkout conversion; guardrail is support contact rate.'
      },
      {
        id: 'doc-incident-payment',
        title: 'Payment API health check',
        type: 'incident-note',
        source: 'SRE',
        timestamp: '2026-09-10T14:10:00Z',
        trust: 'internal',
        tags: ['payment-api', 'latency'],
        text: 'Payment API p95 and authorization success rate remained within weekly baseline throughout the conversion drop. No deploys or dependency incidents occurred during the affected window.'
      },
      {
        id: 'doc-browser-rollout',
        title: 'Safari 20.2 adoption snapshot',
        type: 'external-note',
        source: 'Browser analytics feed',
        timestamp: '2026-09-09T18:00:00Z',
        trust: 'untrusted',
        tags: ['Safari 20.2', 'browser'],
        text: 'Safari 20.2 adoption increased rapidly after the public update, crossing 38% of mobile Safari traffic within 36 hours.'
      }
    ],
    graph: {
      nodes: [
        { id: 'n-web472', label: 'web-4.7.2', type: 'release' },
        { id: 'n-checkout', label: 'checkout-ui', type: 'service' },
        { id: 'n-safari', label: 'Safari 20.2', type: 'browser' },
        { id: 'n-mobile', label: 'mobile', type: 'platform' },
        { id: 'n-conv', label: 'conversion ↓', type: 'metric' },
        { id: 'n-errors', label: 'client retries ↑', type: 'metric' },
        { id: 'n-priceb', label: 'price-test-B', type: 'experiment' },
        { id: 'n-desktop', label: 'desktop', type: 'platform' },
        { id: 'n-pricing', label: 'pricing-api', type: 'service' },
        { id: 'n-payment', label: 'payment-api', type: 'service' }
      ],
      edges: [
        { source: 'n-web472', target: 'n-checkout', label: 'deployed to' },
        { source: 'n-checkout', target: 'n-mobile', label: 'serves' },
        { source: 'n-safari', target: 'n-mobile', label: 'runs on' },
        { source: 'n-safari', target: 'n-errors', label: 'correlates with' },
        { source: 'n-errors', target: 'n-conv', label: 'precedes' },
        { source: 'n-priceb', target: 'n-desktop', label: 'targets' },
        { source: 'n-priceb', target: 'n-pricing', label: 'changes response' },
        { source: 'n-pricing', target: 'n-conv', label: 'secondary effect' },
        { source: 'n-payment', target: 'n-conv', label: 'ruled out' }
      ]
    },
    starterHypotheses: [
      {
        id: 'hyp-browser',
        title: 'Safari 20.2 + web-4.7.2 caused the primary regression',
        confidence: 72,
        status: 'testing',
        supporting: ['doc-release-472', 'doc-support-safari', 'doc-browser-rollout'],
        contradicting: [],
        questions: ['Does the regression persist on Safari 20.1?', 'Did the failure begin exactly at the web-4.7.2 boundary?'],
        notes: 'Strong temporal and segment correlation; needs direct comparison against other mobile browsers.'
      },
      {
        id: 'hyp-payment',
        title: 'Payment API degradation caused checkout failures',
        confidence: 18,
        status: 'weakened',
        supporting: [],
        contradicting: ['doc-incident-payment'],
        questions: ['Any region-specific dependency issue hidden by aggregate health?'],
        notes: 'Aggregate payment telemetry is normal.'
      }
    ]
  };
}

function buildModelRegression() {
  const rng = mulberry32(260817);
  const start = Date.parse('2026-08-10T00:00:00Z');
  const records = [];
  const models = ['vit-b16', 'convnext-t', 'qwen-vl-head'];
  const datasets = ['dataset-v6', 'dataset-v7'];
  const optimizers = ['adamw', 'lion'];
  for (let i = 0; i < 420; i += 1) {
    const timestamp = new Date(start + i * 3 * 60 * 60 * 1000).toISOString();
    const dataset = i > 215 && rng() < 0.78 ? 'dataset-v7' : pick(rng, datasets);
    const model = pick(rng, models);
    const optimizer = pick(rng, optimizers);
    const crop = dataset === 'dataset-v7' ? pick(rng, ['center-0.88', 'center-0.88', 'center-0.80']) : 'center-0.95';
    const badCrop = dataset === 'dataset-v7' && crop === 'center-0.80';
    const lr = pick(rng, [0.0001, 0.0002, 0.0003, 0.0005]);
    let valAccuracy = 81.8 + (model === 'convnext-t' ? 1.1 : model === 'qwen-vl-head' ? 0.6 : 0) + jitter(rng, 1.25);
    let trainLoss = 0.42 + jitter(rng, 0.07);
    let calibrationError = 4.1 + jitter(rng, 1.0);
    if (badCrop) {
      valAccuracy -= 4.2 + jitter(rng, 0.6);
      trainLoss += 0.08 + jitter(rng, 0.03);
      calibrationError += 2.4 + jitter(rng, 0.5);
    }
    const unstable = optimizer === 'lion' && lr === 0.0005;
    if (unstable) {
      valAccuracy -= 2.1 + jitter(rng, 0.5);
      trainLoss += 0.22 + jitter(rng, 0.06);
    }
    records.push({
      id: `run-${String(i + 1).padStart(4, '0')}`,
      timestamp,
      model,
      dataset,
      optimizer,
      crop,
      region: pick(rng, ['us-central', 'europe-west', 'asia-east']),
      version: `train-${7 + Math.floor(i / 85)}.${i % 9}`,
      valAccuracy: round(valAccuracy),
      trainLoss: round(trainLoss, 3),
      calibrationError: round(calibrationError),
      stepTime: round(0.42 + jitter(rng, 0.08), 3),
      samples: pick(rng, [50000, 75000, 100000]),
      severity: badCrop || unstable ? 'warning' : 'normal',
      note: badCrop ? 'Potential crop-induced label truncation.' : unstable ? 'Optimizer instability late in training.' : 'Run within expected envelope.'
    });
  }
  return {
    id: 'model-regression',
    title: 'Model quality regression',
    subtitle: 'Training runs, dataset lineage, preprocessing changes, failure evidence',
    recordLabel: 'training run',
    dimensions: { time: 'timestamp', x: 'trainLoss', y: 'valAccuracy', color: 'dataset', size: 'samples' },
    keyFields: ['model', 'dataset', 'optimizer', 'crop', 'region', 'version', 'severity'],
    numericFields: ['valAccuracy', 'trainLoss', 'calibrationError', 'stepTime', 'samples'],
    records,
    documents: [
      { id: 'doc-dsv7', title: 'dataset-v7 preprocessing changelog', type: 'dataset-note', source: 'Data platform', timestamp: '2026-08-30T09:00:00Z', trust: 'internal', tags: ['dataset-v7', 'crop'], text: 'dataset-v7 switched the default image crop from center-0.95 to a configurable pipeline. A subset of jobs used center-0.80 due to a stale launch template.' },
      { id: 'doc-label-review', title: 'Failure review: truncated objects', type: 'review', source: 'Model quality team', timestamp: '2026-08-31T16:00:00Z', trust: 'internal', tags: ['dataset-v7', 'failure-analysis'], text: 'Manual inspection of 200 misclassifications found object truncation in 37 images, concentrated in dataset-v7 jobs using the aggressive crop preset.' },
      { id: 'doc-optimizer', title: 'Lion optimizer stability note', type: 'experiment', source: 'Training team', timestamp: '2026-08-26T11:00:00Z', trust: 'internal', tags: ['lion', 'learning-rate'], text: 'Lion at learning rate 5e-4 occasionally diverges late in training. This is independent of the dataset-v7 preprocessing regression and affects a smaller set of runs.' }
    ],
    graph: {
      nodes: [
        { id: 'n-dsv7', label: 'dataset-v7', type: 'dataset' },
        { id: 'n-crop80', label: 'crop 0.80', type: 'transform' },
        { id: 'n-trunc', label: 'object truncation', type: 'failure' },
        { id: 'n-acc', label: 'val accuracy ↓', type: 'metric' },
        { id: 'n-lion', label: 'Lion + 5e-4', type: 'optimizer' },
        { id: 'n-diverge', label: 'late divergence', type: 'failure' }
      ],
      edges: [
        { source: 'n-dsv7', target: 'n-crop80', label: 'some jobs use' },
        { source: 'n-crop80', target: 'n-trunc', label: 'causes' },
        { source: 'n-trunc', target: 'n-acc', label: 'reduces' },
        { source: 'n-lion', target: 'n-diverge', label: 'can cause' },
        { source: 'n-diverge', target: 'n-acc', label: 'secondary effect' }
      ]
    },
    starterHypotheses: [
      { id: 'hyp-crop', title: 'Aggressive center crop in dataset-v7 is the primary regression', confidence: 68, status: 'testing', supporting: ['doc-dsv7', 'doc-label-review'], contradicting: [], questions: ['Do v7 runs with crop 0.95 recover?', 'How much of the aggregate delta is explained by crop alone?'], notes: 'Likely dominant issue.' }
    ]
  };
}

function buildFraudRing() {
  const rng = mulberry32(8062026);
  const start = Date.parse('2026-08-20T00:00:00Z');
  const records = [];
  const merchants = ['Northstar Digital', 'Elm Goods', 'Lumen Market', 'Vertex Services', 'Harbor Retail'];
  const devices = ['dev-A12', 'dev-B77', 'dev-C03', 'dev-D91', 'dev-E44'];
  const countries = ['IN', 'SG', 'US', 'GB', 'AE'];
  for (let i = 0; i < 560; i += 1) {
    const timestamp = new Date(start + i * 45 * 60 * 1000).toISOString();
    const ring = i > 230 && i % 7 < 3;
    const merchant = ring ? pick(rng, ['Northstar Digital', 'Vertex Services']) : pick(rng, merchants);
    const device = ring ? pick(rng, ['dev-A12', 'dev-B77']) : pick(rng, devices);
    const region = ring ? pick(rng, ['SG', 'AE']) : pick(rng, countries);
    const amount = ring ? 420 + rng() * 620 : 20 + rng() * 480;
    const velocity = ring ? 7 + rng() * 11 : rng() * 5;
    const riskScore = Math.min(99, 18 + amount / 15 + velocity * 2.4 + (ring ? 18 : 0) + jitter(rng, 9));
    records.push({
      id: `txn-${String(i + 1).padStart(4, '0')}`,
      timestamp,
      merchant,
      device,
      region,
      version: ring ? 'rule-set-23' : 'rule-set-22',
      accountTier: pick(rng, ['basic', 'plus', 'business']),
      amount: round(amount),
      velocity: round(velocity),
      riskScore: round(riskScore),
      chargebackProbability: round(Math.min(95, riskScore * 0.72 + jitter(rng, 7))),
      sessions: Math.round(1 + rng() * 8),
      severity: riskScore > 78 ? 'critical' : riskScore > 60 ? 'warning' : 'normal',
      note: ring ? 'Shared device/merchant pattern under investigation.' : 'Routine transaction.'
    });
  }
  return {
    id: 'fraud-ring',
    title: 'Suspicious transaction network',
    subtitle: 'Transactions, devices, merchants, accounts, analyst notes',
    recordLabel: 'transaction',
    dimensions: { time: 'timestamp', x: 'amount', y: 'riskScore', color: 'merchant', size: 'sessions' },
    keyFields: ['merchant', 'device', 'region', 'accountTier', 'version', 'severity'],
    numericFields: ['amount', 'velocity', 'riskScore', 'chargebackProbability', 'sessions'],
    records,
    documents: [
      { id: 'doc-device', title: 'Device fingerprint overlap', type: 'analyst-note', source: 'Fraud analyst', timestamp: '2026-08-29T10:20:00Z', trust: 'internal', tags: ['dev-A12', 'dev-B77'], text: 'dev-A12 and dev-B77 share a rare canvas fingerprint and rotate through the same two hosting networks despite presenting as unrelated customer devices.' },
      { id: 'doc-merchant', title: 'Merchant escalation: Northstar Digital', type: 'case-note', source: 'Risk operations', timestamp: '2026-08-30T14:35:00Z', trust: 'internal', tags: ['Northstar Digital'], text: 'Northstar Digital shows an unusual concentration of high-velocity purchases followed by rapid account dormancy. The merchant disputes any connection between the customers.' },
      { id: 'doc-external', title: 'Open-source mention of Vertex Services', type: 'external-note', source: 'Open web capture', timestamp: '2026-08-30T15:10:00Z', trust: 'untrusted', tags: ['Vertex Services'], text: 'A forum post alleges Vertex Services is used as a payment descriptor for multiple unrelated digital storefronts. The claim is unverified and should not be treated as fact.' }
    ],
    graph: {
      nodes: [
        { id: 'n-a12', label: 'dev-A12', type: 'device' },
        { id: 'n-b77', label: 'dev-B77', type: 'device' },
        { id: 'n-north', label: 'Northstar Digital', type: 'merchant' },
        { id: 'n-vertex', label: 'Vertex Services', type: 'merchant' },
        { id: 'n-host', label: 'shared hosting ASN', type: 'network' },
        { id: 'n-risk', label: 'high-risk cluster', type: 'finding' }
      ],
      edges: [
        { source: 'n-a12', target: 'n-host', label: 'observed on' },
        { source: 'n-b77', target: 'n-host', label: 'observed on' },
        { source: 'n-a12', target: 'n-north', label: 'transacts with' },
        { source: 'n-b77', target: 'n-vertex', label: 'transacts with' },
        { source: 'n-north', target: 'n-risk', label: 'concentrated in' },
        { source: 'n-vertex', target: 'n-risk', label: 'concentrated in' }
      ]
    },
    starterHypotheses: [
      { id: 'hyp-ring', title: 'Two device identities coordinate transactions across linked merchants', confidence: 61, status: 'testing', supporting: ['doc-device', 'doc-merchant'], contradicting: [], questions: ['Are the shared fingerprints stable enough to imply common control?', 'Do timing patterns survive after controlling for region?'], notes: 'Treat external allegations as untrusted until corroborated.' }
    ]
  };
}

export const SAMPLE_DATASETS = [buildCheckoutRegression(), buildModelRegression(), buildFraudRing()];

export function cloneDataset(dataset) {
  return JSON.parse(JSON.stringify(dataset));
}
