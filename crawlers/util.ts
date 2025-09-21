import * as fs from "fs";

export function writeObjectToFile(
  products: object,
  filename: string = "product_data.json",
) {
  fs.writeFileSync(
    filename,
    JSON.stringify(
      products,
      (key, value) => {
        // Convert BigInt to string
        if (typeof value === "bigint") {
          return value.toString();
        }
        return value;
      },
      2,
    ),
  );
}

export function randomDelay(
  min: number = 1000,
  max: number = 3000,
): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
