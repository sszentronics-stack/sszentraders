import type {
  BookReturnPickupInput,
  BookReturnPickupResult,
  CancelShipmentInput,
  CourierProvider,
  CreateShipmentInput,
  CreateShipmentResult,
  RequestPickupInput,
  RequestPickupResult,
  TrackShipmentInput,
  TrackShipmentResult,
} from '../CourierProvider'
import { IntegrationNotConfiguredError } from '../errors'

export interface LeopardsConfig {
  apiKey: string
  apiPassword: string
  apiBaseUrl: string
}

/**
 * Leopards Courier provider — Phase 11. No real Leopards API
 * documentation/credentials exist in this project, so per the project's
 * "do not invent external API behaviour/endpoints/credentials" rule, EVERY
 * method here throws IntegrationNotConfiguredError and never fabricates a
 * successful booking/AWB/tracking result, regardless of whether `config` is
 * present. `assertConfigured()` distinguishes "no secrets set at all" from
 * "secrets are set but the real HTTP integration still isn't written" only
 * in the error detail message — both paths reject, never resolve.
 *
 * The surrounding architecture (shipment/AWB record model, booking request
 * shape, tracking sync framework, status normalization layer, admin
 * reconciliation queries) is real and lives in
 * backend/services/delivery/leopards/ — only the actual HTTP calls to
 * Leopards are stubbed here, because we have no field names/endpoints to
 * call correctly.
 */
export class LeopardsCourierProvider implements CourierProvider {
  readonly name = 'Leopards Courier'

  constructor(private readonly config: LeopardsConfig | null) {}

  private assertConfigured(): void {
    if (!this.config || !this.config.apiKey || !this.config.apiPassword || !this.config.apiBaseUrl) {
      throw new IntegrationNotConfiguredError(
        this.name,
        'Set LEOPARDS_API_KEY, LEOPARDS_API_PASSWORD, and LEOPARDS_API_BASE_URL in the Edge Function environment.',
      )
    }
  }

  async createShipment(_input: CreateShipmentInput): Promise<CreateShipmentResult> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(
      this.name,
      'createShipment has no real Leopards API contract to call against yet (booking endpoint/fields unconfirmed).',
    )
  }

  async trackShipment(_input: TrackShipmentInput): Promise<TrackShipmentResult> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(
      this.name,
      'trackShipment has no real Leopards API contract to call against yet (tracking endpoint/fields unconfirmed).',
    )
  }

  async cancelShipment(_input: CancelShipmentInput): Promise<void> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(
      this.name,
      'cancelShipment has no real Leopards API contract to call against yet — cutoff-window rules also unconfirmed.',
    )
  }

  async requestPickup(_input: RequestPickupInput): Promise<RequestPickupResult> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(
      this.name,
      'requestPickup has no real Leopards API contract to call against yet — whether pickup is separate from booking is unconfirmed.',
    )
  }

  async bookReturnPickup(_input: BookReturnPickupInput): Promise<BookReturnPickupResult> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(
      this.name,
      'bookReturnPickup has no real Leopards API contract to call against yet (return/reverse-logistics endpoint unconfirmed).',
    )
  }
}
