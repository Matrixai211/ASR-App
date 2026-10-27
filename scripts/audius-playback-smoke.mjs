import { spawn } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (process.env.ASR_IMPORT_ON_BUILD !== "1") {
  console.log("[ASR Audius playback smoke] skipped; one-time flag is not enabled");
  process.exit(0);
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

function audioSignature(buffer) {
  const first = buffer.subarray(0, 16).toString("ascii");
  if (first.startsWith("RIFF") && first.slice(8, 12) === "WAVE") return true;
  if (first.startsWith("fLaC") || first.startsWith("OggS") || first.startsWith("ID3") || first.slice(4, 8) === "ftyp") return true;
  const end = Math.min(buffer.length - 1, 4096);
  for (let i = 0; i < end; i += 1) {
    if (buffer[i] === 255 && (buffer[i + 1] & 224) === 224) return true;
  }
  return false;
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  let server = null;
  let stdout = "";
  let stderr = "";
  try {
    const record = await prisma.audiusImport.findFirst({
      where: { status: "STAGED", storageBackend: "NEON_BYTEA" },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, artistName: true, contentType: true, fileSizeBytes: true, sha256: true, storageBackend: true }
    });
    if (!record) throw new Error("No staged Neon-backed Audius import was found for playback verification");
    const token = process.env.ASR_IMPORT_RUNNER_TOKEN || "";
    if (!token) throw new Error("Temporary playback verification token is missing");
    await prisma.$disconnect();

    const port = 3412;
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    server.stdout.on("data", chunk => { stdout = (stdout + chunk.toString()).slice(-3000); });
    server.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-3000); });

    const base = "http://127.0.0.1:" + port + "/api/imports/audius/" + record.id + "/stream";
    const probeUrl = base + "?probe=1&runnerToken=" + encodeURIComponent(token);
    let probe = null;
    let lastError = "Next.js server did not become ready";
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (server.exitCode !== null) throw new Error("Next.js server exited early: " + stderr);
      try {
        const response = await fetch(probeUrl, { cache: "no-store", signal: AbortSignal.timeout(2000) });
        const body = await response.text();
        if (response.ok) {
          probe = JSON.parse(body);
          break;
        }
        lastError = "Playback probe returned HTTP " + response.status + ": " + body.slice(0, 300);
      } catch (error) {
        lastError = message(error);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!probe) throw new Error("Playback probe failed: " + lastError + ". Server output: " + stdout + " " + stderr);
    if (probe.ok !== true || probe.audioSignatureVerified !== true || probe.sha256Verified !== true) {
      throw new Error("Playback probe did not validate stored audio and checksum: " + JSON.stringify(probe));
    }

    const rangeUrl = base + "?runnerToken=" + encodeURIComponent(token);
    const rangeResponse = await fetch(rangeUrl, {
      headers: { Range: "bytes=0-31" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });
    const rangeBytes = Buffer.from(await rangeResponse.arrayBuffer());
    const rangeContentType = rangeResponse.headers.get("content-type") || "";
    const contentRange = rangeResponse.headers.get("content-range") || "";
    if (rangeResponse.status !== 206 || rangeBytes.byteLength !== 32 || !rangeContentType.startsWith("audio/mpeg") || !audioSignature(rangeBytes)) {
      throw new Error("Range playback failed: status=" + rangeResponse.status + ", bytes=" + rangeBytes.byteLength + ", type=" + rangeContentType + ", range=" + contentRange);
    }

    console.log("ASR_AUDIUS_PLAYBACK_RESULT=" + JSON.stringify({
      ok: true,
      importId: record.id,
      title: record.title,
      artistName: record.artistName,
      storageBackend: record.storageBackend,
      storedBytes: record.fileSizeBytes,
      storedContentType: record.contentType,
      probeVerified: probe.ok,
      sha256Verified: probe.sha256Verified,
      audioSignatureVerified: probe.audioSignatureVerified,
      rangeStatus: rangeResponse.status,
      rangeBytes: rangeBytes.byteLength,
      rangeContentType,
      contentRange,
      sampleHeaderHex: rangeBytes.subarray(0, 16).toString("hex")
    }));
  } finally {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([
        new Promise(resolve => server.once("exit", resolve)),
        new Promise(resolve => setTimeout(resolve, 2500))
      ]);
    }
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch(error => {
  console.error("ASR_AUDIUS_PLAYBACK_FAILED=" + message(error));
  process.exitCode = 1;
});
