// ============================================================
// File:        RoomStepRule.jsx
// Path:        client/src/admin/RoomStepRule.jsx
// Project:     Seasonal Entertainment
// Description: The room editor's Discord step rule (AdminChatPage.jsx; docs/CHAT.md, "Rooms for
//              Discord steps"): per ladder a choice "from <step> on" or none. The room is open to
//              anyone with any one of the chosen steps or a higher one in its ladder; with none
//              chosen it is open as its read and write levels say. Staff always get in.
// ============================================================

import { LADDERS, LADDER_NAMES } from '@seasonal-entertainment/shared/discordLadders.js';

// steps: every step (Admin → Discord steps, lowest first); value: the chosen step ids;
// onChange(ids); label: the room's name, for the fields' names.
export default function RoomStepRule({ steps, value, onChange, label }) {
  const chosen = (ladder) =>
    steps.find((s) => s.ladder === ladder && value.includes(s.id))?.id ?? '';
  function pick(ladder, id) {
    const others = value.filter((v) => steps.find((s) => s.id === v)?.ladder !== ladder);
    onChange(id ? [...others, Number(id)] : others);
  }
  return (
    <div className="room-step-rule">
      {LADDERS.map((ladder) => (
        <select
          key={ladder}
          aria-label={`${LADDER_NAMES[ladder]} step that opens ${label}`}
          value={chosen(ladder)}
          onChange={(e) => pick(ladder, e.target.value)}
        >
          <option value="">{LADDER_NAMES[ladder]}: not needed</option>
          {steps
            .filter((s) => s.ladder === ladder)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {LADDER_NAMES[ladder]} ≥ {s.name}
              </option>
            ))}
        </select>
      ))}
    </div>
  );
}
