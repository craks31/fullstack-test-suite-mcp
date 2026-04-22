#!/usr/bin/env node

/**
 * Swagger Parser MCP Server
 *
 * Exposes OpenAPI/Swagger spec parsing as MCP tools that any
 * MCP-compatible agent (IDE, CLI orchestrator, Bedrock) can invoke.
 *
 * Tools:
 *   - parse_spec:        Parse a full OpenAPI spec → APIModel
 *   - extract_endpoint:  Extract a single endpoint by method + path
 *
 * Resources:
 *   - swagger://spec/endpoints  List all endpoints (method + path)
 *
 * Transport: stdio (launched as a subprocess by the MCP host)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseSpec, extractSingleEndpoint } from "./spec-parser.js";

const server = new McpServer({
  name: "swagger-parser",
  version: "1.0.0",
});

// ─── Tool: parse_spec ──────────────────────────
server.tool(
  "parse_spec",
  "Parse a full OpenAPI/Swagger specification file and return a structured API model with all endpoints, schemas, parameters, request/response bodies, and security requirements.",
  {
    specPath: z
      .string()
      .describe(
        "Absolute or relative path to the OpenAPI spec file (YAML or JSON)"
      ),
  },
  async ({ specPath }) => {
    try {
      const model = await parseSpec(specPath);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(model, null, 2),
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
            text: `Error parsing spec: ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool: extract_endpoint ────────────────────
server.tool(
  "extract_endpoint",
  "Extract detailed information for a single API endpoint from an OpenAPI spec, identified by HTTP method and path.",
  {
    specPath: z
      .string()
      .describe("Path to the OpenAPI spec file"),
    method: z
      .string()
      .describe("HTTP method (GET, POST, PUT, PATCH, DELETE)"),
    path: z
      .string()
      .describe("API path (e.g., /api/orders/{orderId})"),
  },
  async ({ specPath, method, path }) => {
    try {
      const endpoint = await extractSingleEndpoint(specPath, method, path);
      if (!endpoint) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Endpoint not found: ${method.toUpperCase()} ${path}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(endpoint, null, 2),
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
            text: `Error extracting endpoint: ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Resource: endpoint listing ────────────────
server.resource(
  "endpoint-list",
  "swagger://spec/endpoints",
  {
    description:
      "List all available API endpoints with their HTTP method and path. Requires a prior parse_spec call to populate the data.",
    mimeType: "application/json",
  },
  async () => {
    return {
      contents: [
        {
          uri: "swagger://spec/endpoints",
          mimeType: "application/json",
          text: JSON.stringify({
            message:
              "Use the parse_spec tool first with a spec file path. The tool returns all endpoints inline.",
          }),
        },
      ],
    };
  }
);

// ─── Start server ──────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Swagger Parser MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
