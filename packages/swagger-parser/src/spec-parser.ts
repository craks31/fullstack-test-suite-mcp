/**
 * spec-parser.ts
 *
 * Wraps @apidevtools/swagger-parser to convert an OpenAPI 3.x / Swagger 2.0
 * spec file into our canonical APIModel.
 *
 * Design decisions:
 *   - All $ref pointers are fully dereferenced before mapping.
 *   - allOf/oneOf/anyOf are flattened into a single schema where possible.
 *   - Examples are extracted from the spec when available.
 */

import SwaggerParser from "@apidevtools/swagger-parser";
import { type OpenAPI, OpenAPIV3 } from "openapi-types";
import type {
  APIModel,
  APIEndpoint,
  APIParameter,
  APIResponse,
  RequestBody,
  SecurityRequirement,
  JSONSchemaDefinition,
} from "@fullstack-test-suite/shared";
import {
  generateExampleValue,
  generateExampleObject,
} from "@fullstack-test-suite/shared";

/**
 * Parse an OpenAPI spec file and return a normalized APIModel.
 */
export async function parseSpec(specPath: string): Promise<APIModel> {
  // Dereference resolves all $ref pointers into inline definitions
  const api = (await SwaggerParser.dereference(specPath)) as OpenAPIV3.Document;

  const title = api.info?.title ?? "Untitled API";
  const version = api.info?.version ?? "0.0.0";
  const baseUrl = extractBaseUrl(api);
  const securitySchemes = extractSecuritySchemes(api);
  const endpoints = extractEndpoints(api, securitySchemes);
  const schemas = extractSchemas(api);

  return { title, version, baseUrl, endpoints, schemas };
}

/**
 * Extract a single endpoint's details by method + path.
 */
export async function extractSingleEndpoint(
  specPath: string,
  method: string,
  path: string
): Promise<APIEndpoint | null> {
  const model = await parseSpec(specPath);
  const normalizedMethod = method.toUpperCase();
  return (
    model.endpoints.find(
      (ep) => ep.method === normalizedMethod && ep.path === path
    ) ?? null
  );
}

// ─── Internal helpers ──────────────────────────

function extractBaseUrl(api: OpenAPIV3.Document): string {
  if (api.servers && api.servers.length > 0) {
    return api.servers[0].url;
  }
  return "http://localhost:8080";
}

function extractSecuritySchemes(
  api: OpenAPIV3.Document
): Map<string, SecurityRequirement> {
  const map = new Map<string, SecurityRequirement>();
  const schemes = api.components?.securitySchemes;
  if (!schemes) return map;

  for (const [name, schemeOrRef] of Object.entries(schemes)) {
    // After dereference, there should be no $ref left
    const scheme = schemeOrRef as OpenAPIV3.SecuritySchemeObject;
    map.set(name, {
      schemeName: name,
      type: scheme.type as SecurityRequirement["type"],
      scheme: "scheme" in scheme ? (scheme as OpenAPIV3.HttpSecurityScheme).scheme : undefined,
      bearerFormat:
        "bearerFormat" in scheme
          ? (scheme as OpenAPIV3.HttpSecurityScheme).bearerFormat
          : undefined,
      in: "in" in scheme ? (scheme as OpenAPIV3.ApiKeySecurityScheme).in as SecurityRequirement["in"] : undefined,
      name: "name" in scheme ? (scheme as OpenAPIV3.ApiKeySecurityScheme).name : undefined,
    });
  }
  return map;
}

function extractEndpoints(
  api: OpenAPIV3.Document,
  securitySchemes: Map<string, SecurityRequirement>
): APIEndpoint[] {
  const endpoints: APIEndpoint[] = [];
  const paths = api.paths ?? {};

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue;
    const methods: OpenAPIV3.HttpMethods[] = [
      OpenAPIV3.HttpMethods.GET,
      OpenAPIV3.HttpMethods.POST,
      OpenAPIV3.HttpMethods.PUT,
      OpenAPIV3.HttpMethods.PATCH,
      OpenAPIV3.HttpMethods.DELETE,
    ];

    for (const method of methods) {
      const operation = (pathItem as Record<string, unknown>)[method] as
        | OpenAPIV3.OperationObject
        | undefined;
      if (!operation) continue;

      // Merge path-level and operation-level parameters
      const pathParams = ((pathItem as OpenAPIV3.PathItemObject).parameters ?? []) as OpenAPIV3.ParameterObject[];
      const opParams = (operation.parameters ?? []) as OpenAPIV3.ParameterObject[];
      const mergedParams = dedupeParameters([...pathParams, ...opParams]);

      const endpoint: APIEndpoint = {
        method: method.toUpperCase() as APIEndpoint["method"],
        path,
        operationId: operation.operationId,
        summary: operation.summary ?? operation.description ?? "",
        tags: operation.tags ?? [],
        parameters: mergedParams.map(mapParameter),
        requestBody: mapRequestBody(operation.requestBody as OpenAPIV3.RequestBodyObject | undefined),
        responses: mapResponses(operation.responses as OpenAPIV3.ResponsesObject),
        security: mapSecurity(operation.security, securitySchemes),
      };
      endpoints.push(endpoint);
    }
  }
  return endpoints;
}

