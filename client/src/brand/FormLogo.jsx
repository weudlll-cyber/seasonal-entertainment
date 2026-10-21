// ============================================================
// File:        FormLogo.jsx
// Path:        client/src/brand/FormLogo.jsx
// Project:     Seasonal Entertainment
// Description: The logo at the top of the login and registration cards (docs/DESIGN.md): the
//              full logo with its lettering in light mode, the emblem in dark mode (the dark
//              lettering would vanish on night blue). Which one shows is CSS (forms.css); the
//              hidden one is lazy, so it is not even loaded.
// ============================================================

import { EMBLEM, LOGO } from './brand.js';

export default function FormLogo() {
  return (
    <>
      <img
        className="form-logo form-logo--light"
        src={LOGO}
        alt=""
        width="160"
        height="168"
        loading="lazy"
      />
      <img
        className="form-logo form-logo--dark"
        src={EMBLEM}
        alt=""
        width="160"
        height="143"
        loading="lazy"
      />
    </>
  );
}
