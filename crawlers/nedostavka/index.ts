import { parseNextData } from "parse-hydration-data";
import { writeObjectToFile } from "../util.js";
import { execSync } from "child_process";

function getCurlDataSync(): string {
  try {
    // Use -s to suppress verbose output if you only want the data
    const data = execSync("curl -s https://prices.nedostavka.net/en/search?query=38925340", {
      encoding: "utf-8",
    });

    return data;
  } catch (error: any) {
    throw new Error(`Curl command failed: ${error.message}`);
  }
}

(async () => {
  const data = getCurlDataSync();
  console.log(data);
  const fullData = parseNextData(data);
  writeObjectToFile(fullData);
})();