function dedupeParameters(
  params: OpenAPIV3.ParameterObject[]
): OpenAPIV3.ParameterObject[] {
  const seen = new Map<string, OpenAPIV3.ParameterObject>();
  // Later entries (operation-level) override earlier (path-level)
  for (const p of params) {
    seen.set(`${p.in}:${p.name}`, p);
  }
  return Array.from(seen.values());
}

function mapParameter(param: OpenAPIV3.ParameterObject): APIParameter {
  return {
    name: param.name,
    in: param.in as APIParameter["in"],
    required: param.required ?? false,
    schema: mapSchema(param.schema as OpenAPIV3.SchemaObject | undefined),
    example: param.example,
  };
}

function mapRequestBody(
  body: OpenAPIV3.RequestBodyObject | undefined
): RequestBody | undefined {
  if (!body) return undefined;

  const content = body.content ?? {};
  // Prefer application/json, fall back to first content type
  const contentType =
    "application/json" in content
      ? "application/json"
      : Object.keys(content)[0];

  if (!contentType || !content[contentType]) return undefined;

  const mediaType = content[contentType];
  return {
    contentType,
    required: body.required ?? false,
    schema: mapSchema(mediaType.schema as OpenAPIV3.SchemaObject | undefined),
    example: mediaType.example ?? generateExampleFromOpenAPISchema(mediaType.schema as OpenAPIV3.SchemaObject | undefined),
  };
}

function mapResponses(
  responses: OpenAPIV3.ResponsesObject
): Record<string, APIResponse> {
  const result: Record<string, APIResponse> = {};

  for (const [statusCode, responseOrRef] of Object.entries(responses)) {
    const response = responseOrRef as OpenAPIV3.ResponseObject;
    const content = response.content ?? {};
    const jsonContent = content["application/json"];

    result[statusCode] = {
      statusCode,
      description: response.description ?? "",
      schema: jsonContent
        ? mapSchema(jsonContent.schema as OpenAPIV3.SchemaObject | undefined)
        : undefined,
      example: jsonContent?.example,
    };
  }
  return result;
}

function mapSecurity(
  security: OpenAPIV3.SecurityRequirementObject[] | undefined,
  schemes: Map<string, SecurityRequirement>
): SecurityRequirement[] | undefined {
  if (!security || security.length === 0) return undefined;

  const result: SecurityRequirement[] = [];
  for (const req of security) {
    for (const schemeName of Object.keys(req)) {
      const scheme = schemes.get(schemeName);
      if (scheme) result.push(scheme);
    }
  }
  return result.length > 0 ? result : undefined;
}

/**
 * Map an OpenAPI SchemaObject to our simplified JSONSchemaDefinition.
 */
function mapSchema(
  schema: OpenAPIV3.SchemaObject | undefined
): JSONSchemaDefinition {
  if (!schema) return { type: "object" };

  const result: JSONSchemaDefinition = {};

  if (schema.type) result.type = schema.type as JSONSchemaDefinition["type"];
  if (schema.format) result.format = schema.format;
  if (schema.description) result.description = schema.description;
  if (schema.enum) result.enum = schema.enum;
  if (schema.example !== undefined) result.example = schema.example;
  if (schema.nullable) result.nullable = schema.nullable;
  if (schema.minimum !== undefined) result.minimum = schema.minimum;
  if (schema.maximum !== undefined) result.maximum = schema.maximum;
  if (schema.minLength !== undefined) result.minLength = schema.minLength;
  if (schema.maxLength !== undefined) result.maxLength = schema.maxLength;
  if (schema.pattern) result.pattern = schema.pattern;
  if (schema.required) result.required = schema.required;

  // Recurse into object properties
  if (schema.properties) {
    result.properties = {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      result.properties[key] = mapSchema(
        propSchema as OpenAPIV3.SchemaObject
      );
    }
  }

  // Recurse into array items
  if ("items" in schema && schema.items) {
    result.items = mapSchema(schema.items as OpenAPIV3.SchemaObject);
  }

  return result;
}

/**
 * Thin adapter: converts an OpenAPIV3.SchemaObject to our JSONSchemaDefinition
 * and delegates to the shared example generator.
 * Needed because swagger-parser works with OpenAPI types before mapping.
 */
function generateExampleFromOpenAPISchema(
  schema: OpenAPIV3.SchemaObject | undefined
): unknown {
  if (!schema) return {};
  // mapSchema converts OpenAPIV3.SchemaObject → JSONSchemaDefinition
  const mapped = mapSchema(schema);
  return mapped.type === "object"
    ? generateExampleObject(mapped)
    : generateExampleValue(mapped);
}

function extractSchemas(
  api: OpenAPIV3.Document
): Record<string, JSONSchemaDefinition> {
  const result: Record<string, JSONSchemaDefinition> = {};
  const schemas = api.components?.schemas;
  if (!schemas) return result;

  for (const [name, schema] of Object.entries(schemas)) {
    result[name] = mapSchema(schema as OpenAPIV3.SchemaObject);
  }
  return result;
}
