import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
const DEFAULT_PROJECT_ID = "prepcart-prod";
export class SecretsManager {
  private client: SecretManagerServiceClient;
  private projectId: string;

  constructor(projectId?: string) {
    this.client = new SecretManagerServiceClient();
    this.projectId =
      projectId || process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_PROJECT_ID;

    if (!this.projectId) {
      throw new Error(
        "Project ID is required. Set GOOGLE_CLOUD_PROJECT environment variable or pass it to constructor.",
      );
    }
  }

  async getSecret(
    secretName: string,
    version: string = "latest",
  ): Promise<string> {
    try {
      const name = `projects/${this.projectId}/secrets/${secretName}/versions/${version}`;

      const [response] = await this.client.accessSecretVersion({
        name: name,
      });

      const payload = response.payload?.data?.toString();
      if (!payload) {
        throw new Error(`Secret ${secretName} has no payload`);
      }

      return payload.trim();
    } catch (error) {
      console.error(`Failed to get secret ${secretName}:`, error);
      throw new Error(
        `Failed to retrieve secret ${secretName}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async getWebshareApiToken(): Promise<string> {
    return this.getSecret("webshare-api-token");
  }
}

