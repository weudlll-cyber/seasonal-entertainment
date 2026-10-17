// ============================================================
// File:        KeyContext.jsx
// Path:        client/src/keys/KeyContext.jsx
// Project:     Seasonal Entertainment
// Description: The signed-in member's key state for the whole page: whether private messages
//              are unlocked on this device (the private key in memory, and a protected copy in
//              IndexedDB, deviceKey.js), locked (the password unlocks it), or broken (the
//              password no longer opens it: recovery code or start over). Logging out deletes
//              the device copy. Also whether to offer a recovery code right after a new key
//              pair was made (asked once, never again automatically).
// ============================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from '../session/SessionContext.jsx';
import { clearDeviceKey, loadDeviceKey, saveDeviceKey } from './deviceKey.js';
import * as actions from './keyActions.js';

const KeyContext = createContext(null);
const NONE = { status: 'none', keyId: null, privateKey: null, hasRecovery: false };

// The account's key and this device's copy: unlocked only when both agree.
async function loadState(forUser) {
  const key = await actions.fetchKey();
  const device = key && (await loadDeviceKey(forUser));
  const hasRecovery = Boolean(key?.recovery);
  if (device && device.keyId === key.keyId) {
    return { ...NONE, status: 'unlocked', ...device, hasRecovery, forUser };
  }
  return { ...NONE, status: 'locked', hasRecovery, forUser };
}

// status: 'none' (guest), 'loading', 'locked', 'broken' or 'unlocked'. The stored state names
// the account it belongs to (forUser): for any other account it does not count, so a logout
// or a switch never shows the previous member's key.
export function KeyProvider({ children }) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  // undefined while the session is still loading: that is not a logout.
  const guest = user === null;
  const [stored, setStored] = useState({ ...NONE, forUser: null });
  const [offerFor, setOfferFor] = useState(null);
  const set = (forUser, next) => setStored({ ...NONE, ...next, forUser });

  useEffect(() => {
    // Logged out (or the session ended): no key material stays on this device.
    if (guest) {
      clearDeviceKey();
      return;
    }
    if (userId === null) return;
    loadState(userId)
      .then(setStored)
      .catch(() => setStored({ ...NONE, status: 'locked', forUser: userId }));
  }, [guest, userId]);

  // A private key is open: keep it here and on this device.
  const unlocked = useCallback(async (forUser, { keyId, privateKey }, hasRecovery) => {
    await saveDeviceKey(forUser, keyId, privateKey);
    set(forUser, { status: 'unlocked', keyId, privateKey, hasRecovery });
  }, []);

  // passwordKeys: { authKey, wrapKey } from a password just typed (session/credentials.js).
  // forUser: the account, given by the login page before the session knows it.
  const openWithPassword = useCallback(
    async (passwordKeys, forUser = userId) => {
      const result = await actions.openWithPassword(passwordKeys);
      if (result.status === 'broken') {
        set(forUser, { status: 'broken', hasRecovery: result.hasRecovery });
      } else {
        await unlocked(forUser, result, result.hasRecovery);
        if (result.created) setOfferFor(forUser);
      }
      return result;
    },
    [userId, unlocked]
  );

  const value = useMemo(() => {
    const state =
      userId === null ? NONE : stored.forUser === userId ? stored : { ...NONE, status: 'loading' };
    return {
      status: state.status,
      keyId: state.keyId,
      privateKey: state.privateKey,
      hasRecovery: state.hasRecovery,
      offerRecovery: userId !== null && offerFor === userId,
      dismissRecoveryOffer: () => setOfferFor(null),
      openWithPassword,
      async recover(code, passwordKeys) {
        const result = await actions.recoverWithCode(code, passwordKeys);
        if (result) await unlocked(userId, result, true);
        return Boolean(result);
      },
      async startOver(passwordKeys) {
        await unlocked(userId, await actions.startOver(passwordKeys), false);
        setOfferFor(userId);
      },
      async createRecoveryCode() {
        const code = await actions.createRecoveryCode(state.privateKey);
        setStored((s) => ({ ...s, hasRecovery: true }));
        return code;
      },
      async removeRecoveryCode() {
        await actions.removeRecoveryCode();
        setStored((s) => ({ ...s, hasRecovery: false }));
      },
    };
  }, [stored, userId, offerFor, openWithPassword, unlocked]);
  return <KeyContext.Provider value={value}>{children}</KeyContext.Provider>;
}

export function useKeys() {
  const value = useContext(KeyContext);
  if (!value) throw new Error('useKeys must be used inside KeyProvider');
  return value;
}
