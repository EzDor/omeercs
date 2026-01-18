<!--
SYNC IMPACT REPORT
==================
Version change: 0.0.0 → 1.0.0 (MAJOR: Initial constitution adoption)

Modified principles: N/A (initial version)
Added sections:
  - I. Spec-Driven Development
  - II. Type Safety & Schema Validation
  - III. Multi-Tenant First
  - IV. Monorepo Discipline
  - V. Error Handling & Observability
  - Development Workflow
  - Quality Gates
  - Governance

Removed sections: N/A (initial version)

Templates requiring updates:
  - .specify/templates/plan-template.md ✅ (Constitution Check section already aligned)
  - .specify/templates/spec-template.md ✅ (User Stories/Requirements structure aligned)
  - .specify/templates/tasks-template.md ✅ (Phase structure supports spec-driven approach)

Follow-up TODOs: None
-->

# Agentic System Template Constitution

## Core Principles

### I. Spec-Driven Development

All features MUST begin with a specification before implementation. The development workflow follows a strict progression:

1. **Specification** (`spec.md`): Define user stories, requirements, and success criteria
2. **Planning** (`plan.md`): Technical approach, data models, and contracts
3. **Tasks** (`tasks.md`): Actionable implementation steps organized by user story
4. **Implementation**: Code written only after design artifacts are approved

**Rationale**: Specifications ensure alignment between stakeholders, prevent scope creep, and create auditable design decisions. Skipping specification leads to rework and misaligned implementations.

**Enforcement**: PRs for new features MUST include corresponding spec files in `/specs/[###-feature-name]/`. Hotfixes and bug fixes may skip specification if the change is under 50 lines and doesn't alter public interfaces.

---

### II. Type Safety & Schema Validation

All data boundaries MUST be validated using the appropriate mechanism:

- **Compile-time**: TypeScript strict mode with no `any` types in production code
- **Runtime (DTOs)**: class-validator decorators for all API request/response objects
- **Runtime (JSON Schema)**: Ajv validation for dynamic configurations (skill descriptors, policies)

**Rationale**: Type safety at compile time catches errors early; schema validation at runtime ensures data integrity for dynamic or external inputs.

**Non-negotiables**:
- `strict: true` in all tsconfig.json files
- All DTOs MUST use class-validator decorators
- External configuration files MUST have JSON Schema definitions

---

### III. Multi-Tenant First

Every entity that stores user or organizational data MUST include tenant isolation:

- `tenantId` column on all tenant-scoped database entities
- Row-Level Security (RLS) policies in PostgreSQL enforcing tenant boundaries
- TenantClsService used for context propagation across service boundaries

**Rationale**: Multi-tenancy is foundational to the platform's security model. Retrofitting tenant isolation is error-prone and risks data leakage.

**Exceptions**: System-level entities (e.g., feature flags, system configuration) may be tenant-agnostic if explicitly documented and reviewed.

**Enforcement**: Database migrations creating new tables MUST include tenantId unless explicitly approved as system-level.

---

### IV. Monorepo Discipline

The monorepo structure MUST be respected with clear package boundaries:

**Package Hierarchy** (dependency order):
```
dto → common → dao → api-center / agent-platform / webapp
```

**Rules**:
- Shared code goes in `dto`, `common`, or `dao` based on its purpose
- `api-center` and `agent-platform` MUST NOT import from each other
- `webapp` MUST NOT import from backend packages (use DTOs for type sharing)
- New packages require explicit justification and approval

**Rationale**: Clear boundaries prevent circular dependencies, enable independent deployment, and keep build times predictable.

---

### V. Error Handling & Observability

All errors MUST be handled consistently and observably:

**Error Handling**:
- Services return result objects (`{ ok: true, data }` or `{ ok: false, error }`) for expected failures
- Exceptions are reserved for unexpected conditions
- Error responses include error type, message, and debug context sufficient for diagnosis

**Observability**:
- All service operations MUST emit structured logs with correlation IDs
- LangGraph workflows MUST use LangSmith tracing when enabled
- Metrics for latency, throughput, and error rates on all public endpoints

**Rationale**: Consistent error handling enables automated recovery; observability enables debugging without reproducing issues in production.

---

## Development Workflow

### Feature Development Process

1. **Create feature branch**: `git checkout -b [###-feature-name]`
2. **Run `/speckit.specify`**: Generate specification from description
3. **Run `/speckit.clarify`**: Resolve ambiguities through Q&A
4. **Run `/speckit.plan`**: Generate technical design artifacts
5. **Run `/speckit.tasks`**: Generate actionable task list
6. **Implement by user story**: Complete P1 → P2 → P3 in order
7. **Run `/speckit.analyze`**: Verify cross-artifact consistency
8. **Create PR**: Include spec files and implementation

### Code Review Requirements

- All PRs MUST be reviewed before merge
- Constitution compliance MUST be verified (use Constitution Check in plan.md)
- Breaking changes MUST be documented in PR description

---

## Quality Gates

| Gate | Requirement | Enforcement |
|------|-------------|-------------|
| Type Safety | No TypeScript errors | CI build fails on type errors |
| Linting | ESLint passes with zero warnings | Pre-commit hook + CI |
| DTO Validation | All DTOs have class-validator decorators | Code review |
| Schema Validation | Dynamic configs have JSON Schema | Code review |
| Multi-tenancy | New entities include tenantId | Migration review |
| Tests | Unit tests for business logic | Code review |
| Documentation | Public APIs documented | Code review |

---

## Governance

### Amendment Process

1. Propose amendment via PR to this constitution file
2. Include rationale and impact assessment
3. Require approval from at least one project maintainer
4. Update version according to semantic versioning:
   - **MAJOR**: Principle removal or redefinition
   - **MINOR**: New principle or section added
   - **PATCH**: Clarification or wording improvement

### Compliance

- This constitution supersedes conflicting practices in other documentation
- CLAUDE.md provides runtime guidance aligned with these principles
- Violations MUST be justified in Complexity Tracking section of plan.md

### Versioning Policy

All artifacts reference constitution version for traceability. When constitution changes, existing features are not required to update unless explicitly noted in the amendment.

**Version**: 1.0.0 | **Ratified**: 2026-01-18 | **Last Amended**: 2026-01-18
