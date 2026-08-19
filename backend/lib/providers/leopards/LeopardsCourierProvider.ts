import type {
  CancelShipmentInput,
  CourierProvider,
  CreateShipmentInput,
  CreateShipmentResult,
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
 * Skeleton Leopards Courier provider. No live courier calls are made in
 * Phase 1 — every method throws IntegrationNotConfiguredError. Real
 * implementation lands in Phase 11.
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
    throw new IntegrationNotConfiguredError(this.name, 'createShipment is not implemented until Phase 11.')
  }

  async trackShipment(_input: TrackShipmentInput): Promise<TrackShipmentResult> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(this.name, 'trackShipment is not implemented until Phase 11.')
  }

  async cancelShipment(_input: CancelShipmentInput): Promise<void> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(this.name, 'cancelShipment is not implemented until Phase 11.')
  }
}
