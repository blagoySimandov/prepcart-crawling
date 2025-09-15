import fetch from "node-fetch";
import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";
import { Writable } from "stream";
import { randomUUID } from "crypto";
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
  STOREID_TO_BROCHURE_PREFIX,
  City,
  CITY_START_LINK_PREFIX,
} from "./constants.js";
import { KataloziCrawlerConfig, ImageData } from "./types.js";
import { Storage } from "@google-cloud/storage";
import { BUCKET_NAME, STOREID_TO_COUNTRY } from "../constants.js";

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

  async startWithCities(cities: City[], storeInCloud?: boolean): Promise<void> {
    try {
      const shouldStoreInCloud = this.determineStorageMode(storeInCloud);
      this.logCrawlerStart(cities, shouldStoreInCloud);

      await this.initializeWebshareProxy();

      const brochureMapping = await this.collectBrochuresFromCities(cities);
      if (brochureMapping.uniqueIds.length === 0) {
        console.log(
          `❌ No brochure IDs found for ${this.config.storeId} in any cities`,
        );
        return;
      }

      this.logBrochureSummary(brochureMapping, cities.length);

      await this.processBrochures(brochureMapping, shouldStoreInCloud);

      console.log(
        `\n🎉 Completed processing ${brochureMapping.uniqueIds.length} unique brochures for ${this.config.storeId} across cities: ${cities.join(", ")}`,
      );
    } catch (error) {
      const errorMessage = `Error in startWithCities for ${cities.join(", ")}, ${this.config.storeId}: ${error}`;
      console.error(`❌ ${errorMessage}`);
      await this.notifyError(errorMessage);
      throw error;
    }
  }

  /**
   * Generates a PDF from a brochure ID by fetching landscape images
   * @param brochureId - The brochure ID to fetch images for
   * @returns Buffer containing the generated PDF
   */
  async generatePdfFromBrochureId(
    brochureId: string,
  ): Promise<{ buffer: Buffer; imageCount: number }> {
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
    const pdfBuffer = await this.createPdfFromImages(images);
    return { buffer: pdfBuffer, imageCount: images.length };
  }

  /**
   * Gets the image count for a brochure by counting available pages
   * @param brochureId - The brochure ID to count images for
   * @returns Number of images/pages in the brochure
   */
  async getImageCountForBrochure(brochureId: string): Promise<number> {
    let pageNumber = 1;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;
    let imageCount = 0;

    while (consecutiveErrors < maxConsecutiveErrors) {
      const imageUrl = `https://katalozi-bg.info/catalogs/${brochureId}/landscape/${pageNumber}.jpg`;

      try {
        const response = await fetch(imageUrl, {
          agent: this.proxyAgent as any,
          method: "HEAD", // Only check if the image exists, don't download
          headers: {
            "User-Agent": this.defaultHeaders["User-Agent"],
            Referer: "https://katalozi-bg.info/",
          },
        });

        if (response.ok && !response.url.includes("/city/")) {
          imageCount++;
          consecutiveErrors = 0;
        } else {
          consecutiveErrors++;
        }
      } catch (error) {
        consecutiveErrors++;
      }

      pageNumber++;
    }

    return imageCount;
  }

  async visitStartUrlForCity(city: City) {
    const cityStartUrl = CITY_START_LINK_PREFIX + city;
    console.info(`🌐 Visiting ${cityStartUrl}`);

    return fetch(cityStartUrl, this.defaultFetchOptions);
  }

  /**
   * Extracts all brochure IDs from HTML for the configured store
   * @param html - The HTML content to search
   * @returns Array of brochure IDs found
   */
  extractBrochureIds(html: string): string[] {
    const hrefPrefix = STOREID_TO_BROCHURE_PREFIX[this.config.storeId];
    if (!hrefPrefix) {
      throw new Error(
        `No href prefix found for storeId: ${this.config.storeId}`,
      );
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
        const errorMessage = `Failed to get Webshare API token from Secret Manager: ${error}`;
        console.error(`❌ ${errorMessage}`);
        await this.notifyError(errorMessage);
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
      const errorMessage = `Failed to fetch Webshare proxies: ${error}`;
      console.error(`❌ ${errorMessage}`);
      await this.notifyError(errorMessage);
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
        `   Store: ${existingRecord.storeId}, Country: ${existingRecord.country}, Cities: ${existingRecord.cityIds.join(", ")}`,
      );
      console.log(
        `   Filename: ${existingRecord.filename}, Images: ${existingRecord.imageCount || "N/A"}`,
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

  generateFilename(uuid: string): string {
    return `brochures/${uuid}.pdf`;
  }

  async storeLocally(pdfBuffer: Buffer, uuid: string): Promise<void> {
    const filename = this.generateFilename(uuid);

    const brochuresDir = path.dirname(filename);
    if (!fs.existsSync(brochuresDir)) {
      fs.mkdirSync(brochuresDir, { recursive: true });
    }

    fs.writeFileSync(filename, pdfBuffer);
    console.log(`💾 PDF saved locally: ${filename}`);
  }

  async storeInCloud(pdfBuffer: Buffer, uuid: string): Promise<string> {
    console.log(`☁️ Uploading brochure with UUID ${uuid} to cloud storage...`);

    const filename = `${uuid}.pdf`;
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

  // Helper functions for better code organization

  private determineStorageMode(storeInCloud?: boolean): boolean {
    return storeInCloud ?? process.env.NODE_ENV === "production";
  }

  private logCrawlerStart(cities: City[], shouldStoreInCloud: boolean): void {
    console.log(
      `🏙️ Starting crawler for cities: ${cities.join(", ")}, store: ${this.config.storeId}`,
    );
    console.log(
      `📁 Storage mode: ${shouldStoreInCloud ? "Cloud" : "Local"} (NODE_ENV: ${process.env.NODE_ENV || "development"})`,
    );
  }

  private async collectBrochuresFromCities(
    cities: City[],
  ): Promise<{ cityMapping: Record<string, string[]>; uniqueIds: string[] }> {
    const brochureToCity: Record<string, string[]> = {};
    const allBrochureIds = new Set<string>();

    for (const city of cities) {
      const brochureIds = await this.getBrochureIdsForCity(city);
      this.addBrochuresToMapping(
        brochureIds,
        city,
        brochureToCity,
        allBrochureIds,
      );
    }

    return {
      cityMapping: brochureToCity,
      uniqueIds: Array.from(allBrochureIds),
    };
  }

  private async getBrochureIdsForCity(city: City): Promise<string[]> {
    console.log(`\n🌐 Visiting ${city}...`);

    const response = await this.visitStartUrlForCity(city);
    if (!response.ok) {
      console.error(`❌ Failed to fetch ${city}: HTTP ${response.status}`);
      return [];
    }

    const html = await response.text();
    const brochureIds = this.extractBrochureIds(html);

    console.log(
      `📋 Found ${brochureIds.length} brochure IDs for ${this.config.storeId} in ${city}`,
    );
    return brochureIds;
  }

  private addBrochuresToMapping(
    brochureIds: string[],
    city: City,
    brochureToCity: Record<string, string[]>,
    allBrochureIds: Set<string>,
  ): void {
    for (const brochureId of brochureIds) {
      if (!brochureToCity[brochureId]) {
        brochureToCity[brochureId] = [];
      }
      if (!brochureToCity[brochureId].includes(city)) {
        brochureToCity[brochureId].push(city);
      }
      allBrochureIds.add(brochureId);
    }
  }

  private logBrochureSummary(
    brochureMapping: {
      cityMapping: Record<string, string[]>;
      uniqueIds: string[];
    },
    cityCount: number,
  ): void {
    console.log(
      `\n📊 Summary: Found ${brochureMapping.uniqueIds.length} unique brochures across ${cityCount} cities`,
    );

    for (const [brochureId, associatedCities] of Object.entries(
      brochureMapping.cityMapping,
    )) {
      console.log(`   ${brochureId}: ${associatedCities.join(", ")}`);
    }
  }

  private async processBrochures(
    brochureMapping: {
      cityMapping: Record<string, string[]>;
      uniqueIds: string[];
    },
    shouldStoreInCloud: boolean,
  ): Promise<void> {
    for (const brochureId of brochureMapping.uniqueIds) {
      try {
        const associatedCities = brochureMapping.cityMapping[brochureId];
        await this.processSingleBrochure(
          brochureId,
          associatedCities,
          shouldStoreInCloud,
        );
      } catch (error) {
        const errorMessage = `Error processing brochure ${brochureId}: ${error}`;
        console.error(`❌ ${errorMessage}`);
        await this.notifyError(errorMessage);
        // Continue with next brochure instead of stopping
      }
    }
  }

  private async processSingleBrochure(
    brochureId: string,
    associatedCities: string[],
    shouldStoreInCloud: boolean,
  ): Promise<void> {
    console.log(
      `\n📖 Processing brochure ${brochureId} (cities: ${associatedCities.join(", ")})...`,
    );

    if (await this.checkIfCrawled(brochureId)) {
      console.log(`⚠️ Skipping brochure ${brochureId} - already crawled`);
      return;
    }

    const pdfData = await this.createBrochurePdf(brochureId);

    // First, create and store the Firestore record without cloudStoragePath
    const initialRecord = this.createBrochureRecord(
      brochureId,
      associatedCities,
      pdfData,
      { filename: `${pdfData.uuid}.pdf` },
    );
    await firebaseBrochureService.storeBrochureRecord(initialRecord);
    console.log(`📝 Firestore record created for brochure ${brochureId}`);

    // Then, upload to storage and update the record if needed
    const storagePaths = await this.storeBrochure(
      brochureId,
      pdfData,
      shouldStoreInCloud,
    );

    // Update the Firestore record with cloud storage path if it was uploaded
    if (storagePaths.cloudStoragePath) {
      await this.updateBrochureRecordWithCloudPath(
        brochureId,
        storagePaths.cloudStoragePath,
      );
      console.log(
        `☁️ Firestore record updated with cloud storage path for brochure ${brochureId}`,
      );
    }

    console.log(`✅ Brochure ${brochureId} processed successfully`);
  }

  private async createBrochurePdf(
    brochureId: string,
  ): Promise<{ buffer: Buffer; imageCount: number; uuid: string }> {
    const { buffer: pdfBuffer, imageCount } =
      await this.generatePdfFromBrochureId(brochureId);
    const uuid = randomUUID();

    return { buffer: pdfBuffer, imageCount, uuid };
  }

  private async storeBrochure(
    brochureId: string,
    pdfData: { buffer: Buffer; uuid: string },
    shouldStoreInCloud: boolean,
  ): Promise<{ filename: string; cloudStoragePath?: string }> {
    const filename = `${pdfData.uuid}.pdf`;
    let cloudStoragePath: string | undefined;

    if (shouldStoreInCloud) {
      console.log(
        `☁️ Storing brochure ${brochureId} in cloud (production mode)`,
      );
      cloudStoragePath = await this.storeInCloud(pdfData.buffer, pdfData.uuid);
      await this.storeLocally(pdfData.buffer, pdfData.uuid);
    } else {
      console.log(
        `💾 Storing brochure ${brochureId} locally (development mode)`,
      );
      await this.storeLocally(pdfData.buffer, pdfData.uuid);
    }

    return { filename, cloudStoragePath };
  }

  private createBrochureRecord(
    brochureId: string,
    associatedCities: string[],
    pdfData: { imageCount: number },
    storagePaths: { filename: string; cloudStoragePath?: string },
  ): BrochureRecord {
    return {
      brochureId,
      storeId: this.config.storeId,
      country: STOREID_TO_COUNTRY[this.config.storeId],
      cityIds: associatedCities,
      crawledAt: new Date(),
      filename: storagePaths.filename,
      cloudStoragePath: storagePaths.cloudStoragePath || undefined,
      imageCount: pdfData.imageCount,
    };
  }

  private async updateBrochureRecordWithCloudPath(
    brochureId: string,
    cloudStoragePath: string,
  ): Promise<void> {
    await firebaseBrochureService.updateBrochureRecord(brochureId, {
      cloudStoragePath,
    });
  }

  /**
   * Sends error notification to webhook for serious errors
   */
  private async notifyError(errorMessage: string): Promise<void> {
    const webhookUrl =
      "https://n8n.prepcart.it.com/webhook/ad1fe76e-95e1-4fa5-a7ea-0066dcad8dc5";

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: errorMessage,
        }),
      });

      if (response.ok) {
        console.log("📡 Error notification sent successfully");
      } else {
        console.error(
          `❌ Failed to send error notification: HTTP ${response.status}`,
        );
      }
    } catch (notificationError) {
      console.error("❌ Error sending notification:", notificationError);
    }
  }
}
