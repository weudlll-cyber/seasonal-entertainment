// ============================================================
// File:        Markdown.test.jsx
// Path:        client/src/components/Markdown.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards safe Markdown rendering: raw HTML (a <script>, an <img onerror>) never
//              becomes an element, javascript: links lose their target, normal Markdown and
//              external links work.
// ============================================================

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Markdown from './Markdown.jsx';

describe('Markdown', () => {
  it('renders HTML in the text inert', () => {
    const { container } = render(
      <Markdown
        text={'Hi <script>window.hacked = 1</script> there\n\n<img src=x onerror="alert(1)">'}
      />
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(window.hacked).toBeUndefined();
  });

  it('removes javascript: link targets', () => {
    render(<Markdown text="[click](javascript:alert(1))" />);
    expect(screen.getByText('click').getAttribute('href') ?? '').not.toMatch(/javascript/i);
  });

  it('renders Markdown, and opens external links in a new tab without opener', () => {
    render(<Markdown text={'## Title\n\n**bold** and [site](https://seasonaltokens.org/)'} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Title');
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    const link = screen.getByRole('link', { name: 'site' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
