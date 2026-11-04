// ============================================================
// File:        deleteCall.js
// Path:        client/src/calls/deleteCall.js
// Project:     Seasonal Entertainment
// Description: "Delete call" for admins on an ended call (docs/CALLS.md, "Deleting a call"), the
//              same on the calls list (CallCard.jsx) and the call's page (CallPage.jsx): the
//              browser's confirmation names the call and says its chat and recordings go too
//              (as account and media deletions ask, admin/UserRow.jsx), then DELETE /api/calls/:id.
// ============================================================

import { api } from '../api/http.js';

export const deleteCallQuestion = (call) =>
  `Delete the call "${call.title}" completely? Its chat and its recordings are deleted too, ` +
  'and nothing of it can be restored.';

// true when the call was deleted; false when the admin said no. Throws ApiError when the server
// refuses (e.g. not ended).
export async function confirmAndDeleteCall(call) {
  if (!window.confirm(deleteCallQuestion(call))) return false;
  await api(`/calls/${call.id}`, { method: 'DELETE' });
  return true;
}
