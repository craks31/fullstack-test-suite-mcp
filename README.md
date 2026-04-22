# fullstack-test-suite-mcp

> Multi-agent MCP framework for automated test generation from Figma designs and Swagger/OpenAPI specs.

## Phase 1 — MCP Servers (Current)

Two MCP servers ready for IDE integration:

| Server | Tools | Purpose |
|--------|-------|---------|
| **swagger-parser** | `parse_spec`, `extract_endpoint` | Parse OpenAPI specs → structured API model |
| **karate-generator** | `generate_feature_files`, `generate_karate_config` | API model → Karate `.feature` test files |

## Quick Start

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run smoke test (parses sample spec → generates Karate tests)
npx tsx packages/shared/src/smoke-test.ts
```

## IDE Integration

### Antigravity / Gemini Code Assist

The `.gemini/settings.json` is pre-configured. After building, the MCP servers are available as tools in your IDE agent.

Example prompt:
> "Parse the OpenAPI spec at `specs/sample-openapi.yaml` using the `parse_spec` tool, then use `generate_feature_files` to create Karate tests in `./tests/api`"

### Other MCP Clients (Claude Desktop, Cursor, etc.)

Add this to your MCP client config:

```json
{
  "mcpServers": {
    "swagger-parser": {
      "command": "node",
      "args": ["packages/swagger-parser/dist/index.js"]
    },
    "karate-generator": {
      "command": "node",
      "args": ["packages/karate-generator/dist/index.js"]
    }
  }
}
```

## Project Structure

```
fullstack-test-suite-mcp/
├── packages/
│   ├── shared/              # Canonical data models (APIModel, UIPageModel)
│   ├── swagger-parser/      # MCP Server: OpenAPI → APIModel
│   └── karate-generator/    # MCP Server: APIModel → .feature files
├── specs/
│   └── sample-openapi.yaml  # Sample spec for testing
├── .gemini/settings.json    # IDE MCP config
└── tsconfig.base.json
```

## Roadmap

- [x] Phase 1: swagger-parser + karate-generator MCP servers
- [ ] Phase 2: figma-extractor + playwright-generator MCP servers
- [ ] V1 Deployment: Local CLI Orchestrator
- [ ] V2 Deployment: AWS Bedrock Agent + Lambda
