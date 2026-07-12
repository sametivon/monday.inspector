// Pre-build: wipe the hashed-asset dir so orphans from previous builds
// don't accumulate in docs/. Only the React app writes docs/assets — the
// legacy guide pages use docs/style.css, docs/js/ and docs/vendor/.
import { rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const docs = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs");
rmSync(resolve(docs, "assets"), { recursive: true, force: true });
console.log("prebuild: cleared docs/assets");
