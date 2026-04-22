/**
 * schema-matcher.ts
 *
 * Maps our JSONSchemaDefinition types to Karate DSL match expressions.
 *
 * Karate matchers:
 *   #string, #number, #boolean, #array, #object, #notnull, #null, #present
 *   #regex, #uuid, #? (validation expression)
 */

import type { JSONSchemaDefinition } from "@fullstack-test-suite/shared";

/**
 * Convert a JSONSchemaDefinition to the corresponding Karate matcher string.
 *
 * Examples:
 *   { type: "string" }                    → "#string"
 *   { type: "string", format: "uuid" }    → "#uuid"
 *   { type: "integer" }                   → "#number"
 *   { type: "array", items: ... }         → "#array"
 *   { type: "object" }                    → "#object"
 *   { nullable: true, type: "string" }    → "##string"
 */
export function toKarateMatcher(schema: JSONSchemaDefinition): string {
  const nullable = schema.nullable ? "#" : "";

  if (schema.format === "uuid") return `#${nullable}uuid`;
  if (schema.format === "date-time") return `#${nullable}string`;

  switch (schema.type) {
    case "string":
      if (schema.enum && schema.enum.length > 0) {
        // Karate doesn't have a native enum matcher — use validation expr
        const values = schema.enum.map((v) => `'${v}'`).join(", ");
        return `#${nullable}? _ == ${schema.enum.length === 1 ? schema.enum[0] : `karate.match(_ , [${values}]).pass`}`;
      }
      return `#${nullable}string`;
    case "integer":
    case "number":
      return `#${nullable}number`;
    case "boolean":
      return `#${nullable}boolean`;
    case "array":
      return `#${nullable}array`;
    case "object":
      return `#${nullable}object`;
    default:
      return `#${nullable}notnull`;
  }
}

/**
 * Build a full Karate schema validation object from a JSONSchemaDefinition.
 * This generates the JSON structure used with `match response ==`.
 *
 * Example output for an Order schema:
 *   {
 *     id: "#uuid",
 *     productId: "#string",
 *     quantity: "#number",
 *     createdAt: "#string"
 *   }
 */
export function buildSchemaValidation(
  schema: JSONSchemaDefinition,
  indent: number = 6
): string {
  if (schema.type !== "object" || !schema.properties) {
    return toKarateMatcher(schema);
  }

  const pad = " ".repeat(indent);
  const innerPad = " ".repeat(indent + 2);
  const lines: string[] = ["{"];

  const entries = Object.entries(schema.properties);
  entries.forEach(([key, propSchema], idx) => {
    const matcher =
      propSchema.type === "object" && propSchema.properties
        ? buildSchemaValidation(propSchema, indent + 2)
        : toKarateMatcher(propSchema);

    const comma = idx < entries.length - 1 ? "," : "";
    lines.push(`${innerPad}${key}: '${matcher}'${comma}`);
  });

  lines.push(`${pad}}`);
  return lines.join("\n");
}

/**
 * Generate negative test case data based on schema constraints.
 * Returns an array of { field, invalidValue, reason } objects.
 */
export function generateNegativeCases(
  schema: JSONSchemaDefinition
): Array<{ field: string; invalidValue: string; reason: string }> {
  const cases: Array<{ field: string; invalidValue: string; reason: string }> =
    [];

  if (!schema.properties) return cases;

  const requiredFields = schema.required ?? [];

  for (const [field, propSchema] of Object.entries(schema.properties)) {
    // Missing required field
    if (requiredFields.includes(field)) {
      cases.push({
        field,
        invalidValue: "",
        reason: `${field} is required`,
      });
    }

    // Type-specific violations
    if (propSchema.type === "integer" || propSchema.type === "number") {
      if (propSchema.minimum !== undefined) {
        cases.push({
          field,
          invalidValue: String(propSchema.minimum - 1),
          reason: `${field} below minimum (${propSchema.minimum})`,
        });
      }
      if (propSchema.maximum !== undefined) {
        cases.push({
          field,
          invalidValue: String(propSchema.maximum + 1),
          reason: `${field} above maximum (${propSchema.maximum})`,
        });
      }
    }

    if (propSchema.type === "string") {
      if (propSchema.minLength !== undefined && propSchema.minLength > 0) {
        cases.push({
          field,
          invalidValue: '""',
          reason: `${field} below minLength (${propSchema.minLength})`,
        });
      }
    }
  }

  return cases;
}
