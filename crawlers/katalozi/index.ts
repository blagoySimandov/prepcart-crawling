import fetch from "node-fetch";
import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";
import { Writable } from "stream";
import { HttpsProxyAgent } from "https-proxy-agent";
import {
  firebaseBrochureService,
  BrochureRecord,
} from "../firebase-service.js";
import {
  WebshareProxyService,
  WebshareProxy,
} from "../webshare-proxy-service.js";
import { SecretsManager } from "../secrets-manager.js";
import {
  BrochureStore,
  BROCHURE_HREF_PREFIXES,
  City,
  CITY_START_LINK_PREFIX,
} from "./constants.js";
import { KataloziCrawlerConfig, ImageData } from "./types.js";
import { Storage } from "@google-cloud/storage";
import { BUCKET_NAME } from "../constants.js";

const STOREID_TO_COUNTRY: Record<string, string> = {
  kaufland: "bulgaria",
  lidl: "bulgaria",
  billa: "bulgaria",
};

export class KataloziCrawler {
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
  private defaultFetchOptions: any; //TODO: don't type it to any

  constructor(config: KataloziCrawlerConfig) {
    this.config = config;
    this.secretsManager = new SecretsManager(config.projectId);
    this.defaultFetchOptions = {
      agent: this.proxyAgent,
      headers: this.defaultHeaders,
    };
  }

  async startWithCity(
    city: City,
    store: BrochureStore,
    storeInCloud?: boolean,
  ): Promise<void> {
    try {
      // Auto-detect environment if not explicitly set
      const shouldStoreInCloud = storeInCloud ?? (process.env.NODE_ENV === 'production');
      console.log(`🏙️ Starting crawler for city: ${city}, store: ${store}`);
      console.log(`📁 Storage mode: ${shouldStoreInCloud ? 'Cloud' : 'Local'} (NODE_ENV: ${process.env.NODE_ENV || 'development'})`);

      await this.initializeWebshareProxy();

      const response = await this.visitStartUrlForCity(city);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const brochureIds = this.extractBrochureIds(html, store);

      if (brochureIds.length === 0) {
        console.log(`❌ No brochure IDs found for ${store} in ${city}`);
        return;
      }

      console.log(
        `📋 Found ${brochureIds.length} brochure IDs for ${store}:`,
        brochureIds,
      );

      for (const brochureId of brochureIds) {
        try {
          console.log(`\n📖 Processing brochure ${brochureId}...`);

          if (await this.checkIfCrawled(brochureId)) {
            console.log(`⚠️ Skipping brochure ${brochureId} - already crawled`);
            continue;
          }

          const pdfBuffer = await this.generatePdfFromBrochureId(brochureId);

          let storagePath: string;
          let filename: string;

          if (shouldStoreInCloud) {
            console.log(`☁️ Storing brochure ${brochureId} in cloud (production mode)`);
            const cloudPath = await this.storeInCloud(pdfBuffer, brochureId);
            filename = await this.storeLocally(pdfBuffer, brochureId);
            storagePath = cloudPath;
          } else {
            console.log(`💾 Storing brochure ${brochureId} locally (development mode)`);
            filename = await this.storeLocally(pdfBuffer, brochureId);
            storagePath = filename;
          }

          const record: BrochureRecord = {
            brochureId,
            storeId: this.config.storeId,
            country: STOREID_TO_COUNTRY[this.config.storeId],
            crawledAt: new Date(),
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            filename,
            cloudStoragePath: shouldStoreInCloud ? storagePath : undefined,
          };

          await firebaseBrochureService.storeBrochureRecord(record);
          console.log(`✅ Brochure ${brochureId} processed successfully`);
        } catch (error) {
          console.error(`❌ Error processing brochure ${brochureId}:`, error);
          // Continue with next brochure instead of stopping
        }
      }

      console.log(
        `\n🎉 Completed processing ${brochureIds.length} brochures for ${store} in ${city}`,
      );
    } catch (error) {
      console.error(`❌ Error in startWithCity for ${city}, ${store}:`, error);
      throw error;
    }
  }

