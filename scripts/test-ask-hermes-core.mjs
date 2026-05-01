import assert from 'node:assert/strict';
import {
  buildLoanTrainingContext,
  createHermesSystemPrompt,
  createFallbackAnswer,
  parseTrainingPaste,
  buildSourceAwareAnswer,
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
assert.match(prompt, /overnight loan officer playbook/i);
assert.match(prompt, /source confidence/i);

const parsed = parseTrainingPaste(`TRAINING TITLE: Purchase Contract Review\nCATEGORY: Purchase\nWHO IT'S FOR: LOA\nTRAINING CONTENT:\nReview close date, seller credits, EMD, and financing contingency.\nKEY RULES / TAKEAWAYS:\n- Check close date\n- Confirm seller credits\nWHEN HERMES SHOULD USE THIS:\nWhen reviewing new purchase contracts.`);
assert.equal(parsed.title, 'Purchase Contract Review');
assert.equal(parsed.category, 'Purchase');
assert.match(parsed.content, /seller credits/);
assert.deepEqual(parsed.takeaways, ['Check close date', 'Confirm seller credits']);

const fallback = createFallbackAnswer('what docs are needed for FHA gift funds?', training);
assert.equal(fallback.mode, 'fallback');
assert.match(fallback.answer, /FHA Gift Funds/);
assert.match(fallback.answer, /donor letter/i);
assert.ok(fallback.nextActions.length >= 2);

const sourceAware = buildSourceAwareAnswer('how do I become a better loan officer?', '');
assert.match(sourceAware.answer, /Speed to lead/i);
assert.match(sourceAware.answer, /Follow-up/i);
assert.match(sourceAware.answer, /Source confidence/i);

console.log('ask-hermes-core tests passed');
