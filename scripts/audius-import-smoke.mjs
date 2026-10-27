import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

if (process.env.ASR_IMPORT_ON_BUILD !== "1") {
  console.log("[ASR Audius smoke] skipped; one-time flag is not enabled");
  process.exit(0);
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const BASES = ["https://api.audius.co/v1", "https://discoveryprovider.audius.co/v1"];
const queries = [
  "CC0 instrumental",
  "creative commons ambient",
  "public domain music",
  "free download instrumental",
  "royalty free instrumental",
  "ambient instrumental",
  "lofi instrumental",
  "jazz instrumental",
  "afrobeat instrumental",
  "house instrumental",
  "soundtrack instrumental"
];

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

async function audiusJson(path) {
  let last = "Audius API unavailable";
  for (const base of BASES) {
    try {
      const response = await fetch(base + path, {
        cache: "no-store",
        headers: { Accept: "application/json", "User-Agent": "ASRRecords/0.4" },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        last = "Audius HTTP " + response.status;
        continue;
      }
      const payload = await response.json();
      if (payload && Object.prototype.hasOwnProperty.call(payload, "data")) return payload.data;
      last = "Unexpected Audius response";
    } catch (error) {
      last = message(error);
    }
  }
  throw new Error(last);
}

function licenseDecision(value) {
  const raw = String(value || "").trim();
  if (!raw) return { allowed: true, basis: "Audius Open Music License (default; no alternative license listed in track metadata)" };
  const n = raw.toLowerCase().replaceAll(" ", "").replaceAll("_", "-");
  if (n.includes("noncommercial") || n.includes("non-commercial") || n.includes("by-nc") || n.includes("ccby-nc")) return { allowed: false, basis: "Restricted license: " + raw };
  if (n.includes("allrightsreserved")) return { allowed: false, basis: "All rights reserved" };
  if (n === "oml" || n.includes("openmusiclicense") || n.includes("cc0") || n.includes("publicdomain") || n.includes("public-domain")) return { allowed: true, basis: raw };
  if (n.includes("creativecommons.org/licenses/by-sa/") || n.includes("cc-by-sa") || n.includes("ccby-sa")) return { allowed: true, basis: raw + " (retain attribution and share-alike terms; audio is unchanged)" };
  if (n.includes("creativecommons.org/licenses/by-nd/") || n.includes("cc-by-nd") || n.includes("ccby-nd")) return { allowed: true, basis: raw + " (unchanged audio only; no derivatives)" };
  if (n.includes("creativecommons.org/licenses/by/") || n.includes("cc-by") || n.includes("ccby") || n.includes("attribution")) return { allowed: true, basis: raw + " (attribution required)" };
  return { allowed: false, basis: "Unrecognized alternative license: " + raw };
}

function eligible(track) {
  const license = licenseDecision(track.license);
  return track.is_downloadable === true &&
    track.is_download_gated !== true &&
    track.is_stream_gated !== true &&
    license.allowed;
}

function readPrefix(response, limit = 4096) {
  if (!response.body) return Promise.resolve(Buffer.alloc(0));
  const reader = response.body.getReader();
  return reader.read().then(async part => {
    const value = part.value ? Buffer.from(part.value) : Buffer.alloc(0);
    await reader.cancel().catch(() => undefined);
    return value.subarray(0, limit);
  }).catch(() => Buffer.alloc(0));
}

async function readLimited(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_AUDIO_BYTES) throw new Error("Audio file exceeds 25 MB test limit");
  if (!response.body) throw new Error("Audio response has no body");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    if (!part.value) continue;
    total += part.value.byteLength;
    if (total > MAX_AUDIO_BYTES) {
      await reader.cancel();
      throw new Error("Audio file exceeds 25 MB test limit");
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks.map(part => Buffer.from(part)), total);
}

function detectFormat(buffer, mime = "", filename = "") {
  const first = buffer.subarray(0, 16).toString("ascii");
  const type = mime.toLowerCase().split(";")[0].trim();
  if (first.startsWith("RIFF") && first.slice(8, 12) === "WAVE") return { ext: "wav", mime: "audio/wav" };
  if (first.startsWith("fLaC")) return { ext: "flac", mime: "audio/flac" };
  if (first.startsWith("OggS")) return { ext: "ogg", mime: "audio/ogg" };
  if (first.slice(4, 8) === "ftyp") return { ext: "m4a", mime: "audio/mp4" };
  if (first.startsWith("ID3")) return { ext: "mp3", mime: "audio/mpeg" };
  const end = Math.min(buffer.length - 1, 4096);
  for (let i = 0; i < end; i += 1) {
    if (buffer[i] === 255 && (buffer[i + 1] & 224) === 224) return { ext: "mp3", mime: "audio/mpeg" };
  }
  if (type === "audio/mpeg" || type === "audio/mp3") return { ext: "mp3", mime: "audio/mpeg" };
  if (type === "audio/wav" || type === "audio/x-wav" || type === "audio/wave") return { ext: "wav", mime: "audio/wav" };
  if (type === "audio/flac" || type === "audio/x-flac") return { ext: "flac", mime: "audio/flac" };
  if (type === "audio/mp4" || type === "audio/aac") return { ext: "m4a", mime: "audio/mp4" };
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
  if (["mp3", "wav", "flac", "m4a", "mp4"].includes(ext)) {
    if (ext === "mp3") return { ext: "mp3", mime: "audio/mpeg" };
    if (ext === "wav") return { ext: "wav", mime: "audio/wav" };
    if (ext === "flac") return { ext: "flac", mime: "audio/flac" };
    return { ext: "m4a", mime: "audio/mp4" };
  }
  return null;
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

function safeName(value) {
  const cleaned = String(value || "").split("").map(char => /[a-zA-Z0-9._-]/.test(char) ? char : "-").join("");
  return cleaned.replaceAll("--", "-").slice(0, 120) || "audio";
}

function slug(value) {
  const cleaned = String(value || "").toLowerCase().split("").map(char => /[a-z0-9]/.test(char) ? char : "-").join("");
  return cleaned.replace(/^-+|-+$/g, "").slice(0, 80) || "track";
}

function extOf(value) {
  const dot = String(value || "").lastIndexOf(".");
  return dot >= 0 ? String(value).slice(dot + 1).toLowerCase() : "";
}

async function downloadAudio(track) {
  const id = encodeURIComponent(String(track.id));
  const endpoints = track.is_original_available === true
    ? [
        { path: "/download?original=true&app_name=ASRRecords", originalRequested: true },
        { path: "/stream?app_name=ASRRecords", originalRequested: false },
        { path: "/download?original=false&app_name=ASRRecords", originalRequested: false },
        { path: "/download?app_name=ASRRecords", originalRequested: false }
      ]
    : [
        { path: "/stream?app_name=ASRRecords", originalRequested: false },
        { path: "/download?app_name=ASRRecords", originalRequested: false },
        { path: "/download?original=false&app_name=ASRRecords", originalRequested: false }
      ];
  let last = "No downloadable audio returned";
  for (const base of BASES) {
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(base + "/tracks/" + id + endpoint.path, {
          redirect: "follow",
          cache: "no-store",
          headers: { Accept: "audio/*,application/octet-stream", "User-Agent": "ASRRecords/0.4" },
          signal: AbortSignal.timeout(25000)
        });
        if (!response.ok) {
          last = "Audius audio endpoint HTTP " + response.status;
          continue;
        }
        const bytes = await readLimited(response);
        const format = detectFormat(bytes, response.headers.get("content-type") || "", String(track.orig_filename || ""));
        if (!format) {
          last = "Downloaded file was not recognized as WAV, MP3, FLAC, OGG, or M4A";
          continue;
        }
        const originalExt = extOf(track.orig_filename);
        return {
          bytes,
          format,
          isOriginal: track.is_original_available === true && endpoint.originalRequested && (!originalExt || originalExt === format.ext)
        };
      } catch (error) {
        last = message(error);
      }
    }
  }
  throw new Error(last);
}

