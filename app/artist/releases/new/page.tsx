import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../../../../lib/auth';
import ArtistReleaseStudio from '../../../../components/ArtistReleaseStudio';

export default async function NewReleasePage() {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    redirect('/auth');
  }
  if (!session) redirect('/auth');
  const role = (session.user as { role?: string }).role;
  if (!['ARTIST', 'ADMIN', 'MODERATOR'].includes(role || '')) redirect('/');

  return <ArtistReleaseStudio />;
}
