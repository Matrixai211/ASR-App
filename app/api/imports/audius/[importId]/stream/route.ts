import { createHash, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "../../../../../../lib/auth";
import { prisma } from "../../../../../../lib/prisma";
import { supabaseAdmin, supabaseBucket } from "../../../../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function hasRunnerToken(request: Request) {
  const expected = process.env.ASR_IMPORT_RUNNER_TOKEN || "";
  const provided = new URL(request.url).searchParams.get("runnerToken") || "";
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function isAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = (session?.user as { role?: string } | undefined)?.role || "";
  return Boolean(session?.user && ["ADMIN", "MODERATOR"].includes(role));
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

function signatureLooksAudio(buffer: Buffer) {
  const first = buffer.subarray(0, 16).toString("ascii");
  if (first.startsWith("RIFF") && first.slice(8, 12) === "WAVE") return true;
  if (first.startsWith("fLaC") || first.startsWith("OggS") || first.startsWith("ID3")) return true;
  if (first.slice(4, 8) === "ftyp") return true;
  const searchLength = Math.min(buffer.length - 1, 4096);
  for (let index = 0; index < searchLength; index += 1) {
    if (buffer[index] === 255 && (buffer[index + 1] & 224) === 224) return true;
  }
  return false;
}

export async function GET(request: Request, context: { params: Promise<{ importId: string }> }) {
  try {
    if (!hasRunnerToken(request) && !(await isAdmin())) {
      return NextResponse.json({ error: "Admin or moderator access required" }, { status: 401 });
    }
    const { importId } = await context.params;
    const imported = await prisma.audiusImport.findUnique({ where: { id: importId } });
    if (!imported || imported.status !== "STAGED") {
      return NextResponse.json({ error: "Staged import not found" }, { status: 404 });
    }
    const url = new URL(request.url);
    if (imported.storageBackend === "NEON_BYTEA") {
      const bytes = imported.audioData ? Buffer.from(imported.audioData) : null;
      if (!bytes?.byteLength) return NextResponse.json({ error: "Staged database audio bytes are missing" }, { status: 503 });
      const signatureVerified = signatureLooksAudio(bytes.subarray(0, 4096));
      const hashVerified = createHash("sha256").update(bytes).digest("hex") === imported.sha256;
      if (url.searchParams.get("probe") === "1") {
        return NextResponse.json({
          ok: signatureVerified && hashVerified,
          importId: imported.id,
          status: imported.status,
          title: imported.title,
          artistName: imported.artistName,
          storageBackend: imported.storageBackend,
          storedContentType: imported.contentType,
          storedBytes: bytes.byteLength,
          sampleBytesRead: Math.min(bytes.byteLength, 4096),
          sampleHeaderHex: bytes.subarray(0, 16).toString("hex"),
          audioSignatureVerified: signatureVerified,
          sha256Verified: hashVerified,
          sha256: imported.sha256,
          playbackRoute: "/api/imports/audius/" + imported.id + "/stream",
        }, { status: signatureVerified && hashVerified ? 200 : 502 });
      }

      let start = 0;
      let end = bytes.byteLength - 1;
      let status = 200;
      const range = request.headers.get("range");
      if (range) {
        if (!range.startsWith("bytes=")) {
          return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + bytes.byteLength } });
        }
        const parts = range.slice(6).split("-");
        if (parts.length !== 2) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + bytes.byteLength } });
        if (parts[0] === "") {
          const suffix = Number(parts[1]);
          if (!Number.isInteger(suffix) || suffix <= 0) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + bytes.byteLength } });
          start = Math.max(0, bytes.byteLength - suffix);
          end = bytes.byteLength - 1;
        } else {
          start = Number(parts[0]);
          end = parts[1] ? Number(parts[1]) : bytes.byteLength - 1;
        }
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= bytes.byteLength) {
          return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + bytes.byteLength } });
        }
        end = Math.min(end, bytes.byteLength - 1);
        status = 206;
      }
      const body = bytes.subarray(start, end + 1);
      const responseHeaders = new Headers();
      responseHeaders.set("Content-Type", imported.contentType);
      responseHeaders.set("Content-Disposition", 'inline; filename="' + imported.fileName.replaceAll('"', '') + '"');
      responseHeaders.set("Accept-Ranges", "bytes");
      responseHeaders.set("Cache-Control", "private, max-age=60");
      responseHeaders.set("Content-Length", String(body.byteLength));
      if (status === 206) responseHeaders.set("Content-Range", "bytes " + start + "-" + end + "/" + bytes.byteLength);
      return new Response(body, { status, headers: responseHeaders });
    }

    if (!imported.audioObjectKey) return NextResponse.json({ error: "Staged storage object key is missing" }, { status: 503 });
    const storage = supabaseAdmin().storage.from(supabaseBucket);
    const signed = await storage.createSignedUrl(imported.audioObjectKey, 120);
    if (signed.error || !signed.data?.signedUrl) {
      return NextResponse.json({ error: "ASR storage could not sign the stored audio" }, { status: 503 });
    }

    if (url.searchParams.get("probe") === "1") {
      const upstream = await fetch(signed.data.signedUrl, {
        headers: { Range: "bytes=0-4095" },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok && upstream.status !== 206) {
        return NextResponse.json({ error: "Stored audio returned HTTP " + upstream.status }, { status: 502 });
      }
      const prefix = await readPrefix(upstream, 4096);
      const signatureVerified = signatureLooksAudio(prefix);
      return NextResponse.json({
        ok: signatureVerified,
        importId: imported.id,
        status: imported.status,
        title: imported.title,
        artistName: imported.artistName,
        storageBackend: imported.storageBackend,
        storageHttpStatus: upstream.status,
        storedContentType: imported.contentType,
        storedBytes: imported.fileSizeBytes,
        sampleBytesRead: prefix.length,
        sampleHeaderHex: prefix.subarray(0, 16).toString("hex"),
        audioSignatureVerified: signatureVerified,
        sha256: imported.sha256,
        playbackRoute: "/api/imports/audius/" + imported.id + "/stream",
      }, { status: signatureVerified ? 200 : 502 });
    }

    const range = request.headers.get("range");
    const upstream = await fetch(signed.data.signedUrl, {
      headers: range ? { Range: range } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json({ error: "ASR stored audio returned HTTP " + upstream.status }, { status: 502 });
    }
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", imported.contentType);
    responseHeaders.set("Content-Disposition", 'inline; filename="' + imported.fileName.replaceAll('"', '') + '"');
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "private, max-age=60");
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);
    if (contentRange) responseHeaders.set("Content-Range", contentRange);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