function normalizeSourceUrl(permalink, id) {
  if (permalink && String(permalink).startsWith("http")) return String(permalink);
  if (permalink) return "https://audius.co" + (String(permalink).startsWith("/") ? String(permalink) : "/" + String(permalink));
  return "https://audius.co";
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vmaovbkustmdmecpqpms.supabase.co";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.asrmedia;
  if (!supabaseKey) throw new Error("ASR storage key is missing");
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "asr-media";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const previous = await prisma.audiusImport.findFirst({ where: { status: "STAGED" }, orderBy: { createdAt: "desc" } });
    if (previous) {
      console.log("ASR_AUDIUS_IMPORT_RESULT=" + JSON.stringify({
        ok: true, duplicate: true, importId: previous.id, title: previous.title, artistName: previous.artistName,
        contentType: previous.contentType, fileSizeBytes: previous.fileSizeBytes, sha256: previous.sha256,
        status: previous.status, note: "A staged Audius import already exists; did not create another."
      }));
      return;
    }

    const candidates = new Map();
    for (const query of queries) {
      const path = "/tracks/search?query=" + encodeURIComponent(query) + "&limit=20&gate_condition=ungated&app_name=ASRRecords";
      let data = [];
      try {
        const found = await audiusJson(path);
        data = Array.isArray(found) ? found : [];
      } catch (error) {
        console.log("[ASR Audius smoke] search skipped for query " + query + ": " + message(error));
      }
      for (const track of data) {
        if (!track || !track.id || candidates.has(String(track.id))) continue;
        if (eligible(track)) candidates.set(String(track.id), track);
      }
      if (candidates.size >= 20) break;
    }

    const ordered = Array.from(candidates.values()).sort((a, b) => Number(a.duration || 9999) - Number(b.duration || 9999));
    if (!ordered.length) throw new Error("No ungated, downloadable Audius track with an allowed license was found across " + queries.length + " searches");

    const failures = [];
    for (const candidate of ordered.slice(0, 20)) {
      let objectKey = "";
      let uploaded = false;
      let createdId = "";
      try {
        const raw = await audiusJson("/tracks/" + encodeURIComponent(String(candidate.id)) + "?app_name=ASRRecords");
        const track = Array.isArray(raw) ? raw[0] : raw;
        if (!track || !eligible(track)) {
          failures.push(String(candidate.id) + ": track details failed license/download checks");
          continue;
        }
        const already = await prisma.audiusImport.findUnique({ where: { providerTrackId: String(track.id) } });
        if (already) {
          failures.push(String(candidate.id) + ": already imported");
          continue;
        }

        const decision = licenseDecision(track.license);
        const downloaded = await downloadAudio(track);
        const originalFilename = String(track.orig_filename || "");
        const filename = safeName(extOf(originalFilename) === downloaded.format.ext ? originalFilename : slug(track.title) + "." + downloaded.format.ext);
        objectKey = "external/audius/" + String(track.id) + "/" + filename;
        const upload = await supabase.storage.from(bucketName).upload(objectKey, downloaded.bytes, {
          contentType: downloaded.format.mime,
          cacheControl: "31536000",
          upsert: true
        });
        if (upload.error) throw new Error("Supabase upload failed: " + upload.error.message);
        uploaded = true;

        const artistName = track.user?.name || track.user?.handle ||
          (Array.isArray(track.artists) ? track.artists.map(artist => artist.name).filter(Boolean).join(", ") : "") || "Unknown artist";
        const sourceUrl = normalizeSourceUrl(track.permalink, track.id);
        const attributionText = artistName + " — " + String(track.title || "Untitled") + ". " + decision.basis + ". Source: " + sourceUrl + ".";
        const sha256 = createHash("sha256").update(downloaded.bytes).digest("hex");
        const record = await prisma.audiusImport.create({
          data: {
            providerTrackId: String(track.id),
            title: String(track.title || "Untitled"),
            artistName,
            sourceUrl,
            sourceLicense: track.license || null,
            licenseBasis: decision.basis,
            attributionText,
            originalFilename: originalFilename || null,
            audioObjectKey: objectKey,
            fileName: filename,
            contentType: downloaded.format.mime,
            fileSizeBytes: downloaded.bytes.byteLength,
            durationSeconds: Number.isFinite(Number(track.duration)) ? Math.floor(Number(track.duration)) : null,
            isOriginal: downloaded.isOriginal,
            isDownloadable: true,
            isOriginalAvailable: track.is_original_available === true,
            sha256,
            status: "STAGED"
          }
        });
        createdId = record.id;

        const signed = await supabase.storage.from(bucketName).createSignedUrl(objectKey, 120);
        if (signed.error || !signed.data?.signedUrl) throw new Error("Could not sign uploaded audio for verification");
        const verification = await fetch(signed.data.signedUrl, {
          headers: { Range: "bytes=0-4095" },
          cache: "no-store",
          signal: AbortSignal.timeout(15000)
        });
        if (!verification.ok && verification.status !== 206) throw new Error("Stored file verification returned HTTP " + verification.status);
        const prefix = await readPrefix(verification);
        if (!audioSignature(prefix)) throw new Error("Stored file failed audio signature verification");

        console.log("ASR_AUDIUS_IMPORT_RESULT=" + JSON.stringify({
          ok: true,
          importId: record.id,
          status: record.status,
          providerTrackId: record.providerTrackId,
          title: record.title,
          artistName: record.artistName,
          sourceUrl: record.sourceUrl,
          sourceLicense: record.sourceLicense,
          licenseBasis: record.licenseBasis,
          attributionText: record.attributionText,
          fileName: record.fileName,
          contentType: record.contentType,
          fileSizeBytes: record.fileSizeBytes,
          isOriginal: record.isOriginal,
          isOriginalAvailable: record.isOriginalAvailable,
          sha256: record.sha256,
          storageUploadVerified: true,
          storedAudioHeaderVerified: true
        }));
        return;
      } catch (error) {
        failures.push(String(candidate.id) + ": " + message(error));
        if (createdId) await prisma.audiusImport.delete({ where: { id: createdId } }).catch(() => undefined);
        if (uploaded && objectKey) await supabase.storage.from(bucketName).remove([objectKey]).catch(() => undefined);
      }
    }
    throw new Error("Audius candidates were found but none completed import. Attempts: " + failures.join(" | "));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error("ASR_AUDIUS_IMPORT_FAILED=" + message(error));
  process.exitCode = 1;
});
