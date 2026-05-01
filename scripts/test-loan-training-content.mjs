import { readFileSync } from 'fs';

const training = readFileSync('content/loan-training/loom-mortgage-files-voe-updates-underwriting.md', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const timestampedLines = training
  .split('\n')
  .filter((line) => /^\[\d{2}:\d{2}\]/.test(line));

assert(training.includes('FULL TIMESTAMPED TRANSCRIPT:'), 'training should include full transcript section');
assert(timestampedLines.length >= 140, `expected at least 140 transcript lines, got ${timestampedLines.length}`);
assert(training.includes('Hello. Hey Natalie'), 'training should include opening transcript text');
assert(training.includes("He's an animal."), 'training should include closing transcript text');

console.log(`PASS: full Loom transcript included (${timestampedLines.length} timestamped lines)`);
