import fetch from "node-fetch";
import * as cheerio from "cheerio";
import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";
import { Writable } from "stream";
import { HttpsProxyAgent } from "https-proxy-agent";
import {
  firebaseBrochureService,
  BrochureRecord,
} from "../firebase-service.js";
import { storePdf } from "../storage.js";
import {
  WebshareProxyService,
  WebshareProxy,
} from "../webshare-proxy-service.js";
import { SecretsManager } from "../secrets-manager.js";
import { BrochureStore, BROCHURE_HREF_PREFIXES } from "./constants.js";

export enum City {
  Sofia = "София",
  Plovdiv = "Пловдив",
  Varna = "Варна",
  Burgas = "Бургас",
  Ruse = "Русе",
  StaraZagora = "Стара%20Загора",
  Razgrad = "Разград",
}
const CITY_START_LINK_PREFIX = "https://katalozi-bg.info/city/";

export interface ImageData {
  id: string;
  buffer: Buffer;
}

export interface KataloziCrawlerConfig {
  storeId: string;
  country: string;
  projectId?: string;
}

export class KataloziCrawler {
  startUrl: string;
  protected config: KataloziCrawlerConfig;
  private proxyAgent?: HttpsProxyAgent<string>;
  private webshareService?: WebshareProxyService;
  private currentProxy?: WebshareProxy;
  private secretsManager: SecretsManager;
  private readonly defaultHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
  };
  private defaultFetchOptions: any;

  constructor(startUrl: string, config: KataloziCrawlerConfig) {
    this.startUrl = startUrl;
    this.config = config;
    this.secretsManager = new SecretsManager(config.projectId);
    this.defaultFetchOptions = {
      agent: this.proxyAgent,
      headers: this.defaultHeaders,
    };
  }

  async startWithCity(city: City, store: BrochureStore) {
    await this.initializeWebshareProxy();
    const response = await this.visitStartUrlForCity(city);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    const brochureIds = this.extractBrochureIds(html, store);
    console.log("brochureIds", brochureIds);
  }

  async visitStartUrlForCity(city: City) {
    const cityStartUrl = CITY_START_LINK_PREFIX + city;
    console.info(`Visiting ${cityStartUrl}`);
    return fetch(cityStartUrl, this.defaultFetchOptions);
  }
  /**
   * Extracts all brochure IDs from HTML for a specific store
   * @param html - The HTML content to search
   * @param store - The store enum to get the href prefix for
   * @returns Array of brochure IDs found
   */
  extractBrochureIds(html: string, store: BrochureStore): string[] {
    const hrefPrefix = BROCHURE_HREF_PREFIXES[store];
    if (!hrefPrefix) {
      throw new Error(`No href prefix found for store: ${store}`);
    }

    const escapedPrefix = hrefPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hrefPattern = new RegExp(`href="${escapedPrefix}(\\d+)"`, "gi");

    const matches = [...html.matchAll(hrefPattern)];
    return matches.map((match) => match[1]);
  }

  async initializeWebshareProxy(): Promise<void> {
    if (!this.webshareService) {
      try {
        console.log("🔐 Fetching Webshare API token from Secret Manager...");
        const apiToken = await this.secretsManager.getWebshareApiToken();
        this.webshareService = new WebshareProxyService(apiToken);
        console.log(
          "✅ Webshare service initialized with token from Secret Manager",
        );
      } catch (error) {
        console.error(
          "❌ Failed to get Webshare API token from Secret Manager:",
          error,
        );
        throw error;
      }
    }

    try {
      console.log("🔄 Fetching fresh Bulgarian proxies from Webshare...");
      const bulgarians =
        await this.webshareService.getBulgarianProxies("direct");

      if (bulgarians.length === 0) {
        console.error("❌ No Bulgarian proxies available from Webshare");
        throw new Error("No Bulgarian proxies available");
      }

      this.currentProxy =
        this.webshareService.getRandomBulgarianProxy(bulgarians) || undefined;
      if (!this.currentProxy) {
        console.error("❌ Failed to get a random Bulgarian proxy");
        throw new Error("Failed to get Bulgarian proxy");
      }

      const newProxyUrl = this.webshareService.formatProxyUrl(
        this.currentProxy,
      );
      this.proxyAgent = new HttpsProxyAgent(newProxyUrl);
      console.log(
        `🇧🇬 Using fresh Bulgarian proxy: ${this.currentProxy.proxy_address}:${this.currentProxy.port} (${this.currentProxy.city_name})`,
      );
    } catch (error) {
      console.error("❌ Failed to fetch Webshare proxies:", error);
      throw error;
    }
  }

  async startWithStore(storeInCloud: boolean = true) {
    try {
      console.log("🚀 Starting Katalozi crawler...");

      await this.initializeWebshareProxy();

      const brochureLinks = await this.getBrochureLinks();

      if (brochureLinks.length === 0) {
        console.log("❌ No brochure links found");
        return;
      }

      console.log(`Found ${brochureLinks.length} brochure links to process`);

      for (const link of brochureLinks) {
        try {
          const brochureId = this.extractBrochureId(link);
          console.log(`\n📋 Processing brochure ${brochureId} from ${link}`);

          // Check if already crawled
          if (await this.checkIfCrawled(brochureId)) {
            console.log(`⚠️ Skipping brochure ${brochureId} - already crawled`);
            continue;
          }

          // Extract brochure (download images and create PDF)
          console.log(`🔄 Extracting brochure ${brochureId}...`);
          const pdfBuffer = await this.extractBrochureFromLink(link);

          // Create dates (start date is current date, end date is estimated)
          const startDate = new Date();
          const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default 7 days

          let storagePath: string;
          let filename: string;

          if (storeInCloud) {
            // Store in cloud
            const cloudPath = await this.storeInCloud(
              pdfBuffer,
              brochureId,
              startDate,
              endDate,
            );
            // Also store locally with proper naming
            filename = await this.storeLocally(
              pdfBuffer,
              brochureId,
              startDate,
              endDate,
            );
            storagePath = cloudPath;
          } else {
            // Store only locally
            filename = await this.storeLocally(
              pdfBuffer,
              brochureId,
              startDate,
              endDate,
            );
            storagePath = filename;
          }

          // Store brochure info in Firebase
          const record: BrochureRecord = {
            brochureId,
            storeId: this.config.storeId,
            country: this.config.country,
            crawledAt: new Date(),
            startDate,
            endDate,
            filename,
            imageCount: 0, // We don't track individual image count for katalozi
            cloudStoragePath: storeInCloud ? storagePath : undefined,
          };

          await firebaseBrochureService.storeBrochureRecord(record);
          console.log(
            `✅ Brochure ${brochureId} stored successfully at: ${storagePath}`,
          );
        } catch (error) {
          console.error(`❌ Error processing brochure ${link}:`, error);
          // Continue with next brochure instead of stopping
        }
      }

      console.log("\n🎉 Katalozi crawler completed!");
    } catch (error) {
      console.error("❌ Error in Katalozi crawler:", error);
      throw error;
    }
  }

  async checkIfCrawled(brochureId: string): Promise<boolean> {
    const existingRecord =
      await firebaseBrochureService.getBrochureRecord(brochureId);
    if (existingRecord) {
      console.log(
        `📚 Brochure ${brochureId} has already been crawled on ${existingRecord.crawledAt.toISOString()}`,
      );
      console.log(
        `   Store: ${existingRecord.storeId}, Country: ${existingRecord.country}`,
      );
      console.log(
        `   Valid period: ${existingRecord.startDate.toDateString()} - ${existingRecord.endDate.toDateString()}`,
      );
      if (existingRecord.cloudStoragePath) {
        console.log(`   Stored at: ${existingRecord.cloudStoragePath}`);
      }
      return true;
    }
    return false;
  }

  async getBrochureLinks(): Promise<string[]> {
    console.log("Fetching main page:", this.startUrl);
    if (!this.proxyAgent) {
      throw new Error(
        "Proxy agent not initialized. Call initializeWebshareProxy() first.",
      );
    }

    const response = await fetch(this.startUrl, {
      agent: this.proxyAgent as any,
      headers: this.defaultHeaders,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const brochureLinks: string[] = [];
    const selector = "div#app2 div.row div.col-12.col-md-3 div.row a";

    $(selector).each((_, element) => {
      const href = $(element).attr("href");
      if (href) {
        const fullUrl = href.startsWith("http")
          ? href
          : `https://katalozi-bg.info${href}`;
        brochureLinks.push(fullUrl);
      }
    });

    console.log(`Found ${brochureLinks.length} brochure links`);
    return brochureLinks;
  }

  async extractBrochureFromLink(link: string): Promise<Buffer> {
    const brochureId = this.extractBrochureId(link);
    console.log(`Extracting brochure ID: ${brochureId} from link: ${link}`);

    const images: ImageData[] = [];
    let pageNumber = 1;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;

    while (consecutiveErrors < maxConsecutiveErrors) {
      const imageUrl = `https://katalozi-bg.info/catalogs/${brochureId}/landscape/${pageNumber}.jpg`;
      console.log(`Fetching image page ${pageNumber}: ${imageUrl}`);

      const buffer = await this.fetchImageBuffer(imageUrl);

      if (buffer) {
        images.push({
          id: pageNumber.toString(),
          buffer,
        });
        consecutiveErrors = 0;
        console.log(`Successfully fetched image page ${pageNumber}`);
      } else {
        consecutiveErrors++;
        console.log(
          `Failed to fetch image page ${pageNumber} (${consecutiveErrors}/${maxConsecutiveErrors} consecutive errors)`,
        );
      }

      pageNumber++;
    }

    if (images.length === 0) {
      throw new Error("No images found for brochure");
    }

    console.log(`Found ${images.length} pages for brochure ${brochureId}`);
    return await this.createPdfFromImages(images);
  }

  extractBrochureId(brochureUrl: string): string {
    const match = brochureUrl.match(/\/(\d+)$/);
    if (!match) {
      throw new Error("Could not extract brochure ID from URL: " + brochureUrl);
    }
    return match[1];
  }

  async fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
      if (!this.proxyAgent) {
        throw new Error(
          "Proxy agent not initialized. Call initializeWebshareProxy() first.",
        );
      }

      const response = await fetch(url, {
        agent: this.proxyAgent as any,
        headers: {
          "User-Agent": this.defaultHeaders["User-Agent"],
          Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://katalozi-bg.info/",
        },
      });
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      return null;
    }
  }

  async createPdfFromImages(images: ImageData[]): Promise<Buffer> {
    console.log(`Creating PDF from ${images.length} images...`);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ autoFirstPage: true, margin: 0 });
      const buffers: Buffer[] = [];

      const stream = new Writable({
        write(chunk, _, callback) {
          buffers.push(chunk);
          callback();
        },
      });

      doc.pipe(stream);

      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        try {
          console.log(
            `Adding page ${i + 1}/${images.length} (image ID: ${image.id})`,
          );

          if (i > 0) {
            doc.addPage({ margin: 0 });
          }

          doc.image(image.buffer, 0, 0, {
            fit: [doc.page.width, doc.page.height],
            align: "center",
            valign: "center",
          });
        } catch (error) {
          console.error(
            `Error adding image ${image.id} (page ${i + 1}) to PDF:`,
            error,
          );
        }
      }

      console.log("Finalizing PDF...");
      doc.end();

      stream.on("finish", () => {
        console.log(`PDF created successfully with ${images.length} pages`);
        resolve(Buffer.concat(buffers));
      });

      stream.on("error", (err) => {
        console.error("PDF creation error:", err);
        reject(err);
      });
    });
  }

  generateFilename(startDate: Date, endDate: Date, brochureId: string): string {
    return `brochures/${this.config.storeId}_${this.config.country}_${brochureId}.pdf`;
  }

  async storeLocally(
    pdfBuffer: Buffer,
    brochureId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    const filename = this.generateFilename(startDate, endDate, brochureId);

    // Create brochures directory if it doesn't exist
    const brochuresDir = path.dirname(filename);
    if (!fs.existsSync(brochuresDir)) {
      fs.mkdirSync(brochuresDir, { recursive: true });
    }

    fs.writeFileSync(filename, pdfBuffer);
    console.log(`📄 PDF saved locally: ${filename}`);
    return filename;
  }

  async storeInCloud(
    pdfBuffer: Buffer,
    brochureId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    console.log(`☁️ Uploading brochure ${brochureId} to cloud storage...`);

    const cloudPath = await storePdf(
      this.config.storeId,
      this.config.country,
      startDate,
      endDate,
      pdfBuffer.toString("base64"),
      brochureId,
    );

    console.log(`☁️ PDF uploaded to: ${cloudPath}`);
    return cloudPath;
  }
}
