# Dream House Lending Loan Training Knowledge Base

This folder is Ask Hermes' server-side training database for Dream House Lending.

## Purpose

Store internal DHL process knowledge so Ask Hermes can answer questions for Fonz, Claudia, Nathaly, and the team using DHL-specific source material instead of generic mortgage advice.

## Required format for each training

Each training file should include:

- `TRAINING TITLE`
- `CATEGORY`
- `WHO IT'S FOR`
- `SOURCE`
- `SOURCE CONFIDENCE`
- `TRAINING CONTENT` — cleaned SOP/checklist summary
- `KEY RULES / TAKEAWAYS`
- `WHEN HERMES SHOULD USE THIS`
- `FULL TIMESTAMPED TRANSCRIPT` — full transcript when available

## Transcript handling rules

- Full transcripts belong here, not in Hermes personal memory.
- Personal memory should only track conventions and stable facts, not giant raw transcripts.
- If a pasted transcript contains timestamp resets such as `0:00`, treat each reset as a new video/thread unless it is clearly a continuation.
- For multi-video pastes, ingest each video as its own markdown file so Ask Hermes can cite the right training source.
- Keep the SOP summary on top and the full transcript underneath.
- Do not ingest borrower-sensitive data unless it is already appropriate for internal training or has been sanitized.

## Source hierarchy in Ask Hermes

1. Uploaded/server-side DHL trainings in this folder
2. Current pipeline context
3. General loan officer playbook
4. Missing source / ask for more training
