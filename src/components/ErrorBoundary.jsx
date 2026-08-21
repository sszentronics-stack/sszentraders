import { Component } from 'react'

/**
 * Phase 16 — production hardening. Without this, any uncaught render error
 * anywhere in the tree unmounts the whole app to a blank white page (React's
 * default). This catches it, shows a recoverable message in the existing
 * visual language, and logs the error for diagnosis instead of losing the
 * customer silently.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // No error-tracking service is wired up in this environment (no Sentry/etc
    // credentials) — console is the honest fallback rather than silently
    // swallowing the error.
    console.error('Unhandled UI error:', error, info)
  }

  handleReload = () => {
    this.setState({ hasError: false })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container-aura py-20 text-center">
          <h1 className="text-3xl font-medium mb-4">Something went wrong</h1>
          <p className="text-ink-soft mb-8 max-w-md mx-auto">
            We hit an unexpected error loading this page. Please try again, or head back to the homepage.
          </p>
          <button type="button" className="btn-lavender inline-block w-auto px-8" onClick={this.handleReload}>
            Back to home
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
