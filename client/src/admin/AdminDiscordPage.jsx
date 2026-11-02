// ============================================================
// File:        AdminDiscordPage.jsx
// Path:        client/src/admin/AdminDiscordPage.jsx
// Project:     Seasonal Entertainment
// Description: Admin → Discord steps (docs/AUTH.md, "Discord: steps"; shown while Discord login
//              is set up): the three ladders, each highest step first, every step a row
//              (StepRow.jsx: icon, name, Discord role id, order, remove); "Add a step" at the
//              top of a ladder; and the role ids seen on linked members that no step has yet,
//              with how many carry each, to fill the ids in (Discord: Developer Mode, then
//              right-click the role and "Copy Role ID"). Steps never grant rights on the site.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import StepRow from './StepRow.jsx';

const LADDER_NAMES = { holder: 'Holder', farmer: 'Farmer', investor: 'Investor' };

export default function AdminDiscordPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api('/admin/discord')
      .then(setData)
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

  // by: 1 one step higher, -1 one lower (the server keeps the order lowest first).
  function move(step, by) {
    const ids = data.steps.filter((s) => s.ladder === step.ladder).map((s) => s.id);
    const at = ids.indexOf(step.id);
    [ids[at], ids[at + by]] = [ids[at + by], ids[at]];
    run(() =>
      api(`/admin/discord/ladders/${step.ladder}/order`, { method: 'POST', body: { ids } })
    );
  }

  function add(event, ladder) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = new FormData(form).get('name');
    run(async () => {
      await api('/admin/discord/steps', { method: 'POST', body: { ladder, name, roleId: null } });
      form.reset();
    });
  }

  if (!data) return <FormMessage error={error} />;
  return (
    <>
      <h2>Discord steps</h2>
      <p>
        Members who link Discord show their highest step of each ladder next to their name. Give
        every step the Discord role id that grants it: in Discord, turn on Developer Mode, then
        right-click the role and choose “Copy Role ID”. Icons: PNG, WebP or SVG, at most 256 KB;
        they are shown at 16 px. Steps never give rights on this site.
      </p>
      <FormMessage error={error} />
      {data.ladders.map((ladder) => {
        const steps = data.steps.filter((s) => s.ladder === ladder);
        return (
          <section key={ladder} aria-labelledby={`ladder-${ladder}`}>
            <h3 id={`ladder-${ladder}`}>{LADDER_NAMES[ladder]}</h3>
            <ul className="step-ladder">
              {[...steps].reverse().map((step) => (
                <StepRow
                  key={step.id}
                  step={step}
                  first={step.id === steps[0].id}
                  last={step.id === steps.at(-1).id}
                  run={run}
                  move={move}
                />
              ))}
            </ul>
            <form className="step-row__fields" onSubmit={(event) => add(event, ladder)}>
              <input
                name="name"
                aria-label={`New ${LADDER_NAMES[ladder]} step`}
                placeholder="New step name"
                maxLength={40}
                required
              />
              <button className="button button--secondary" type="submit">
                Add a step
              </button>
            </form>
          </section>
        );
      })}
      <h3>Role ids without a step</h3>
      {data.unmapped.length === 0 ? (
        <p>None: every role id seen on linked members has a step, or none was seen yet.</p>
      ) : (
        <ul>
          {data.unmapped.map(({ roleId, members }) => (
            <li key={roleId}>
              <code>{roleId}</code> — {members} {members === 1 ? 'member' : 'members'}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
