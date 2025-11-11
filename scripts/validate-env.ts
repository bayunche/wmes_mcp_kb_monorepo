import { loadConfig } from "../packages/core/src/config";

try {
  const config = loadConfig({ envFile: ".env.example" });
  console.log("Environment variables validated successfully.");
  console.log(JSON.stringify({ NODE_ENV: config.NODE_ENV, PORT_API: config.PORT_API }, null, 2));
} catch (error) {
  console.error("Environment validation failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
