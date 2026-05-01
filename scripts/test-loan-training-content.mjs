import { readFileSync } from 'fs';
import { parseTrainingPaste } from '../src/lib/ask-hermes-core.mjs';

const training = readFileSync('content/loan-training/loom-mortgage-files-voe-updates-underwriting.md', 'utf8');
const parsed = parseTrainingPaste(training);
const masteryTraining = readFileSync('content/loan-training/loan-officer-mastery-playbook.md', 'utf8');
const masteryParsed = parseTrainingPaste(masteryTraining);
const structuringTraining = readFileSync('content/loan-training/loan-structuring-assistant-playbook.md', 'utf8');
const structuringParsed = parseTrainingPaste(structuringTraining);
const guardrailsTraining = readFileSync('content/loan-training/compliance-guardrails-for-ask-hermes-lo.md', 'utf8');
const guardrailsParsed = parseTrainingPaste(guardrailsTraining);

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
assert(parsed.content.includes('Hello. Hey Natalie'), 'parsed training content should include opening transcript text');
assert(parsed.content.includes("He's an animal."), 'parsed training content should include closing transcript text');

assert(masteryParsed.title === 'Loan Officer Mastery Playbook', 'mastery playbook title should parse');
assert(masteryParsed.content.includes('Fonz-style answer format'), 'mastery playbook should teach Fonz-style answers');
assert(masteryParsed.content.includes('Source confidence'), 'mastery playbook should include source confidence behavior');
assert(structuringParsed.title === 'Loan Structuring Assistant Playbook', 'structuring playbook title should parse');
assert(structuringParsed.content.includes('Structuring worksheet format'), 'structuring playbook should include worksheet format');
assert(structuringParsed.content.includes('Required inputs before meaningful structuring'), 'structuring playbook should include uploaded-doc use case');
assert(structuringParsed.content.includes('soft pull'), 'structuring playbook should include soft-pull use case');
assert(guardrailsParsed.title === 'Compliance Guardrails for Ask Hermes Loan Officer Assistance', 'guardrails title should parse');
assert(guardrailsParsed.content.includes('approved, denied, eligible, locked'), 'guardrails should prevent final approval language');

console.log(`PASS: full Loom transcript included and parsed (${timestampedLines.length} timestamped lines); LO mastery playbooks parsed`);
