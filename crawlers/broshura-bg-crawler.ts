import fetch from "node-fetch";
import * as cheerio from "cheerio";
import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";
import { Writable } from "stream";
import { HttpsProxyAgent } from "https-proxy-agent";
import { firebaseBrochureService, BrochureRecord } from "./firebase-service.js";
import { storePdf } from "./storage.js";

export interface BrochureInfo {
  validToDate: Date;
  brochureUrl: string;
}

export interface ImageData {
  id: string;
  buffer: Buffer;
}

export interface BroshuraBgCrawlerConfig {
  storeId: string;
  country: string;
  storeSlug: string;
  imageSuffix: string;
  baseIndex?: string;
}

export class BroshuraBgCrawler {
  private config: BroshuraBgCrawlerConfig;
  private startLink: string;
  private readonly proxyAgent: HttpsProxyAgent<string>;
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

  constructor(config: BroshuraBgCrawlerConfig) {
    this.config = {
      ...config,
      baseIndex: config.baseIndex || "0",
    };
    this.startLink = `https://www.broshura.bg/h/${config.storeSlug}`;

    const proxyUrl = "http://wckkuhds:wrwzkpqoyr76@82.22.254.105:5965";
    this.proxyAgent = new HttpsProxyAgent(proxyUrl);
    console.log("🌐 Using proxy: 82.22.254.105:5965");
  }

  extractBrochureId(brochureUrl: string): string {
    const match = brochureUrl.match(/\/b\/(\d+)/);
    if (!match) {
      throw new Error("Could not extract brochure ID from URL: " + brochureUrl);
    }
    return match[1];
  }

