const ASAP_SHIMMY_APPLE_ARTIST_URL = 'https://music.apple.com/us/artist/asap-shimmy/1557124466';

type ItunesSearchItem = {
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
};

function resizeAppleArtwork(url: string, size: number) {
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/i, `/${size}x${size}bb.$1`);
}

export async function getCactusArtwork(size = 1200): Promise<string | null> {
  try {
    const response = await fetch(
      'https://itunes.apple.com/search?term=ASAP%20Shimmy%20Cactus&entity=album&country=us&limit=25',
      { next: { revalidate: 86400 } }
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as { results?: ItunesSearchItem[] };
    const item = payload.results?.find(result =>
      result.artistName?.toLowerCase() === 'asap shimmy' &&
      result.collectionName?.toLowerCase() === 'cactus' &&
      result.artworkUrl100
    ) || payload.results?.find(result => result.artworkUrl100);

    return item?.artworkUrl100 ? resizeAppleArtwork(item.artworkUrl100, size) : null;
  } catch {
    return null;
  }
}

export async function getAsapShimmyArtistArtwork(size = 1200): Promise<string | null> {
  try {
    const response = await fetch(ASAP_SHIMMY_APPLE_ARTIST_URL, {
      next: { revalidate: 86400 },
    });

    if (response.ok) {
      const html = await response.text();
      const match =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

      if (match?.[1]) {
        return resizeAppleArtwork(match[1].replace(/&amp;/g, '&'), size);
      }
    }
  } catch {
    // Fall back to the release artwork below.
  }

  return getCactusArtwork(size);
}
