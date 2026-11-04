export interface ApiClientConfig {
  baseUrl: string;
  getIdToken?: () => Promise<string | null>;
}

export interface StandardApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Shared typed HTTP client used by the authenticated VeerXcape web and mobile applications.
 * Automatically attaches the user's current Firebase ID Token when present.
 */
export class VeerXcapeApiClient {
  private readonly baseUrl: string;
  private readonly getIdToken?: () => Promise<string | null>;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.getIdToken = config.getIdToken;
  }

  async request<T = unknown>(
    path: string,
    options: RequestInit = {}
  ): Promise<StandardApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {})
    };

    if (this.getIdToken) {
      const token = await this.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const url = path.startsWith('http')
      ? path
      : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });
      const json = (await response.json().catch(() => ({}))) as StandardApiResponse<T>;
      if (!response.ok) {
        return {
          success: false,
          error: json.error ?? {
            code: `HTTP_${response.status}`,
            message: response.statusText || 'Request failed'
          }
        };
      }
      return json;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error';
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message
        }
      };
    }
  }
}

