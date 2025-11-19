import { mkdirSync } from "node:fs";
import { loadConfig } from "../../packages/core/src/config";
import { modelManifest, ensureModelArtifact } from "../../packages/tooling/src/models";

async function main() {
  const cfg = loadConfig({ envFile: process.env.ENV_FILE ?? ".env" });
  mkdirSync(cfg.MODELS_DIR, { recursive: true });

  for (const artifact of modelManifest) {
    try {
      console.log(`Ensuring ${artifact.name}`);
      await ensureModelArtifact(cfg.MODELS_DIR, artifact);
    } catch (error) {
      console.warn(`⚠ Failed to sync ${artifact.name}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log("Model sync completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
