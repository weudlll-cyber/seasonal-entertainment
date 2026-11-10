// ============================================================
// File:        PollResults.jsx
// Path:        client/src/polls/PollResults.jsx
// Project:     Seasonal Entertainment
// Description: The results of one poll as the server shows them to this viewer (PollCard.jsx;
//              docs/POLLS.md): per answer its count, its share of the votes as a bar, and in a
//              poll that is not anonymous who chose it; the count of written answers ("other"
//              or free text), and for organisers and admins the texts themselves (with names
//              when not anonymous), to be weighed by hand.
// ============================================================

const percent = (count, total) => (total ? Math.round((count / total) * 100) : 0);

export default function PollResults({ poll }) {
  const { results, votes } = poll;
  const label = (id) => poll.options.find((o) => o.id === id)?.label;
  return (
    <div className="poll-results" aria-label={`Results: ${poll.question}`} role="group">
      {results.options.length > 0 && (
        <ul className="poll-results__options">
          {results.options.map((option) => (
            <li key={option.id}>
              <span className="poll-results__label">
                {label(option.id)}: {option.count} ({percent(option.count, votes)} %)
              </span>
              <span className="poll-results__bar" aria-hidden="true">
                <span style={{ width: `${percent(option.count, votes)}%` }} />
              </span>
              {option.voters?.length > 0 && (
                <span className="poll-results__voters">{option.voters.join(', ')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {(poll.kind === 'text' || poll.otherText) && (
        <p>
          {results.textCount} written {results.textCount === 1 ? 'answer' : 'answers'}
          {results.texts && results.texts.length > 0 && ' (only organisers and admins see them):'}
        </p>
      )}
      {results.texts?.length > 0 && (
        <ul className="poll-results__texts" aria-label="Written answers">
          {results.texts.map((t, i) => (
            <li key={i}>
              {t.text}
              {t.by && <span className="poll-results__by"> – {t.by}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
