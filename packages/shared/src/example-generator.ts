/**
 * example-generator.ts
 *
 * Shared utility for generating realistic example/mock values
 * from JSONSchemaDefinition. Used by:
 *   - swagger-parser: to fill in missing examples during spec parsing
 *   - karate-generator: to build request bodies in .feature files
 *   - playwright-generator (Phase 2): to fill form fields in test specs
 *
 * Single Source of Truth — avoids duplicate switch(schema.type) logic
 * across multiple packages.
 */

import type { JSONSchemaDefinition } from "./types.js";

/**
 * Generate a realistic example value for a single schema field.
 */
export function generateExampleValue(schema: JSONSchemaDefinition): unknown {
  if (schema.example !== undefined) return schema.example;

  switch (schema.type) {
    case "string":
      if (schema.enum && schema.enum.length > 0) return schema.enum[0];
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "date-time") return "2026-01-15T10:30:00Z";
      if (schema.format === "uuid")
        return "550e8400-e29b-41d4-a716-446655440000";
      if (schema.format === "uri") return "https://example.com";
      return "example-value";
    case "integer":
      return schema.minimum ?? 1;
    case "number":
      return schema.minimum ?? 1.0;
    case "boolean":
      return true;
    case "array":
      return schema.items ? [generateExampleValue(schema.items)] : [];
    case "object":
      return generateExampleObject(schema);
    default:
      return "example";
  }
}

/**
 * Generate a complete example object from an object schema,
 * recursively populating all nested properties.
 */
export function generateExampleObject(
  schema: JSONSchemaDefinition
): Record<string, unknown> {
  if (!schema.properties) return {};

  const obj: Record<string, unknown> = {};
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    if (propSchema.type === "object" && propSchema.properties) {
      obj[key] = generateExampleObject(propSchema);
    } else if (propSchema.type === "array") {
      obj[key] = propSchema.items
        ? [generateExampleValue(propSchema.items)]
        : [];
    } else {
      obj[key] = generateExampleValue(propSchema);
    }
  }
  return obj;
}
