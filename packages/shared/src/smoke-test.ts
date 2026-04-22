/**
 * Smoke test: verifies the swagger-parser can parse the sample spec
 * and the karate-generator can produce .feature files from it.
 *
 * Run: node packages/shared/dist/smoke-test.js
 * (or: npx tsx packages/shared/src/smoke-test.ts)
 */

import { parseSpec } from "../../swagger-parser/dist/spec-parser.js";
import {
  generateFeatureFiles,
  generateKarateConfig,
} from "../../karate-generator/dist/feature-builder.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(__dirname, "../../../specs/sample-openapi.yaml");
const OUTPUT_DIR = join(__dirname, "../../../test-output");

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  Smoke Test: swagger-parser → karate  ");
  console.log("═══════════════════════════════════════\n");

  // Step 1: Parse the spec
  console.log(`[1/3] Parsing spec: ${SPEC_PATH}`);
  const apiModel = await parseSpec(SPEC_PATH);
  console.log(`  ✅ Title: ${apiModel.title}`);
  console.log(`  ✅ Version: ${apiModel.version}`);
  console.log(`  ✅ Base URL: ${apiModel.baseUrl}`);
  console.log(`  ✅ Endpoints: ${apiModel.endpoints.length}`);
  console.log(`  ✅ Schemas: ${Object.keys(apiModel.schemas).length}`);

  // Print endpoint summary
  for (const ep of apiModel.endpoints) {
    console.log(`     ${ep.method.padEnd(6)} ${ep.path} → ${ep.operationId ?? "(no operationId)"}`);
  }

  // Step 2: Generate Karate feature files
  console.log(`\n[2/3] Generating Karate feature files → ${OUTPUT_DIR}`);
  const result = await generateFeatureFiles(apiModel, OUTPUT_DIR, "tag");
  console.log(`  ✅ ${result.summary}`);
  for (const f of result.filesWritten) {
    console.log(`     📄 ${f}`);
  }

  // Step 3: Generate karate-config.js
  console.log(`\n[3/3] Generating karate-config.js`);
  const configPath = await generateKarateConfig(apiModel, OUTPUT_DIR, {
    local: "http://localhost:8080/api",
    staging: "https://api.staging.example.com",
  });
  console.log(`  ✅ ${configPath}`);

  console.log("\n═══════════════════════════════════════");
  console.log("  All smoke tests passed! 🎉");
  console.log("═══════════════════════════════════════");
}

main().catch((err) => {
  console.error("❌ Smoke test failed:", err);
  process.exit(1);
});
