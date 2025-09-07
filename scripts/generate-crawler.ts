#!/usr/bin/env tsx

import * as fs from "fs";
import * as path from "path";
import { City } from "../crawlers/katalozi/constants.js";

interface CrawlerConfig {
  storeId: string;
  storeName: string;
  cities?: string[];
  projectId?: string;
}

function toPascalCase(str: string): string {
  return str
    .split("-")[0]
    .split(/[\s-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

function generateCrawlerCode(config: CrawlerConfig): string {
  const allCities = Object.keys(City).map((key) => `City.${key}`);
  const {
    storeId,
    storeName,
    cities = allCities,
    projectId = "prepcart-prod",
  } = config;
  const className = `${toPascalCase(storeName)}KataloziCrawler`;
  const configInterface = `${toPascalCase(storeName)}KataloziCrawlerConfig`;

  const citiesArray =
    cities.length > 1
      ? `[\n      ${cities.join(",\n      ")},\n    ]`
      : `[${cities[0]}]`;

  return `import { City } from "../../constants.js";
import { KataloziCrawler } from "../../index.js";
import { KataloziCrawlerConfig } from "../../types.js";

export interface ${configInterface} {
  storeId: string;
  country: string;
  projectId?: string;
}
const STORE_ID = "${storeId}";
const PROJECT_ID = "${projectId}";

export class ${className} extends KataloziCrawler {
  constructor() {
    const kataloziConfig: KataloziCrawlerConfig = {
      storeId: STORE_ID,
      projectId: PROJECT_ID,
    };
    super(kataloziConfig);
  }
}

async function main() {
  try {
    const crawler = new ${className}();
    await crawler.startWithCities(${citiesArray});
    console.log("✅ Crawler finished successfully");
  } catch (error) {
    console.error("❌ Crawler failed:", error);
    throw error;
  }
}

await main();
`;
}

function updateConstants(storeId: string, brochureUrl: string): void {
  const constantsPath = path.join(
    process.cwd(),
    "crawlers/katalozi/constants.ts",
  );

  if (!fs.existsSync(constantsPath)) {
    console.error("❌ Constants file not found:", constantsPath);
    return;
  }

  let content = fs.readFileSync(constantsPath, "utf8");

  // Check if storeId already exists
  if (content.includes(`"${storeId}"`)) {
    console.log(`ℹ️  Store ID "${storeId}" already exists in constants`);
    return;
  }

  // Add to STOREID_TO_BROCHURE_PREFIX
  const regex =
    /(export const STOREID_TO_BROCHURE_PREFIX: Record<string, string> = \{[^}]*)(};)/;
  const match = content.match(regex);

  if (match) {
    const newEntry = `  "${storeId}": "${brochureUrl}",\n`;
    const updatedContent = content.replace(regex, `$1${newEntry}$2`);
    fs.writeFileSync(constantsPath, updatedContent);
    console.log(`✅ Added ${storeId} to constants`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Usage: tsx scripts/generate-crawler.ts <storeId> <storeName> [options]

Arguments:
  storeId     - The store identifier (e.g., "metro-bg")
  storeName   - The store name for class generation (e.g., "Metro")

Options:
  --cities    - Comma-separated list of cities (e.g., "City.Sofia,City.Plovdiv")
  --project   - Project ID (default: "prepcart-prod")
  --url       - Brochure URL prefix for constants
  --no-update - Skip updating constants file

Examples:
  tsx scripts/generate-crawler.ts metro-bg Metro
  tsx scripts/generate-crawler.ts billa-bg Billa --cities "City.Sofia,City.Varna" --url "https://katalozi-bg.info/catalogs/promo-katalog-Billa/"
`);
    process.exit(1);
  }

  const [storeId, storeName] = args;

  // Parse options
  const allCities = Object.keys(City).map((key) => `City.${key}`);
  let cities = allCities;
  let projectId = "prepcart-prod";
  let brochureUrl = "";
  let areConstantsUpdated = true;

  for (let i = 2; i < args.length; i++) {
    switch (args[i]) {
      case "--cities":
        if (args[i + 1]) {
          cities = args[i + 1].split(",").map((c) => c.trim());
          i++;
        }
        break;
      case "--project":
        if (args[i + 1]) {
          projectId = args[i + 1];
          i++;
        }
        break;
      case "--url":
        if (args[i + 1]) {
          brochureUrl = args[i + 1];
          i++;
        }
        break;
      case "--no-update":
        areConstantsUpdated = false;
        break;
    }
  }

  const config: CrawlerConfig = {
    storeId,
    storeName,
    cities,
    projectId,
  };

  // Generate crawler directory and file
  const crawlerDir = path.join(
    process.cwd(),
    "crawlers/katalozi/crawlers",
    storeName.toLowerCase(),
  );
  const crawlerFile = path.join(crawlerDir, "index.ts");

  // Create directory if it doesn't exist
  if (!fs.existsSync(crawlerDir)) {
    fs.mkdirSync(crawlerDir, { recursive: true });
    console.log(`✅ Created directory: ${crawlerDir}`);
  }

  // Generate and write crawler code
  const crawlerCode = generateCrawlerCode(config);
  fs.writeFileSync(crawlerFile, crawlerCode);
  console.log(`✅ Generated crawler: ${crawlerFile}`);

  // Update constants if URL provided and update not disabled
  if (areConstantsUpdated && brochureUrl) {
    updateConstants(storeId, brochureUrl);
  } else if (areConstantsUpdated && !brochureUrl) {
    console.log(`ℹ️  Skipping constants update (no --url provided)`);
  }

  console.log(`
🎉 Crawler generation complete!

Generated:
  - ${crawlerFile}
${areConstantsUpdated && brochureUrl ? `  - Updated constants.ts with ${storeId}` : ""}

To run the crawler:
  tsx ${crawlerFile}
`);
}

if (require.main === module) {
  main().catch(console.error);
}

