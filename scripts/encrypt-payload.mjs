import { rename, readFile, rm, writeFile } from "node:fs/promises";
import { decryptEnvelope, encryptEnvelope } from "../src/crypto/envelope.js";
import { assertDashboardPayload } from "../src/data/contract.js";

const USAGE =
  "Usage: node scripts/encrypt-payload.mjs --input <payload.json> --output <payload.enc.json>";
const MINIMUM_PASSPHRASE_LENGTH = 10;

function parseArguments(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }

    if (argument !== "--input" && argument !== "--output") {
      throw new Error(`Unknown argument: ${argument}`);
    }

    const key = argument.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}.`);
    }

    if (options[key]) {
      throw new Error(`Duplicate argument: ${argument}`);
    }

    options[key] = value;
    index += 1;
  }

  if (!options.input || !options.output) {
    throw new Error("Both --input and --output are required.");
  }

  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const passphrase = process.env.DASHBOARD_PASSPHRASE;
  if (
    typeof passphrase !== "string"
    || passphrase.trim().length < MINIMUM_PASSPHRASE_LENGTH
  ) {
    throw new Error(
      `DASHBOARD_PASSPHRASE must contain at least ${MINIMUM_PASSPHRASE_LENGTH} characters.`,
    );
  }

  const source = await readFile(options.input, "utf8");
  let payload;

  try {
    payload = JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(`Input is not valid JSON: ${options.input}`);
  }

  assertDashboardPayload(payload);

  const envelope = await encryptEnvelope(payload, passphrase);
  const verifiedPayload = await decryptEnvelope(envelope, passphrase);
  assertDashboardPayload(verifiedPayload);
  if (JSON.stringify(verifiedPayload) !== JSON.stringify(payload)) {
    throw new Error("Encrypted payload verification did not reproduce the source payload.");
  }

  const temporaryOutput = `${options.output}.${process.pid}.tmp`;
  const backupOutput = `${options.output}.${process.pid}.bak`;
  await writeFile(temporaryOutput, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  let hadExistingOutput = false;
  try {
    await rename(options.output, backupOutput);
    hadExistingOutput = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    await rename(temporaryOutput, options.output);
    if (hadExistingOutput) await rm(backupOutput);
  } catch (error) {
    if (hadExistingOutput) await rename(backupOutput, options.output);
    throw error;
  }
  process.stdout.write(`Encrypted payload written to ${options.output}\n`);
}

main().catch((error) => {
  process.stderr.write(`Encryption failed: ${error.message}\n`);
  process.exitCode = 1;
});
