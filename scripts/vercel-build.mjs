import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(`Failed to start ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Preview schema synchronization is opt-in and must only point at the isolated
// staging DATABASE_URL. Production builds never run db push as a side effect.
if (
  process.env.VERCEL_ENV === "preview" &&
  process.env.ASR_PREVIEW_DB_SYNC === "1"
) {
  console.log("Syncing Prisma schema to the isolated ASR preview database...");
  run("npx", ["prisma", "db", "push"]);
}

run("npx", ["prisma", "generate"]);
run("npx", ["next", "build"]);
