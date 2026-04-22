/**
 * @module @fullstack-test-suite/shared
 *
 * Canonical data models shared across all MCP servers in the framework.
 * These interfaces define the "contract" between:
 *   - Input agents  (swagger-parser, figma-extractor)
 *   - Output agents (karate-generator, playwright-generator)
 */

// ─────────────────────────────────────────────
// API Model — Output of swagger-parser
// ─────────────────────────────────────────────

export interface APIModel {
  title: string;
  version: string;
  baseUrl: string;
  endpoints: APIEndpoint[];
  schemas: Record<string, JSONSchemaDefinition>;
}

export interface APIEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  operationId?: string;
  summary: string;
  tags: string[];
  parameters: APIParameter[];
  requestBody?: RequestBody;
  responses: Record<string, APIResponse>;
  security?: SecurityRequirement[];
}

export interface APIParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema: JSONSchemaDefinition;
  example?: unknown;
}

export interface RequestBody {
  contentType: string;
  required: boolean;
  schema: JSONSchemaDefinition;
  example?: unknown;
}

export interface APIResponse {
  statusCode: string;
  description: string;
  schema?: JSONSchemaDefinition;
  example?: unknown;
}

export interface SecurityRequirement {
  schemeName: string;
  type: "apiKey" | "http" | "oauth2" | "openIdConnect";
  scheme?: string; // "bearer", "basic", etc.
  bearerFormat?: string;
  in?: "header" | "query" | "cookie";
  name?: string; // header/query param name for apiKey
}

/**
 * Minimal JSON Schema representation — enough to drive
 * Karate matchers and Playwright form-fill logic.
 */
export interface JSONSchemaDefinition {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object";
  format?: string; // "email", "date-time", "uuid", etc.
  properties?: Record<string, JSONSchemaDefinition>;
  items?: JSONSchemaDefinition;
  required?: string[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  description?: string;
  example?: unknown;
  nullable?: boolean;
  $ref?: string; // resolved before reaching this interface, but kept for traceability
}

// ─────────────────────────────────────────────
// UI Model — Output of figma-extractor (Phase 2)
// ─────────────────────────────────────────────

export interface UIPageModel {
  pageName: string;
  url?: string;
  elements: UIElement[];
}

export interface UIElement {
  id: string;
  name: string;
  type:
    | "button"
    | "input"
    | "text"
    | "link"
    | "image"
    | "container"
    | "form"
    | "select"
    | "checkbox"
    | "radio"
    | "unknown";
  semanticRole?: string;
  textContent?: string;
  placeholder?: string;
  children?: UIElement[];
  boundingBox: { x: number; y: number; width: number; height: number };
  properties: Record<string, string>;
}

// ─────────────────────────────────────────────
// Karate Generation Config
// ─────────────────────────────────────────────

export interface KarateGenerationConfig {
  outputDir: string;
  groupBy: "tag" | "path";
  baseUrl: string;
  environments?: Record<string, string>;
}
