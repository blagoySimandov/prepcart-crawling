import axios, { AxiosRequestConfig } from "axios";
import { parseNuxtData } from "parse-hydration-data";
import { ExtractedData } from "./types.js";
import {
  WebshareProxyService,
  WebshareProxy,
} from "../webshare-proxy-service.js";
import { HttpsProxyAgent } from "https-proxy-agent";
import { randomDelay } from "../util.js";

export class GlovoFetcher {
  private proxyService: WebshareProxyService;
  private bulgarianProxies: WebshareProxy[] = [];
  private currentProxyIndex = 0;
  private requestedUris = new Map<string, boolean>();

  constructor(webshareApiToken: string) {
    this.proxyService = new WebshareProxyService(webshareApiToken);
  }

  async initialize(): Promise<void> {
    this.bulgarianProxies = await this.proxyService.getBulgarianProxies();
    if (this.bulgarianProxies.length === 0) {
      throw new Error("No Bulgarian proxies available");
    }
  }

  private getNextProxy(): WebshareProxy {
    const proxy = this.bulgarianProxies[this.currentProxyIndex];
    this.currentProxyIndex =
      (this.currentProxyIndex + 1) % this.bulgarianProxies.length;
    return proxy;
  }

  private getProxyConfig(proxy: WebshareProxy): AxiosRequestConfig {
    const proxyUrl = this.proxyService.formatProxyUrl(proxy);
    return {
      httpsAgent: new HttpsProxyAgent(proxyUrl),
      httpAgent: new HttpsProxyAgent(proxyUrl),
      proxy: false,
    };
  }

  async fetchAndParseHtml(url: string): Promise<ExtractedData> {
    await randomDelay(1000, 2500);
    const proxy = this.getNextProxy();
    const proxyConfig = this.getProxyConfig(proxy);

    const { data: html } = await axios.get(url, proxyConfig);
    return parseNuxtData(html);
  }

  async requestContentUri(
    contentUri: string,
    cityCode: string,
    countryCode: string = "BG",
  ) {
    if (this.requestedUris.has(contentUri)) {
      return null;
    }

    this.requestedUris.set(contentUri, true);
    await randomDelay(800, 2000);
    const requestUri = "https://api.glovoapp.com" + contentUri;
    const proxy = this.getNextProxy();
    const proxyConfig = this.getProxyConfig(proxy);
    console.log(
      "VISITING URI: ",
      contentUri,
      "WITH PROXT",
      proxy.proxy_address,
    );

    return axios.get(requestUri, {
      ...proxyConfig,
      headers: {
        accept: "application/json",
        "glovo-api-version": "14",
        "glovo-app-platform": "web",
        "glovo-app-type": "customer",
        "glovo-language-code": "en",
        "glovo-location-country-code": countryCode,
        "glovo-location-city-code": cityCode,
        "user-agent": "Mozilla/5.0",
      },
    });
  }
}
