import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { supabaseAdmin, supabaseBucket } from "../../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const AUDIUS_BASES = ["https://api.audius.co/v1", "https://discoveryprovider.audius.co/v1"];
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

type AudiusTrack = any;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function isAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = (session?.user as { role?: string } | undefined)?.role || "";
  return Boolean(session?.user && ["ADMIN", "MODERATOR"].includes(role));
}

async function audiusJson(path: string): Promise<any> {
  let lastError = "Audius API unavailable";
  for (const base of AUDIUS_BASES) {
    try {
      const response = await fetch(base + path, {
        cache: "no-store",
        headers: { Accept: "application/json", "User-Agent": "ASRRecords/0.4" },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        lastError = "Audius returned HTTP " + response.status;
        continue;
      }
      const payload = await response.json();
      if (payload && Object.prototype.hasOwnProperty.call(payload, "data")) return payload.data;
      lastError = "Audius returned an unexpected response";
    } catch (error) {
      lastError = errorMessage(error);
    }
  }
  throw new Error(lastError);
}

function licenseDecision(rawValue: unknown) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return {
      allowed: true,
      basis: "Audius Open Music License (default; no alternative license listed in track metadata)",
    };
  }
  const normalized = raw.toLowerCase().replaceAll(" ", "").replaceAll("_", "-");
  if (normalized.includes("noncommercial") || normalized.includes("non-commercial") || normalized.includes("by-nc") || normalized.includes("ccby-nc")) {
    return { allowed: false, basis: "Restricted alternative license: " + raw };
  }
  if (normalized === "oml" || normalized.includes("openmusiclicense")) {
    return { allowed: true, basis: raw };
  }
  if (normalized.includes("cc0") || normalized.includes("publicdomain") || normalized.includes("public-domain")) {
    return { allowed: true, basis: raw };
  }
  if (normalized.includes("creativecommons.org/licenses/by-sa/") || normalized.includes("cc-by-sa") || normalized.includes("ccby-sa")) {
    return { allowed: true, basis: raw + " (retain attribution and share-alike terms; audio is not modified)" };
  }
  if (normalized.includes("creativecommons.org/licenses/by-nd/") || normalized.includes("cc-by-nd") || normalized.includes("ccby-nd")) {
    return { allowed: true, basis: raw + " (unchanged audio only; no derivatives)" };
  }
  if (normalized.includes("creativecommons.org/licenses/by/") || normalized.includes("cc-by") || normalized.includes("ccby") || normalized.includes("attribution")) {
    return { allowed: true, basis: raw + " (attribution required)" };
  }
  return { allowed: false, basis: "Unrecognized alternative license: " + raw };
}

function summarizeTrack(track: AudiusTrack) {
  const license = licenseDecision(track.license);
  const reasons: string[] = [];
  if (track.is_downloadable !== true) reasons.push("Audius does not mark this track downloadable");
  if (track.is_download_gated === true) reasons.push("Download is gated");
  if (track.is_stream_gated === true) reasons.push("Stream is gated");
  if (!license.allowed) reasons.push("Alternative license was not cleared for ASR streaming");
  const artistName =
    track.user?.name ||
    track.user?.handle ||
    (Array.isArray(track.artists) ? track.artists.map((artist: any) => artist.name).filter(Boolean).join(", ") : "") ||
    "Unknown artist";
  return {
    id: String(track.id || ""),
    title: String(track.title || "Untitled"),
    artistName,
    sourceUrl: track.permalink ? (String(track.permalink).startsWith("http") ? track.permalink : "https://audius.co" + (String(track.permalink).startsWith("/") ? track.permalink : "/" + track.permalink)) : null,
    sourceLicense: track.license || null,
    licenseBasis: license.basis,
    durationSeconds: Number.isFinite(Number(track.duration)) ? Math.floor(Number(track.duration)) : null,
    isDownloadable: track.is_downloadable === true,
    isOriginalAvailable: track.is_original_available === true,
    isStreamable: track.is_streamable === true,
    isDownloadGated: track.is_download_gated === true,
    isStreamGated: track.is_stream_gated === true,
    artworkUrl: track.artwork?.["480x480"] || track.artwork?.["150x150"] || track.artwork?.["1000x1000"] || null,
    eligible: reasons.length === 0,
    reasons,
  };
}

