/**
 * Thrown by any external-provider skeleton (ERP, payment, courier) when it
 * is called before real credentials/config exist for it. Providers must
 * NEVER return a fake success response (e.g. `{ paymentSuccessful: true }`)
 * — they must fail loudly and clearly so calling code cannot mistake an
 * unconfigured integration for a working one.
 */
export class IntegrationNotConfiguredError extends Error {
  readonly provider: string

  constructor(provider: string, detail?: string) {
    super(`${provider} integration is not configured.${detail ? ` ${detail}` : ''}`)
    this.name = 'IntegrationNotConfiguredError'
    this.provider = provider
  }
}
