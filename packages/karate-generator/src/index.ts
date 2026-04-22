#!/usr/bin/env node

/**
 * Karate Generator MCP Server
 *
 * Exposes Karate test generation as MCP tools that any
 * MCP-compatible agent can invoke.
 *
 * Tools:
 *   - generate_feature_files:  APIModel → .feature files on disk
 *   - generate_karate_config:  APIModel → karate-config.js
 *
 * Transport: stdio
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  generateFeatureFiles,
  generateKarateConfig,
} from "./feature-builder.js";
import type { APIModel } from "@fullstack-test-suite/shared";

const server = new McpServer({
  name: "karate-generator",
  version: "1.0.0",
});

// ─── Tool: generate_feature_files ──────────────
server.tool(
  "generate_feature_files",
  "Generate Karate DSL .feature test files from a structured API model (the output of the swagger-parser's parse_spec tool). Writes files to disk and returns the list of generated file paths. Includes happy-path, negative validation, and 404 scenarios.",
  {
    apiModel: z
      .string()
      .describe(
        "The full APIModel JSON string (output from swagger-parser's parse_spec tool)"
      ),
    outputDir: z
      .string()
      .describe(
        "Absolute path to the directory where .feature files should be written"
      ),
    groupBy: z
      .enum(["tag", "path"])
      .optional()
      .default("tag")
      .describe(
        "How to organize feature files into subdirectories: by OpenAPI tag or by URL path segment"
      ),
  },
  async ({ apiModel: apiModelJson, outputDir, groupBy }) => {
    try {
      const apiModel: APIModel = JSON.parse(apiModelJson);
      const result = await generateFeatureFiles(apiModel, outputDir, groupBy);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                filesWritten: result.filesWritten,
                summary: result.summary,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error generating feature files: ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool: generate_karate_config ──────────────
server.tool(
  "generate_karate_config",
  "Generate a karate-config.js file with environment-based URL switching. Uses the base URL from the API model and optional environment overrides.",
  {
    apiModel: z
      .string()
      .describe("The full APIModel JSON string"),
    outputDir: z
      .string()
      .describe("Directory where karate-config.js should be written"),
    environments: z
      .string()
      .optional()
      .describe(
        'Optional JSON string of environment→URL mappings, e.g., {"local":"http://localhost:8080","staging":"https://api.staging.example.com"}'
      ),
  },
  async ({ apiModel: apiModelJson, outputDir, environments }) => {
    try {
      const apiModel: APIModel = JSON.parse(apiModelJson);
      const envMap = environments
        ? (JSON.parse(environments) as Record<string, string>)
        : undefined;
      const filePath = await generateKarateConfig(
        apiModel,
        outputDir,
        envMap
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                filePath,
                message: "karate-config.js generated successfully",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error generating karate config: ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Start server ──────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Karate Generator MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
