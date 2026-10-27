const APPLE_LOOKUP = 'https://itunes.apple.com/lookup?id=1708032597&entity=song&country=in';

export async function GET() {
  try {
    const lookup = await fetch(APPLE_LOOKUP, {
      headers: { 'User-Agent': 'ASR Records artwork service' },
      next: { revalidate: 86400 },
    });
    if (!lookup.ok) {
      return new Response('Official Cactus artwork lookup failed', { status: 502 });
    }

    const data = await lookup.json() as {
      results?: Array<{ wrapperType?: string; artworkUrl100?: string; artworkUrl60?: string }>;
    };
    const album = data.results?.find(item => item.wrapperType === 'collection' && item.artworkUrl100)
      || data.results?.find(item => item.artworkUrl100);
    const original = album?.artworkUrl100 || album?.artworkUrl60;
    if (!original) return new Response('Official Cactus artwork was not found', { status: 404 });

    const imageUrl = original.replace(/\/\d+x\d+bb\.(jpg|png)$/i, '/1200x1200bb.$1');
    const image = await fetch(imageUrl, {
      headers: { 'User-Agent': 'ASR Records artwork service' },
      next: { revalidate: 86400 },
    });
    if (!image.ok) return new Response('Official Cactus image could not be loaded', { status: 502 });

    return new Response(await image.arrayBuffer(), {
      headers: {
        'Content-Type': image.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Official Cactus artwork is temporarily unavailable', { status: 502 });
  }
}
