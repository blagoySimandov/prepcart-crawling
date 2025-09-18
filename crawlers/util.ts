import * as fs from "fs";

export function writeObjectToFile(products: object, filename: string = "product_data.json") {
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
