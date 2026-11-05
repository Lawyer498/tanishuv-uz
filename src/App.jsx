import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? '';

async function authenticate(initData) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Kirish amalga oshmadi.');
  return result;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('topish');
  const [admin, setAdmin] = useState(null);
  const [adText, setAdText] = useState('');
  const [adTimes, setAdTimes] = useState('11:00,19:00');
  const [adEnabled, setAdEnabled] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    webApp?.ready();
    webApp?.expand();
    if (!webApp?.initData) {
      setError('Ilovani bot ichidagi “Tanishuv UZ ni ochish” tugmasi orqali oching.');
      return;
    }
    if (!API_URL) {
      setError('Serverga ulanish hali sozlanmagan. Backend ulangach, Mini App to‘liq ishlaydi.');
      return;
    }
    authenticate(webApp.initData)
      .then(setSession)
      .catch((authError) => setError(authError.message));
  }, []);

  useEffect(() => {
    if (!session?.user?.isAdmin || tab !== 'admin') return;
    fetch(`${API_URL}/api/admin/settings`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Admin sozlamalari yuklanmadi.');
        return data;
      })
      .then((data) => {
        setAdmin(data);
        setAdEnabled(data.settings.adEnabled);
        setAdText(data.settings.adText);
        setAdTimes(data.settings.adTimes);
      })
      .catch((loadError) => setNotice(loadError.message));
  }, [session, tab]);

  async function saveAds(event) {
    event.preventDefault();
    setNotice('');
    const response = await fetch(`${API_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ adEnabled, adText, adTimes }),
    });
    const result = await response.json();
    setNotice(response.ok ? 'Reklama sozlamalari saqlandi.' : `Xatolik: ${result.error}`);
  }

  if (error) return (
    <main className="center-screen">
      <div className="brand-mark">T</div>
      <h1>Tanishuv UZ</h1>
      <p>{error}</p>
    </main>
  );
  if (!session) return <main className="center-screen"><div className="spinner" /><p>Yuklanmoqda…</p></main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">T</div><span>Tanishuv <b>UZ</b></span></div>
        <span className="online-dot">O‘zbekiston bo‘ylab</span>
      </header>

      {tab === 'admin' && session.user.isAdmin ? (
        <section className="panel">
          <p className="eyebrow">FAQAT ADMIN UCHUN</p>
          <h1>Boshqaruv paneli</h1>
          <p className="muted">Maxfiy sozlamalar oddiy foydalanuvchilarga berilmaydi.</p>
          <div className="secret-status">
            <div><span>Bot tokeni</span><strong>{admin?.settings.botTokenConfigured ? 'Serverda sozlangan · yashirin' : 'Sozlanmagan'}</strong></div>
            <div><span>Admin ID ro‘yxati</span><strong>{admin?.settings.adminIdsConfigured ? 'Serverda sozlangan · yashirin' : 'Sozlanmagan'}</strong></div>
          </div>
          <h2>Guruh reklamalari</h2>
          <p className="muted">Faqat <code>/ads_on</code> bilan rozilik bergan guruh va kanallarga.</p>
          <form onSubmit={saveAds} className="admin-form">
            <label className="switch-row">
              <span>Reklamalarni yoqish</span>
              <input type="checkbox" checked={adEnabled} onChange={(event) => setAdEnabled(event.target.checked)} />
            </label>
            <label>Reklama matni<textarea value={adText} onChange={(event) => setAdText(event.target.value)} maxLength={1000} required /></label>
            <label>Vaqtlar (Toshkent, HH:mm; ko‘pi bilan 2 ta)
              <input value={adTimes} onChange={(event) => setAdTimes(event.target.value)} pattern="([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9])?" required />
            </label>
            <button className="primary-button">Saqlash</button>
          </form>
          <p className="notice" role="status">{notice}</p>
          <h2>Rozilik bergan guruhlar</h2>
          {!admin?.groups?.length ? <p className="muted">Hozircha guruhlar ulanmagan.</p> : admin.groups.map((group) => (
            <div className="group-row" key={group.chat_id}><span>{group.title || group.chat_id}</span><b>{group.enabled ? 'Yoqilgan' : 'O‘chirilgan'}</b></div>
          ))}
        </section>
      ) : (
        <section className="hero">
          <div className="hero-copy">
            <span className="pill">YANGI TANISUVLAR</span>
            <h1>Yaqin insoningiz<br /><span>shu yerda.</span></h1>
            <p>O‘zbekiston bo‘ylab o‘zingizga yaqin joydan samimiy suhbatdosh toping.</p>
            <button className="primary-button" onClick={() => setTab('anketa')}>Boshlash <span>→</span></button>
          </div>
          <div className="discover-card">
            <div className="card-glow">✦</div>
            <div className="avatar">♡</div>
            <div className="card-caption"><span>Yangi tanishuvlar sizni kutmoqda</span><b>18+ · Hurmat · Samimiyat</b></div>
          </div>
          {tab === 'anketa' && <div className="notice-box">Anketani to‘ldirish va tanishuvlar funksiyasi backend hamda ma’lumotlar bazasi sozlangach ishga tushadi.</div>}
        </section>
      )}

      <nav className="bottom-nav" aria-label="Asosiy menyu">
        {[
          ['topish', '⌕', 'Topish'],
          ['yoqtirishlar', '♡', 'Like’lar'],
          ['chatlar', '◌', 'Chatlar'],
          ['profil', '◉', 'Profil'],
          ...(session.user.isAdmin ? [['admin', '⚙', 'Admin']] : []),
        ].map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'nav-item active' : 'nav-item'} onClick={() => setTab(id)}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </nav>
    </main>
  );
}
