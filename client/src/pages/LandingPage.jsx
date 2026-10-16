// ============================================================
// File:        LandingPage.jsx
// Path:        client/src/pages/LandingPage.jsx
// Project:     Seasonal Entertainment
// Description: The landing page: logo, title, one sentence and the four season marks.
// ============================================================

import logo from '../assets/seasonal-entertainment.jpg';
import springMark from '../assets/seasons/spring.svg';
import summerMark from '../assets/seasons/summer.svg';
import autumnMark from '../assets/seasons/autumn.svg';
import winterMark from '../assets/seasons/winter.svg';
import './LandingPage.css';

// Calendar order; `id` picks the season colour token in LandingPage.css.
const SEASONS = [
  { id: 'spring', name: 'Spring', mark: springMark },
  { id: 'summer', name: 'Summer', mark: summerMark },
  { id: 'autumn', name: 'Autumn', mark: autumnMark },
  { id: 'winter', name: 'Winter', mark: winterMark },
];

export default function LandingPage() {
  return (
    <main className="landing">
      <img
        className="landing__logo"
        src={logo}
        alt="Seasonal Entertainment logo"
        width="1024"
        height="1024"
      />
      <h1 className="landing__title">Seasonal Entertainment</h1>
      <p className="landing__lead">Games, community and everything around Seasonal Tokens.</p>
      <ul className="landing__seasons" aria-label="The four seasons">
        {SEASONS.map((season) => (
          <li key={season.id} className={`landing__season landing__season--${season.id}`}>
            <img src={season.mark} alt={`${season.name} season mark`} width="96" height="96" />
          </li>
        ))}
      </ul>
    </main>
  );
}