  async fetchMainPage(): Promise<BrochureInfo> {
    console.log("Fetching main page:", this.startLink);
    const response = await fetch(this.startLink, {
      agent: this.proxyAgent as any,
      headers: this.defaultHeaders,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();

    const $ = cheerio.load(html);

    const dateTimeElement = $("ul.list-offer li time[datetime]");
    const dateTimeAttr = dateTimeElement.attr("datetime");

    if (!dateTimeAttr) {
      throw new Error("Could not find valid-to date");
    }

    const validToDate = new Date(dateTimeAttr);
    console.log("Valid to date:", validToDate.toISOString());

    const brochureLink = $("ul.list-offer > li > a").first().attr("href");

    if (!brochureLink) {
      throw new Error("Could not find brochure link");
    }

    const brochureUrl = brochureLink.startsWith("http")
      ? brochureLink
      : `https://www.broshura.bg${brochureLink}`;

    console.log("Brochure URL:", brochureUrl);

    const brochureId = this.extractBrochureId(brochureUrl);
    this.config.baseIndex = brochureId;
    console.log("Brochure ID (base index):", brochureId);

    return {
      validToDate,
      brochureUrl,
    };
  }

  async extractImageBaseUrl(brochureUrl: string): Promise<string> {
    console.log("Fetching brochure page:", brochureUrl);
    const response = await fetch(brochureUrl, {
      agent: this.proxyAgent as any,
      headers: this.defaultHeaders,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract og:image meta tag content
    const ogImageContent = $('meta[property="og:image"]').attr("content");

    if (!ogImageContent) {
      throw new Error("Could not find og:image meta tag");
    }

    console.log("Found og:image URL:", ogImageContent);
    return ogImageContent;
  }

  extractImageId(imageUrl: string): string {
    const match = imageUrl.match(/\/(\d+)_/);
    if (!match) {
      throw new Error("Could not extract image ID from URL: " + imageUrl);
    }
    return match[1];
  }

  async fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
      const response = await fetch(url, {
        agent: this.proxyAgent as any,
        headers: {
          "User-Agent": this.defaultHeaders["User-Agent"],
          Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://www.broshura.bg/",
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

  async fetchAllImages(baseImageUrl: string): Promise<ImageData[]> {
    const baseImageId = this.extractImageId(baseImageUrl);

    const baseUrl = baseImageUrl.substring(
      0,
      baseImageUrl.lastIndexOf("/") + 1,
    );
    const suffix = `_${this.config.imageSuffix}.jpg`;

    console.log("Base image ID:", baseImageId);
    console.log("Base URL:", baseUrl);
    console.log("Suffix:", suffix);
    console.log("Starting image collection...");

    const images: ImageData[] = [];
    let currentId = parseInt(baseImageId);
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;

    while (consecutiveErrors < maxConsecutiveErrors) {
      const imageUrl = `${baseUrl}${currentId}${suffix}`;
      console.log("Image URL:", imageUrl);
      console.log(`Fetching image ${currentId}...`);

      const buffer = await this.fetchImageBuffer(imageUrl);

      if (buffer) {
        images.push({
          id: currentId.toString(),
          buffer,
        });
        consecutiveErrors = 0;
        console.log(`Successfully fetched image ${currentId}`);
      } else {
        consecutiveErrors++;
        console.log(
          `Failed to fetch image ${currentId} (${consecutiveErrors}/${maxConsecutiveErrors} consecutive errors)`,
        );
      }

      currentId++;
    }

    console.log(`Finished fetching images. Found ${images.length} pages.`);
    return images;
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

  generateFilename(startDate: Date, endDate: Date): string {
    const startDateString = startDate.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const endDateString = endDate.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    return `brochures/${this.config.storeId}_${this.config.country}_${startDateString}_${endDateString}_${this.config.baseIndex}.pdf`;
  }

  /**
   * Check if this brochure has already been crawled
   */
  async checkIfAlreadyCrawled(
    brochureId: string,
  ): Promise<BrochureRecord | null> {
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
    }
    return existingRecord;
  }

  /**
   * Store brochure information in Firebase after successful crawling
   */
  async storeBrochureInfo(
    brochureId: string,
    startDate: Date,
    endDate: Date,
    filename: string,
    imageCount: number,
    cloudStoragePath?: string,
  ): Promise<void> {
    const record: BrochureRecord = {
      brochureId,
      storeId: this.config.storeId,
      country: this.config.country,
      crawledAt: new Date(),
      startDate,
      endDate,
      filename,
      imageCount,
      cloudStoragePath,
    };

    await firebaseBrochureService.storeBrochureRecord(record);
  }

  /**
   * Crawl, save locally, and optionally upload to cloud storage
   */
  async crawlAndSaveWithCloudStorage(): Promise<{
    filename: string;
    cloudPath?: string;
  }> {
    try {
      console.log(
        `🚀 Starting ${this.config.storeId} crawler with cloud storage...`,
      );

      const brochureInfo = await this.fetchMainPage();
      const brochureId = this.config.baseIndex!;

      console.log(
        `📋 Checking if brochure ${brochureId} has already been crawled...`,
      );

      const existingRecord = await this.checkIfAlreadyCrawled(brochureId);
      if (existingRecord) {
        console.log(
          `⚠️ Skipping crawling - brochure ${brochureId} already processed`,
        );
        return {
          filename: existingRecord.filename || "",
          cloudPath: existingRecord.cloudStoragePath,
        };
      }

      console.log(
        `✅ Brochure ${brochureId} not found in database. Proceeding with crawling...`,
      );

      // Step 3-7: Same as crawlAndSaveLocally but get PDF content as buffer
      const baseImageUrl = await this.extractImageBaseUrl(
        brochureInfo.brochureUrl,
      );
      const images = await this.fetchAllImages(baseImageUrl);

      if (images.length === 0) {
        throw new Error("No images found");
      }

      console.log(`Found ${images.length} pages`);

      const startDate = new Date();
      const endDate = brochureInfo.validToDate;
      const filename = this.generateFilename(startDate, endDate);

      // Create brochures directory if it doesn't exist
      const brochuresDir = path.dirname(filename);
      if (!fs.existsSync(brochuresDir)) {
        fs.mkdirSync(brochuresDir, { recursive: true });
      }

      // Create PDF from images
      console.log("Creating PDF from images...");
      const pdfContent = await this.createPdfFromImages(images);

      // Save PDF locally
      fs.writeFileSync(filename, pdfContent);
      console.log(`📄 PDF saved locally: ${filename}`);

      // Upload to cloud storage
      console.log(`☁️ Uploading to cloud storage...`);
      const cloudPath = await storePdf(
        this.config.storeId,
        this.config.country,
        startDate,
        endDate,
        pdfContent.toString("base64"),
        brochureId,
      );
      console.log(`☁️ PDF uploaded to: ${cloudPath}`);

      // Store brochure information in Firebase with cloud path
      console.log(`💾 Storing brochure information in Firebase...`);
      await this.storeBrochureInfo(
        brochureId,
        startDate,
        endDate,
        filename,
        images.length,
        cloudPath,
      );

      console.log(`✅ ${this.config.storeId} crawler completed successfully!`);
      return { filename, cloudPath };
    } catch (error) {
      console.error(`❌ Error in ${this.config.storeId} crawler:`, error);
      throw error;
    }
  }

  async crawlAndSaveLocally(): Promise<string> {
    try {
      console.log(`🚀 Starting ${this.config.storeId} crawler...`);

      // Step 1: Fetch main page and extract brochure info
      const brochureInfo = await this.fetchMainPage();
      const brochureId = this.config.baseIndex!; // This gets set in fetchMainPage()

      console.log(
        `📋 Checking if brochure ${brochureId} has already been crawled...`,
      );

      // Step 2: Check if this brochure has already been crawled
      const existingRecord = await this.checkIfAlreadyCrawled(brochureId);
      if (existingRecord) {
        console.log(
          `⚠️ Skipping crawling - brochure ${brochureId} already processed`,
        );

        // If local file doesn't exist but we have a record, we could optionally download from cloud storage
        const localFilename = this.generateFilename(
          existingRecord.startDate,
          existingRecord.endDate,
        );
        if (fs.existsSync(localFilename)) {
          console.log(`📄 Local file exists: ${localFilename}`);
          return localFilename;
        } else {
          console.log(
            `📄 Local file doesn't exist, but brochure was already crawled. You may want to download from cloud storage.`,
          );
          return localFilename; // Return the expected filename even if it doesn't exist locally
        }
      }

      console.log(
        `✅ Brochure ${brochureId} not found in database. Proceeding with crawling...`,
      );

      // Step 3: Extract base image URL from brochure page
      const baseImageUrl = await this.extractImageBaseUrl(
        brochureInfo.brochureUrl,
      );

      // Step 4: Fetch all images
      const images = await this.fetchAllImages(baseImageUrl);

      if (images.length === 0) {
        throw new Error("No images found");
      }

      console.log(`Found ${images.length} pages`);

      // Step 5: Create dates (start date is current date, end date is extracted)
      const startDate = new Date();
      const endDate = brochureInfo.validToDate;

      // Step 6: Create local filename
      const filename = this.generateFilename(startDate, endDate);

      // Create brochures directory if it doesn't exist
      const brochuresDir = path.dirname(filename);
      if (!fs.existsSync(brochuresDir)) {
        fs.mkdirSync(brochuresDir, { recursive: true });
      }

      // Check if PDF already exists locally (additional safety check)
      if (fs.existsSync(filename)) {
        console.log("PDF already exists locally:", filename);
        // Still store the record in Firebase if it doesn't exist
        await this.storeBrochureInfo(
          brochureId,
          startDate,
          endDate,
          filename,
          images.length,
        );
        return filename;
      }

      // Step 7: Create PDF from images
      console.log("Creating PDF from images...");
      const pdfContent = await this.createPdfFromImages(images);

      // Step 8: Save PDF locally
      fs.writeFileSync(filename, pdfContent);
      console.log(`📄 PDF saved locally: ${filename}`);

      // Step 9: Store brochure information in Firebase
      console.log(`💾 Storing brochure information in Firebase...`);
      await this.storeBrochureInfo(
        brochureId,
        startDate,
        endDate,
        filename,
        images.length,
      );

      console.log(`✅ ${this.config.storeId} crawler completed successfully!`);
      return filename;
    } catch (error) {
      console.error(`❌ Error in ${this.config.storeId} crawler:`, error);
      throw error;
    }
  }
}