async function readLimited(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_AUDIO_BYTES) throw new Error("Audio file exceeds the 25 MB import test limit");
  if (!response.body) throw new Error("Audius download had no response body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    if (!part.value) continue;
    total += part.value.byteLength;
    if (total > MAX_AUDIO_BYTES) {
      await reader.cancel();
      throw new Error("Audio file exceeds the 25 MB import test limit");
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

async function readPrefix(response: Response, limit = 4096) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  try {
    const part = await reader.read();
    const value = part.value ? Buffer.from(part.value) : Buffer.alloc(0);
    await reader.cancel();
    return value.subarray(0, limit);
  } catch {
    return Buffer.alloc(0);
  }
}

function detectAudioFormat(buffer: Buffer, contentType = "", fileName = "") {
  const first = buffer.subarray(0, 16).toString("ascii");
  const mime = contentType.toLowerCase().split(";")[0].trim();
  if (first.startsWith("RIFF") && first.slice(8, 12) === "WAVE") return { ext: "wav", contentType: "audio/wav" };
  if (first.startsWith("fLaC")) return { ext: "flac", contentType: "audio/flac" };
  if (first.startsWith("OggS")) return { ext: "ogg", contentType: "audio/ogg" };
  if (first.slice(4, 8) === "ftyp") return { ext: "m4a", contentType: "audio/mp4" };
  if (first.startsWith("ID3")) return { ext: "mp3", contentType: "audio/mpeg" };
  const searchLength = Math.min(buffer.length - 1, 4096);
  for (let index = 0; index < searchLength; index += 1) {
    if (buffer[index] === 255 && (buffer[index + 1] & 224) === 224) {
      return { ext: "mp3", contentType: "audio/mpeg" };
    }
  }
  if (mime === "audio/mpeg" || mime === "audio/mp3") return { ext: "mp3", contentType: "audio/mpeg" };
  if (mime === "audio/wav" || mime === "audio/x-wav" || mime === "audio/wave") return { ext: "wav", contentType: "audio/wav" };
  if (mime === "audio/flac" || mime === "audio/x-flac") return { ext: "flac", contentType: "audio/flac" };
  if (mime === "audio/mp4" || mime === "audio/aac") return { ext: "m4a", contentType: "audio/mp4" };
  const dot = fileName.lastIndexOf(".");
  const extension = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  if (extension === "wav") return { ext: "wav", contentType: "audio/wav" };
  if (extension === "flac") return { ext: "flac", contentType: "audio/flac" };
  if (extension === "mp3") return { ext: "mp3", contentType: "audio/mpeg" };
  if (extension === "m4a" || extension === "mp4") return { ext: "m4a", contentType: "audio/mp4" };
  return null;
}

function hasAudioSignature(buffer: Buffer) {
  const first = buffer.subarray(0, 16).toString("ascii");
  if (first.startsWith("RIFF") && first.slice(8, 12) === "WAVE") return true;
  if (first.startsWith("fLaC") || first.startsWith("OggS") || first.startsWith("ID3") || first.slice(4, 8) === "ftyp") return true;
  const searchLength = Math.min(buffer.length - 1, 4096);
  for (let index = 0; index < searchLength; index += 1) {
    if (buffer[index] === 255 && (buffer[index + 1] & 224) === 224) return true;
  }
  return false;
}

function safeFileName(value: string) {
  const cleaned = value.split("").map((char) => /[a-zA-Z0-9._-]/.test(char) ? char : "-").join("");
  return cleaned.replaceAll("--", "-").slice(0, 120) || "audio";
}

function slug(value: string) {
  const cleaned = value.toLowerCase().split("").map((char) => /[a-z0-9]/.test(char) ? char : "-").join("");
  return cleaned.replaceAll("--", "-").replaceAll("--", "-").replaceAll("-", "-").replace(/^-+|-+$/g, "").slice(0, 80) || "track";
}

function extensionOf(value: string) {
  const dot = value.lastIndexOf(".");
  return dot >= 0 ? value.slice(dot + 1).toLowerCase() : "";
}

async function downloadAudio(track: AudiusTrack) {
  const id = encodeURIComponent(String(track.id));
  const originalAvailable = track.is_original_available === true;
  const endpoints = originalAvailable
    ? [
        { path: "/download?original=true&app_name=ASRRecords", originalRequested: true },
        { path: "/stream?app_name=ASRRecords", originalRequested: false },
        { path: "/download?original=false&app_name=ASRRecords", originalRequested: false },
        { path: "/download?app_name=ASRRecords", originalRequested: false },
      ]
    : [
        { path: "/stream?app_name=ASRRecords", originalRequested: false },
        { path: "/download?app_name=ASRRecords", originalRequested: false },
        { path: "/download?original=false&app_name=ASRRecords", originalRequested: false },
      ];
  let lastError = "No downloadable audio file was returned";
  for (const base of AUDIUS_BASES) {
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(base + "/tracks/" + id + endpoint.path, {
          redirect: "follow",
          cache: "no-store",
          headers: { Accept: "audio/*,application/octet-stream", "User-Agent": "ASRRecords/0.4" },
          signal: AbortSignal.timeout(25000),
        });
        if (!response.ok) {
          lastError = "Audius audio endpoint returned HTTP " + response.status;
          continue;
        }
        const bytes = await readLimited(response);
        const mime = response.headers.get("content-type") || "";
        const detected = detectAudioFormat(bytes, mime, String(track.orig_filename || ""));
        if (!detected) {
          lastError = "Downloaded response was not a recognized WAV, MP3, FLAC, or M4A audio file";
          continue;
        }
        const originalExt = extensionOf(String(track.orig_filename || ""));
        const isOriginal = originalAvailable && endpoint.originalRequested && (!originalExt || originalExt === detected.ext);
        return { bytes, format: detected, isOriginal, responseContentType: mime };
      } catch (error) {
        lastError = errorMessage(error);
      }
    }
  }
  throw new Error(lastError);
}

