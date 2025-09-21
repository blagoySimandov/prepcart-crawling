import fetch from "node-fetch";

export interface WebshareProxy {
  id: string;
  username: string;
  password: string;
  proxy_address: string;
  port: number;
  valid: boolean;
  last_verification: string;
  country_code: string;
  city_name: string;
  created_at: string;
}

export interface WebshareProxyListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: WebshareProxy[];
}

export class WebshareProxyService {
  private apiToken: string;
  private baseUrl = "https://proxy.webshare.io/api/v2";

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async getBulgarianProxies(
    mode: "direct" | "backbone" = "direct",
  ): Promise<WebshareProxy[]> {
    const url = `${this.baseUrl}/proxy/list/?mode=${mode}&country_code__in=BG&page_size=100`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Token ${this.apiToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Webshare API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as WebshareProxyListResponse;

      // Filter for valid Bulgarian proxies only
      const validProxies = data.results.filter(
        (proxy) => proxy.valid && proxy.country_code === "BG",
      );

      console.log(
        ` Found ${validProxies.length} valid Bulgarian proxies from Webshare`,
      );
      return validProxies;
    } catch (error) {
      console.error("Failed to fetch Bulgarian proxies from Webshare:", error);
      throw error;
    }
  }

  getRandomBulgarianProxy(proxies: WebshareProxy[]): WebshareProxy | null {
    if (proxies.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * proxies.length);
    return proxies[randomIndex];
  }

  formatProxyUrl(proxy: WebshareProxy): string {
    return `http://${proxy.username}:${proxy.password}@${proxy.proxy_address}:${proxy.port}`;
  }
}
