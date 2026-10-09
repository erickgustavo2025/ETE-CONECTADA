'use client';

import { useState } from 'react';
import Image from 'next/image';
import styles from './portal-home.module.css';

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try { await fetch('/api/logout', { method: 'POST' }); }
    finally { window.location.replace('/login'); }
  }
  return <button className={styles.logoutButton} type="button" onClick={logout} disabled={busy}><Image src="/icons/logout.png" alt="" width={800} height={800}/>{busy ? 'Saindo…' : 'Sair'}</button>;
}