async function importTrack(trackId: string) {
  if (!trackId || trackId.length > 200) throw new Error("A valid Audius track ID is required");
  const rawTrack = await audiusJson("/tracks/" + encodeURIComponent(trackId) + "?app_name=ASRRecords");
  const track = Array.isArray(rawTrack) ? rawTrack[0] : rawTrack;
  if (!track || !track.id) throw new Error("Audius track was not found");
  const summary = summarizeTrack(track);
  if (!summary.eligible) throw new Error("Track is not eligible for import: " + summary.reasons.join("; "));

  const existing = await prisma.audiusImport.findUnique({ where: { providerTrackId: String(track.id) } });
  if (existing) {
    return {
      ok: true,
      duplicate: true,
      importId: existing.id,
      status: existing.status,
      title: existing.title,
      artistName: existing.artistName,
      contentType: existing.contentType,
      fileSizeBytes: existing.fileSizeBytes,
      storageBackend: existing.storageBackend,
      storageNote: existing.storageNote,
      sha256: existing.sha256,
      licenseBasis: existing.licenseBasis,
      attributionText: existing.attributionText,
      playbackUrl: "/api/imports/audius/" + existing.id + "/stream",
    };
  }

  const downloaded = await downloadAudio(track);
  const originalFilename = String(track.orig_filename || "");
  const sourceFileName = extensionOf(originalFilename) === downloaded.format.ext
    ? originalFilename
    : slug(String(track.title || "track")) + "." + downloaded.format.ext;
  const fileName = safeFileName(sourceFileName);
  const objectKey = "external/audius/" + String(track.id) + "/" + fileName;
  const artistName = summary.artistName;
  const sourceUrl = summary.sourceUrl;
  const attributionText = artistName + " — " + summary.title + ". " + summary.licenseBasis + ". Source: " + (sourceUrl || "Audius track " + String(track.id)) + ".";
  const sha256 = createHash("sha256").update(downloaded.bytes).digest("hex");
  let uploaded = false;
  let createdId = "";
  let storageBackend = "SUPABASE";
  let storageNote: string | null = null;
  try {
    let storage: any = null;
    try {
      storage = supabaseAdmin().storage.from(supabaseBucket);
      const upload = await storage.upload(objectKey, downloaded.bytes, {
        contentType: downloaded.format.contentType,
        cacheControl: "31536000",
        upsert: false,
      });
      if (upload.error) throw new Error(upload.error.message);
      uploaded = true;
    } catch (storageError) {
      storageBackend = "NEON_BYTEA";
      storageNote = errorMessage(storageError);
      if (storage) await storage.remove([objectKey]).catch(() => undefined);
    }

    const record = await prisma.audiusImport.create({
      data: {
        providerTrackId: String(track.id),
        title: summary.title,
        artistName,
        sourceUrl,
        sourceLicense: summary.sourceLicense,
        licenseBasis: summary.licenseBasis,
        attributionText,
        originalFilename: originalFilename || null,
        audioObjectKey: storageBackend === "SUPABASE" ? objectKey : null,
        audioData: storageBackend === "NEON_BYTEA" ? downloaded.bytes : null,
        storageBackend,
        storageNote,
        fileName,
        contentType: downloaded.format.contentType,
        fileSizeBytes: downloaded.bytes.byteLength,
        durationSeconds: summary.durationSeconds,
        isOriginal: downloaded.isOriginal,
        isDownloadable: summary.isDownloadable,
        isOriginalAvailable: summary.isOriginalAvailable,
        sha256,
        status: "STAGED",
      },
    });
    createdId = record.id;

    if (storageBackend === "SUPABASE") {
      if (!storage) throw new Error("ASR storage client was unavailable after upload");
      const signed = await storage.createSignedUrl(objectKey, 120);
      if (signed.error || !signed.data?.signedUrl) throw new Error("ASR storage verification could not create a signed URL");
      const verification = await fetch(signed.data.signedUrl, {
        headers: { Range: "bytes=0-4095" },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!verification.ok && verification.status !== 206) throw new Error("ASR storage verification returned HTTP " + verification.status);
      const prefix = await readPrefix(verification, 4096);
      if (!hasAudioSignature(prefix)) throw new Error("Stored audio bytes failed signature verification");
    } else {
      const persisted = await prisma.audiusImport.findUnique({
        where: { id: record.id },
        select: { audioData: true, fileSizeBytes: true, sha256: true },
      });
      if (!persisted?.audioData) throw new Error("Neon audio fallback did not persist the audio bytes");
      const persistedBytes = Buffer.from(persisted.audioData);
      const persistedHash = createHash("sha256").update(persistedBytes).digest("hex");
      if (persistedBytes.byteLength !== record.fileSizeBytes || persistedHash !== record.sha256) {
        throw new Error("Neon audio fallback failed byte-count or SHA-256 verification");
      }
      if (!hasAudioSignature(persistedBytes.subarray(0, 4096))) throw new Error("Neon audio fallback failed signature verification");
    }

    return {
      ok: true,
      duplicate: false,
      importId: record.id,
      status: record.status,
      title: record.title,
      artistName: record.artistName,
      sourceUrl: record.sourceUrl,
      sourceLicense: record.sourceLicense,
      licenseBasis: record.licenseBasis,
      attributionText: record.attributionText,
      fileName: record.fileName,
      contentType: record.contentType,
      fileSizeBytes: record.fileSizeBytes,
      storageBackend: record.storageBackend,
      storageNote: record.storageNote,
      isOriginal: record.isOriginal,
      isOriginalAvailable: record.isOriginalAvailable,
      sha256: record.sha256,
      storageUploadVerified: true,
      storedAudioHeaderVerified: true,
      playbackUrl: "/api/imports/audius/" + record.id + "/stream",
    };
  } catch (error) {
    if (createdId) await prisma.audiusImport.delete({ where: { id: createdId } }).catch(() => undefined);
    if (uploaded) await supabaseAdmin().storage.from(supabaseBucket).remove([objectKey]).catch(() => undefined);
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: "Admin or moderator access required" }, { status: 401 });
    }
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "search";
    if (action === "import") return NextResponse.json({ error: "Use POST to import from an authenticated admin session" }, { status: 405 });
    if (action !== "search") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    const query = (url.searchParams.get("query") || "ambient instrumental").slice(0, 120);
    const requestedLimit = Number(url.searchParams.get("limit") || 12);
    const limit = Math.min(20, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 12));
    const data = await audiusJson("/tracks/search?query=" + encodeURIComponent(query) + "&limit=" + limit + "&gate_condition=ungated&app_name=ASRRecords");
    const tracks = Array.isArray(data) ? data : [];
    const results = tracks.map(summarizeTrack);
    return NextResponse.json({
      provider: "Audius",
      query,
      count: results.length,
      eligibleCount: results.filter((item: any) => item.eligible).length,
      results,
    });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("not eligible") || message.includes("not marked") || message.includes("gated") || message.includes("license") ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAdmin())) {
      const session = await auth.api.getSession({ headers: await headers() });
      return NextResponse.json({ error: session?.user ? "Admin or moderator role required" : "Sign in required" }, { status: session?.user ? 403 : 401 });
    }
    const body = await request.json() as { trackId?: string };
    const result = await importTrack(String(body.trackId || ""));
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("not eligible") || message.includes("not marked") || message.includes("gated") || message.includes("license") ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
