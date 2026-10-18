// ============================================================
// File:        Markdown.jsx
// Path:        client/src/components/Markdown.jsx
// Project:     Seasonal Entertainment
// Description: Renders user-written Markdown safely, for public pages and the editor preview
//              alike. react-markdown builds React elements and never renders raw HTML: a
//              <script> in the text stays inert text, and unsafe link targets (javascript:)
//              are removed by its default URL filter. Links to other sites open in a new tab.
// ============================================================

import ReactMarkdown from 'react-markdown';

function SafeLink({ href, children }) {
  const external = /^https?:\/\//.test(href ?? '');
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <a href={href}>{children}</a>
  );
}

export default function Markdown({ text }) {
  return (
    <div className="markdown">
      <ReactMarkdown components={{ a: SafeLink }} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}
