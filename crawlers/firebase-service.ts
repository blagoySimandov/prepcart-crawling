import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
  // Initialize with Application Default Credentials for Google Cloud environments
  initializeApp({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || "prepcart-prod",
  });
}

const db = getFirestore();

export interface BrochureRecord {
  brochureId: string;
  storeId: string;
  country: string;
  crawledAt: Date;
  startDate: Date;
  endDate: Date;
  filename?: string;
  cloudStoragePath?: string;
  imageCount?: number;
}

export class FirebaseBrochureService {
  private collection = "crawled_brochures";

  /**
   * Check if a brochure has already been crawled using the brochure ID
   */
  async isBrochureCrawled(brochureId: string): Promise<boolean> {
    try {
      const snapshot = await db
        .collection(this.collection)
        .where("brochureId", "==", brochureId)
        .limit(1)
        .get();

      return !snapshot.empty;
    } catch (error) {
      console.error("Error checking if brochure is crawled:", error);
      return false;
    }
  }

  /**
   * Get brochure record by brochure ID
   */
  async getBrochureRecord(brochureId: string): Promise<BrochureRecord | null> {
    try {
      const snapshot = await db
        .collection(this.collection)
        .where("brochureId", "==", brochureId)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      const data = doc.data();

      return {
        brochureId: data.brochureId,
        storeId: data.storeId,
        country: data.country,
        crawledAt: data.crawledAt.toDate(),
        startDate: data.startDate.toDate(),
        endDate: data.endDate.toDate(),
        filename: data.filename,
        cloudStoragePath: data.cloudStoragePath,
        imageCount: data.imageCount,
      };
    } catch (error) {
      console.error("Error getting brochure record:", error);
      return null;
    }
  }

  /**
   * Store brochure information after successful crawling
   */
  async storeBrochureRecord(record: BrochureRecord): Promise<void> {
    try {
      await db.collection(this.collection).add({
        brochureId: record.brochureId,
        storeId: record.storeId,
        country: record.country,
        crawledAt: record.crawledAt,
        startDate: record.startDate,
        endDate: record.endDate,
        filename: record.filename,
        cloudStoragePath: record.cloudStoragePath,
        imageCount: record.imageCount,
      });

      console.log(`✅ Brochure record stored for ID: ${record.brochureId}`);
    } catch (error) {
      console.error("Error storing brochure record:", error);
      throw error;
    }
  }

  /**
   * Get all brochure records for a specific store and country
   */
  async getBrochuresByStore(
    storeId: string,
    country: string,
    limit: number = 50,
  ): Promise<BrochureRecord[]> {
    try {
      const snapshot = await db
        .collection(this.collection)
        .where("storeId", "==", storeId)
        .where("country", "==", country)
        .orderBy("crawledAt", "desc")
        .limit(limit)
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          brochureId: data.brochureId,
          storeId: data.storeId,
          country: data.country,
          crawledAt: data.crawledAt.toDate(),
          startDate: data.startDate.toDate(),
          endDate: data.endDate.toDate(),
          filename: data.filename,
          cloudStoragePath: data.cloudStoragePath,
          imageCount: data.imageCount,
        };
      });
    } catch (error) {
      console.error("Error getting brochures by store:", error);
      return [];
    }
  }

  /**
   * Delete brochure record (useful for cleanup or testing)
   */
  async deleteBrochureRecord(brochureId: string): Promise<boolean> {
    try {
      const snapshot = await db
        .collection(this.collection)
        .where("brochureId", "==", brochureId)
        .get();

      if (snapshot.empty) {
        console.log(`No brochure record found for ID: ${brochureId}`);
        return false;
      }

      // Delete all matching documents (should be only one, but let's be safe)
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      console.log(`🗑️ Brochure record deleted for ID: ${brochureId}`);
      return true;
    } catch (error) {
      console.error("Error deleting brochure record:", error);
      return false;
    }
  }
}

// Export a singleton instance
export const firebaseBrochureService = new FirebaseBrochureService();
