#!/usr/bin/env node
// Manual, offline importer for the private Headquarters snapshot. Not part of build/start.
// Usage: node scripts/import-headquarters-snapshot.mjs --evidence <file> --annotations <file> --out <file>
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSnapshotFromEvidence, ImportValidationError } from "./headquarters/import-core.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!["--evidence", "--annotations", "--out"].includes(key) || typeof argv[i + 1] !== "string") {
      throw new ImportValidationError("Usage: --evidence <file> --annotations <file> --out <file>");
    }
    args[key.slice(2)] = resolve(argv[i + 1]);
  }
  if (!args.evidence || !args.out) throw new ImportValidationError("--evidence and --out are required.");
  return args;
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new ImportValidationError(`Could not read ${label} as JSON.`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rel = relative(REPO_ROOT, args.out);
  if (!rel.startsWith("..") && !isAbsolute(rel)) {
    throw new ImportValidationError("Refusing to write the private snapshot inside the project repository.");
  }
  if (!args.out.endsWith(".json")) throw new ImportValidationError("--out must be a .json file.");

  const evidence = await readJson(args.evidence, "evidence");
  const annotations = args.annotations ? await readJson(args.annotations, "annotations") : {};
  const snapshot = buildSnapshotFromEvidence(evidence, annotations);

  await mkdir(dirname(args.out), { recursive: true, mode: 0o700 });
  const tmp = `${args.out}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, args.out);

  const c = snapshot.coverage;
  console.log(
    `Imported snapshot observed ${snapshot.observedAt}: github=${c.github} vercel=${c.vercel} replit=${c.replit} local=${c.local} ` +
      `(assets=${snapshot.assets.length}, connections=${snapshot.connections.length}, findings=${snapshot.findings.length})`,
  );
}

main().catch((error) => {
  console.error(error instanceof ImportValidationError ? error.message : "Import failed.");
  process.exit(1);
});
