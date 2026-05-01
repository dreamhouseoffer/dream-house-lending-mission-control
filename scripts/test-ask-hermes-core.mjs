import assert from 'node:assert/strict';
import {
  buildLoanTrainingContext,
  createHermesSystemPrompt,
  createFallbackAnswer,
} from '../src/lib/ask-hermes-core.mjs';

const training = buildLoanTrainingContext([
  {
    title: 'FHA Gift Funds',
    category: 'FHA',
    audience: 'Loan officer',
    content: 'Gift funds require donor letter, proof of transfer, and acceptable donor source.',
    takeaways: ['Get donor letter', 'Document transfer'],
    useWhen: 'Use when the team asks about FHA gift fund conditions.',
  },
]);

assert.match(training, /FHA Gift Funds/);
assert.match(training, /Gift funds require donor letter/);
assert.match(training, /Use when the team asks about FHA gift fund conditions/);

const prompt = createHermesSystemPrompt({ trainingContext: training });
assert.match(prompt, /Dream House Lending/);
assert.match(prompt, /loan officer assistant/i);
assert.match(prompt, /Do not invent guidelines/i);
assert.match(prompt, /FHA Gift Funds/);

const fallback = createFallbackAnswer('what docs are needed for FHA gift funds?', training);
assert.equal(fallback.mode, 'fallback');
assert.match(fallback.answer, /FHA Gift Funds/);
assert.match(fallback.answer, /donor letter/i);
assert.ok(fallback.nextActions.length >= 2);

console.log('ask-hermes-core tests passed');
