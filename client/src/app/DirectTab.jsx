// ============================================================
// File:        DirectTab.jsx
// Path:        client/src/app/DirectTab.jsx
// Project:     Seasonal Entertainment
// Description: The Direct tab's content in the chat drawer and on the full chat page: the
//              chat module's direct-message view once the member's key is unlocked on this
//              device, else "Unlock private messages" (keys/). Rooms never need unlocking.
// ============================================================

import { DirectPanel } from '../chat/index.js';
import { useKeys } from '../keys/KeyContext.jsx';
import UnlockPanel from '../keys/UnlockPanel.jsx';

export default function DirectTab({ variant }) {
  const keys = useKeys();
  if (keys.status === 'loading') return <p>Checking…</p>;
  if (keys.status !== 'unlocked') return <UnlockPanel />;
  return <DirectPanel keyId={keys.keyId} privateKey={keys.privateKey} variant={variant} />;
}