  /**
   * Generates a PDF from a brochure ID by fetching landscape images
   * @param brochureId - The brochure ID to fetch images for
   * @returns Buffer containing the generated PDF
   */
  async generatePdfFromBrochureId(brochureId: string): Promise<Buffer> {
    console.log(`📸 Fetching images for brochure ${brochureId}...`);

    const images: ImageData[] = [];
    let pageNumber = 1;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;

    while (consecutiveErrors < maxConsecutiveErrors) {
      const imageUrl = `https://katalozi-bg.info/catalogs/${brochureId}/landscape/${pageNumber}.jpg`;
      console.log(`🔍 Fetching page ${pageNumber}: ${imageUrl}`);

      const buffer = await this.fetchImageBuffer(imageUrl);

      if (buffer) {
        images.push({
          id: pageNumber.toString(),
          buffer,
        });
        consecutiveErrors = 0;
        console.log(`✅ Successfully fetched page ${pageNumber}`);
      } else {
        consecutiveErrors++;
        console.log(
          `❌ Failed to fetch page ${pageNumber} (${consecutiveErrors}/${maxConsecutiveErrors} consecutive errors)`,
        );
      }

      pageNumber++;
    }

    if (images.length === 0) {
      throw new Error(`No images found for brochure ${brochureId}`);
    }

    console.log(`📚 Found ${images.length} pages for brochure ${brochureId}`);
    return await this.createPdfFromImages(images);
  }

  async visitStartUrlForCity(city: City) {
    const cityStartUrl = CITY_START_LINK_PREFIX + city;
    console.info(`🌐 Visiting ${cityStartUrl}`);

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

    const matches = Array.from(html.matchAll(hrefPattern));
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

      // Check if we got redirected (indicates image doesn't exist)
      if (response.url.includes("/city/")) {
        console.log(
          `🔄 Got redirected to ${response.url} - image doesn't exist`,
        );
        return null;
      }

      // Check content type to ensure it's actually an image
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.startsWith("image/")) {
        console.log(`❌ Invalid content type: ${contentType} - expected image`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 100) {
        console.log(
          `❌ Buffer too small (${buffer.length} bytes) - likely not an image`,
        );
        return null;
      }

      return buffer;
    } catch (error) {
      console.log(`❌ Error fetching image: ${error}`);
      return null;
    }
  }

  async createPdfFromImages(images: ImageData[]): Promise<Buffer> {
    console.log(`📄 Creating PDF from ${images.length} images...`);

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
            `📋 Adding page ${i + 1}/${images.length} (image ID: ${image.id})`,
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
            `❌ Error adding image ${image.id} (page ${i + 1}) to PDF:`,
            error,
          );
        }
      }

      console.log("🔧 Finalizing PDF...");
      doc.end();

      stream.on("finish", () => {
        console.log(`✅ PDF created successfully with ${images.length} pages`);
        resolve(Buffer.concat(buffers));
      });

      stream.on("error", (err) => {
        console.error("❌ PDF creation error:", err);
        reject(err);
      });
    });
  }

  generateFilename(brochureId: string): string {
    return `brochures/${this.config.storeId}_${brochureId}.pdf`;
  }

  async storeLocally(pdfBuffer: Buffer, brochureId: string): Promise<string> {
    const filename = this.generateFilename(brochureId);

    const brochuresDir = path.dirname(filename);
    if (!fs.existsSync(brochuresDir)) {
      fs.mkdirSync(brochuresDir, { recursive: true });
    }

    fs.writeFileSync(filename, pdfBuffer);
    console.log(`💾 PDF saved locally: ${filename}`);
    return filename;
  }

  async storeInCloud(pdfBuffer: Buffer, brochureId: string): Promise<string> {
    console.log(`☁️ Uploading brochure ${brochureId} to cloud storage...`);

    const filename = `${this.config.storeId}_${brochureId}.pdf`;
    const cloudPath = await this.storeInGoogleCloud(pdfBuffer, filename);

    console.log(`☁️ PDF uploaded to: ${cloudPath}`);
    return cloudPath;
  }

  private async storeInGoogleCloud(
    pdfBuffer: Buffer,
    filename: string,
  ): Promise<string> {
    const storage = new Storage();
    const fullPath = `brochures/${filename}`;
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(fullPath);

    try {
      await file.save(pdfBuffer, {
        metadata: {
          contentType: "application/pdf",
          contentEncoding: null,
          cacheControl: "public, max-age=31536000",
        },
        resumable: true,
        validation: "crc32c",
        gzip: false,
      });

      return `gs://${BUCKET_NAME}/${fullPath}`;
    } catch (error) {
      console.error("Error uploading PDF:", error);
      throw error;
    }
  }
}
