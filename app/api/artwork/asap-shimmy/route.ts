const ARTIST_IMAGE = 'https://is1-ssl.mzstatic.com/image/thumb/AMCArtistImages221/v4/ea/f5/56/eaf556c4-9b3a-4c0f-5272-9ab9d1183079/file_cropped.png/1200x630cw.png';

export async function GET() {
  try {
    const image = await fetch(ARTIST_IMAGE, {
      headers: { 'User-Agent': 'ASR Records artwork service' },
      next: { revalidate: 86400 },
    });
    if (!image.ok) return new Response('Official ASAP Shimmy artist image unavailable', { status: 502 });

    return new Response(await image.arrayBuffer(), {
      headers: {
        'Content-Type': image.headers.get('content-type') || 'image/png',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Official ASAP Shimmy artist image temporarily unavailable', { status: 502 });
  }
}
