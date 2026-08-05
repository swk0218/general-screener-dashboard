import { readFile } from "node:fs/promises";
import { parseEnvelope } from "../src/crypto/envelope.js";

const payloadPath = new URL("../public/data/payload.enc.json", import.meta.url);
const serialized = await readFile(payloadPath, "utf8");
parseEnvelope(serialized);
process.stdout.write("Encrypted payload envelope is valid.\n");
