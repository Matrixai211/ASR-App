import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../../lib/auth';

const queues = ['Submitted releases', 'Rights review', 'Metadata corrections', 'Approved catalog'];

export default async function Admin() {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;

  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    redirect('/auth');
  }

  if (!session) redirect('/auth');

  const role = (session.user as { role?: string }).role;
  if (role !== 'ADMIN' && role !== 'MODERATOR') redirect('/');

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="/">ASR<span>.</span></a>
        <div><a href="/artist">Artist</a> · <a href="/listen">Listen</a></div>
      </nav>
      <section className="hero">
        <div className="eyebrow">OPERATIONS</div>
        <h1>Moderation console.</h1>
        <p>ASR release review, rights verification and catalog publishing workspace.</p>
      </section>
      <section className="grid">
        {queues.map((x, i) => (
          <article className="card" key={x}>
            <div className="tag">QUEUE 0{i + 1}</div>
            <h3>{x}</h3>
            <p>Secure production queue for authorized ASR operations staff.</p>
          </article>
        ))}
      </section>
    </main>
  );
}
