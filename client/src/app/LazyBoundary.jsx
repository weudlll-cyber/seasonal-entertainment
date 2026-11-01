// ============================================================
// File:        LazyBoundary.jsx
// Path:        client/src/app/LazyBoundary.jsx
// Project:     Seasonal Entertainment
// Description: Where a page part loaded on first use (lazyPage, staleChunks.js) is shown: a
//              Suspense boundary (nothing shows for the moment it loads) and an error boundary.
//              A part that could not be loaded even after the reload for an update shows a
//              plain message with a Reload button in the warning banner style, not a blank
//              page. Another page (resetKey, the path) clears the message.
// ============================================================

import { Component, Suspense } from 'react';
import './SiteBanner.css';

export default class LazyBoundary extends Component {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="banner site-banner site-banner--warning" role="alert">
          <span>This part of the page could not be loaded.</span>
          <button
            type="button"
            className="button button--primary"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </p>
      );
    }
    return <Suspense>{this.props.children}</Suspense>;
  }
}
