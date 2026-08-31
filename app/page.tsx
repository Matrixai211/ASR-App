const links = [
  ['Listen', '/listen'],
  ['Search', '/search'],
  ['Library', '/library'],
  ['Store', '/store'],
  ['Admin', '/admin'],
];

export default function HomePage() {
  return (
    <main style={{ minHeight: '100vh', background: 'radial-gradient(circle at top right, #24130a 0%, #090909 38%, #050505 100%)' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px clamp(20px, 5vw, 72px)', borderBottom: '1px solid #242424' }}>
        <a href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 900, letterSpacing: '-0.05em', fontSize: 30 }}>ASR<span style={{ color: '#ff6a00' }}>.</span></a>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
          {links.map(([label, href]) => <a key={href} href={href} style={{ color: '#cfcfcf', textDecoration: 'none', fontSize: 14 }}>{label}</a>)}
        </div>
      </nav>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(72px, 12vw, 150px) clamp(20px, 5vw, 48px) 72px' }}>
        <div style={{ color: '#ff7a1a', fontWeight: 800, fontSize: 13, letterSpacing: '.22em', marginBottom: 18 }}>AFRICAN SOUND. INDEPENDENT RELEASES.</div>
        <h1 style={{ margin: 0, maxWidth: 900, fontSize: 'clamp(54px, 10vw, 124px)', lineHeight: .88, letterSpacing: '-.07em' }}>Music moves different here.</h1>
        <p style={{ maxWidth: 680, marginTop: 30, color: '#b8b8b8', fontSize: 'clamp(18px, 2vw, 23px)', lineHeight: 1.5 }}>ASR brings discovery, artist releases, streaming, exclusives and merchandise into one platform built around African music and independent artists.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 34 }}>
          <a href="/listen" style={{ background: '#fff', color: '#090909', textDecoration: 'none', padding: '15px 22px', borderRadius: 999, fontWeight: 800 }}>Start listening</a>
          <a href="/store" style={{ color: '#fff', textDecoration: 'none', padding: '14px 22px', borderRadius: 999, border: '1px solid #444', fontWeight: 700 }}>Explore the store</a>
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '0 clamp(20px, 5vw, 48px) 90px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {[
          ['LISTEN', 'Discover releases, independent artists and new sounds.', '/listen'],
          ['SEARCH', 'Find artists, songs and releases across ASR.', '/search'],
          ['LIBRARY', 'Your saved music and personal collection.', '/library'],
          ['STORE', 'Music, artist merchandise and platform exclusives.', '/store'],
        ].map(([title, copy, href]) => (
          <a key={title} href={href} style={{ minHeight: 190, padding: 24, border: '1px solid #292929', borderRadius: 22, textDecoration: 'none', color: '#fff', background: '#101010' }}>
            <div style={{ fontSize: 12, letterSpacing: '.18em', color: '#ff7a1a', fontWeight: 800 }}>{title}</div>
            <p style={{ color: '#bdbdbd', lineHeight: 1.5, marginTop: 72 }}>{copy}</p>
          </a>
        ))}
      </section>
    </main>
  );
}
