// ============================================================
// File:        AdminChatMediaPage.jsx
// Path:        client/src/admin/AdminChatMediaPage.jsx
// Project:     Seasonal Entertainment
// Description: Admin "Chat media" page: the site's own sticker and GIF library (no outside
//              GIF service, decided 2026-10-17). Create packs, then rename, (de)activate,
//              reorder them and manage their items (MediaPackSection). Limits are shown here;
//              the server enforces them.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import MediaPackSection from './MediaPackSection.jsx';

export default function AdminChatMediaPage() {
  const [packs, setPacks] = useState([]);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api('/admin/chat/media')
      .then((data) => setPacks(data.packs))
      .catch((err) => setError(err.message));
  }, [version]);

  async function run(call) {
    setError(null);
    try {
      await call();
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  function move(index, step) {
    const ids = packs.map((p) => p.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    run(() => api('/admin/chat/media/packs/reorder', { method: 'POST', body: { ids } }));
  }

  function createPack(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    run(async () => {
      await api('/admin/chat/media/packs', {
        method: 'POST',
        body: { name: data.get('name'), kind: data.get('kind') },
      });
      form.reset();
    });
  }

  return (
    <>
      <h2>Chat media</h2>
      <p>
        Stickers: WebP or PNG, at most 512 KB and 1024 px per side. GIFs: GIF or animated WebP, at
        most 3 MB and 640 px per side. Members send them; guests cannot.
      </p>
      <FormMessage error={error} />
      <form className="admin-row-actions" onSubmit={createPack}>
        <input name="name" aria-label="New pack name" placeholder="New pack name" required />
        <select name="kind" aria-label="New pack kind" defaultValue="sticker">
          <option value="sticker">Stickers</option>
          <option value="gif">GIFs</option>
        </select>
        <button className="button" type="submit">
          Add pack
        </button>
      </form>
      {packs.map((pack, index) => (
        <MediaPackSection
          key={`${pack.id}-${version}`}
          pack={pack}
          isFirst={index === 0}
          isLast={index === packs.length - 1}
          onMove={(step) => move(index, step)}
          onRun={run}
        />
      ))}
    </>
  );
}
