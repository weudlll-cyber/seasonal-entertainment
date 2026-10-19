// ============================================================
// File:        EmbedDirect.jsx
// Path:        client/src/embed/EmbedDirect.jsx
// Project:     Seasonal Entertainment
// Description: The Direct tab of the chat embedded on an approved foreign site: the chat
//              module's direct-message view with the key the login popup unlocked (memory
//              only). Without it (left locked, or the page was reloaded) the popup unlocks it
//              again: the password is never typed into another site's page.
// ============================================================

import { DirectPanel } from '../chat/index.js';
import { useKeys } from '../keys/KeyContext.jsx';

// onUnlock: opens the login popup again.
export default function EmbedDirect({ onUnlock }) {
  const keys = useKeys();
  if (keys.status === 'unlocked') {
    return <DirectPanel keyId={keys.keyId} privateKey={keys.privateKey} variant="compact" />;
  }
  return (
    <div className="form">
      <p>Your private messages are locked on this page.</p>
      <button type="button" className="button" onClick={onUnlock}>
        Unlock in a login window
      </button>
    </div>
  );
}
