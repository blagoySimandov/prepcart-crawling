import { Storage } from "@google-cloud/storage";
import { BUCKET_NAME } from "./constants.js";

const storage = new Storage();

export async function storePdf(
  storeId: string,
  country: string,
  startDate: Date,
  endDate: Date,
  content: string,
  brochureId?: string,
) {
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
  const filename = `brochures/${storeId}_${country}_${startDateString}_${endDateString}_${brochureId}.pdf`;
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(filename);

  const buffer = Buffer.from(content, "base64");

  try {
    await file.save(buffer, {
      metadata: {
        contentType: "application/pdf",
        contentEncoding: null,
        cacheControl: "public, max-age=31536000",
      },
      resumable: true,
      validation: "crc32c",
      gzip: false,
    });

    return `gs://${BUCKET_NAME}/${filename}`;
  } catch (error) {
    console.error("Error uploading PDF:", error);
    throw error;
  }
}

export async function pdfExists(
  storeId: string,
  country: string,
  startDate: Date,
  endDate: Date,
  brochureId?: string,
): Promise<boolean> {
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
  const filename = `brochures/${storeId}_${country}_${startDateString}_${endDateString}_${brochureId}.pdf`;
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(filename);

  const [exists] = await file.exists();
  return exists;
}
