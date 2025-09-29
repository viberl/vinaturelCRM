import axios, { AxiosInstance } from 'axios'

interface AdminTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
  refresh_token?: string
  scope?: string
}

interface CachedToken {
  accessToken: string
  expiresAt: number
}

export interface ShopwareCustomer {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  company: string | null
  customerNumber?: string | null
  groupId?: string | null
  group?: {
    id: string
    name: string | null
  } | null
  defaultBillingAddress?: {
    id?: string
    street?: string | null
    zipcode?: string | null
    city?: string | null
    phoneNumber?: string | null
    country?: {
      name: string | null
    } | null
    customFields?: Record<string, unknown> | null
    latitude?: number | string | null
    longitude?: number | string | null
  } | null
  defaultShippingAddress?: {
    id?: string
    street?: string | null
    zipcode?: string | null
    city?: string | null
    phoneNumber?: string | null
    country?: {
      name: string | null
    } | null
    customFields?: Record<string, unknown> | null
    latitude?: number | string | null
    longitude?: number | string | null
  } | null
  customFields?: Record<string, unknown> | null
  salesRepresentative?: {
    id: string
    email: string | null
    firstName: string | null
    lastName: string | null
  } | null
  updatedAt: string
  createdAt?: string
  orderCount?: number | null
  orderTotalAmount?: number | null
}

export class ShopwareClient {
  private readonly baseUrl: string
  private readonly clientId: string
  private readonly clientSecret: string
  private readonly scope: string
  private cachedToken: CachedToken | null = null
  private inflightTokenRequest: Promise<string> | null = null

  constructor(baseURL: string, clientId: string, clientSecret: string, scope: string = 'write') {
    this.baseUrl = baseURL.replace(/\/$/, '')
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.scope = scope
  }

  private async requestAdminToken(): Promise<string> {
    const url = `${this.baseUrl}/api/oauth/token`
    const response = await axios.post<AdminTokenResponse>(
      url,
      {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
        scope: this.scope
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      }
    )

    if (!response.data.access_token) {
      throw new Error('Shopware Admin API did not return an access_token')
    }

    const expiresIn = response.data.expires_in ?? 600
    const expiresAt = Date.now() + expiresIn * 1000 - 60_000 // 60s leeway
    this.cachedToken = {
      accessToken: response.data.access_token,
      expiresAt
    }

    return this.cachedToken.accessToken
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.accessToken
    }

    if (!this.inflightTokenRequest) {
      this.inflightTokenRequest = this.requestAdminToken()
        .finally(() => {
          this.inflightTokenRequest = null
        })
    }

    return this.inflightTokenRequest
  }

  private async getAxios(): Promise<AxiosInstance> {
    const token = await this.getAccessToken()
    return axios.create({
      baseURL: `${this.baseUrl}/api`,
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    })
  }

  async fetchCustomers(updatedAfter?: Date): Promise<ShopwareCustomer[]> {
    const client = await this.getAxios()

    const filter: Array<Record<string, unknown>> = []
    if (updatedAfter) {
      filter.push({
        type: 'range',
        field: 'updatedAt',
        parameters: {
          gte: updatedAfter.toISOString()
        }
      })
    }

    const payload: Record<string, unknown> = {
      'total-count-mode': 1,
      limit: 500,
      includes: {
        customer: [
          'id',
          'email',
          'firstName',
          'lastName',
          'company',
          'active',
          'customerNumber',
          'groupId',
          'group',
          'updatedAt',
          'createdAt',
          'orderCount',
          'orderTotalAmount',
          'defaultBillingAddressId',
          'defaultShippingAddressId',
          'customFields'
        ],
        customer_address: [
          'id',
          'firstName',
          'lastName',
          'street',
          'zipcode',
          'city',
          'phoneNumber',
          'latitude',
          'longitude',
          'customFields'
        ],
        country: ['id', 'name'],
        customer_group: ['id', 'name'],
        sales_channel: ['id', 'name']
      },
      associations: {
        defaultBillingAddress: {
          associations: {
            country: {}
          }
        },
        defaultShippingAddress: {
          associations: {
            country: {}
          }
        },
        group: {}
      },
      sort: [
        {
          field: 'updatedAt',
          order: 'DESC'
        }
      ]
    }

    if (filter.length > 0) {
      Object.assign(payload, { filter })
    }

    try {
      const response = await client.post<{ data: ShopwareCustomer[] }>('/search/customer', payload)
      return response.data?.data ?? []
    } catch (error) {
      console.error('Error fetching customers from Shopware Admin API:', error)
      throw new Error(`Failed to fetch customers: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
