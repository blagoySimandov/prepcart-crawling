#!/usr/bin/env tsx

import { firebaseBrochureService } from "./firebase-service.js";

interface UtilityCommand {
  name: string;
  description: string;
  action: (args: string[]) => Promise<void>;
}

const commands: UtilityCommand[] = [
  {
    name: "check",
    description: "Check if a brochure ID has been crawled",
    action: async (args: string[]) => {
      if (args.length < 1) {
        console.log("Usage: tsx firebase-utils.ts check <brochure-id>");
        return;
      }

      const brochureId = args[0];
      console.log(`🔍 Checking brochure ID: ${brochureId}`);

      const exists = await firebaseBrochureService.isBrochureCrawled(
        brochureId
      );
      if (exists) {
        console.log(`✅ Brochure ${brochureId} has been crawled`);

        const record = await firebaseBrochureService.getBrochureRecord(
          brochureId
        );
        if (record) {
          console.log(`📋 Details:`);
          console.log(`   Store: ${record.storeId}`);
          console.log(`   Country: ${record.country}`);
          console.log(`   Crawled: ${record.crawledAt.toISOString()}`);
          console.log(
            `   Valid: ${record.startDate.toDateString()} - ${record.endDate.toDateString()}`
          );
          console.log(`   Images: ${record.imageCount || "N/A"}`);
          console.log(`   Local file: ${record.filename || "N/A"}`);
          console.log(`   Cloud path: ${record.cloudStoragePath || "N/A"}`);
        }
      } else {
        console.log(`❌ Brochure ${brochureId} has not been crawled`);
      }
    },
  },
  {
    name: "list",
    description: "List brochures for a store",
    action: async (args: string[]) => {
      if (args.length < 2) {
        console.log(
          "Usage: tsx firebase-utils.ts list <store-id> <country> [limit]"
        );
        console.log(
          "Example: tsx firebase-utils.ts list fantastico-bg bulgaria 10"
        );
        return;
      }

      const storeId = args[0];
      const country = args[1];
      const limit = args[2] ? parseInt(args[2]) : 10;

      console.log(
        `📋 Listing brochures for ${storeId} in ${country} (limit: ${limit})`
      );

      const records = await firebaseBrochureService.getBrochuresByStore(
        storeId,
        country,
        limit
      );

      if (records.length === 0) {
        console.log(`❌ No brochures found for ${storeId} in ${country}`);
        return;
      }

      console.log(`✅ Found ${records.length} brochures:`);
      records.forEach((record, index) => {
        console.log(`\n${index + 1}. Brochure ID: ${record.brochureId}`);
        console.log(`   Crawled: ${record.crawledAt.toISOString()}`);
        console.log(
          `   Valid: ${record.startDate.toDateString()} - ${record.endDate.toDateString()}`
        );
        console.log(`   Images: ${record.imageCount || "N/A"}`);
        if (record.cloudStoragePath) {
          console.log(`   Cloud: ${record.cloudStoragePath}`);
        }
      });
    },
  },
  {
    name: "delete",
    description: "Delete a brochure record (be careful!)",
    action: async (args: string[]) => {
      if (args.length < 1) {
        console.log("Usage: tsx firebase-utils.ts delete <brochure-id>");
        return;
      }

      const brochureId = args[0];
      console.log(`⚠️ Deleting brochure record: ${brochureId}`);

      const result = await firebaseBrochureService.deleteBrochureRecord(
        brochureId
      );
      if (result) {
        console.log(`✅ Brochure record ${brochureId} deleted successfully`);
      } else {
        console.log(
          `❌ Failed to delete brochure record ${brochureId} (not found or error)`
        );
      }
    },
  },
];

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("🔧 Firebase Brochure Management Utility");
    console.log("\nAvailable commands:");
    commands.forEach((cmd) => {
      console.log(`  ${cmd.name.padEnd(10)} - ${cmd.description}`);
    });
    console.log("\nExamples:");
    console.log("  tsx crawlers/firebase-utils.ts check 5550356");
    console.log(
      "  tsx crawlers/firebase-utils.ts list fantastico-bg bulgaria 5"
    );
    console.log("  tsx crawlers/firebase-utils.ts delete 5550356");
    return;
  }

  const commandName = args[0];
  const commandArgs = args.slice(1);

  const command = commands.find((cmd) => cmd.name === commandName);
  if (!command) {
    console.log(`❌ Unknown command: ${commandName}`);
    console.log(
      "Available commands:",
      commands.map((cmd) => cmd.name).join(", ")
    );
    return;
  }

  try {
    await command.action(commandArgs);
  } catch (error) {
    console.error(`❌ Error executing command ${commandName}:`, error);
    process.exit(1);
  }
}

// Make this script executable
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
