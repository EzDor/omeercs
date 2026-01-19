# Research: Run Engine (Workflow Orchestrator + Partial Rebuild)

**Feature**: 004-run-engine
**Date**: 2026-01-19
**Status**: Complete

## Research Questions

### 1. Canonical JSON Serialization for Deterministic Hashing

**Decision**: Use `fast-json-stable-stringify` for canonical JSON serialization

**Rationale**:
- 17,189 ops/sec - 26% faster than json-stable-stringify
- Zero dependencies - no supply chain risk
- RFC 8785 compliant - follows JSON Canonicalization Scheme standard
- TypeScript native - built-in type definitions
- Already used by Ajv (JSON schema validator in the stack)

**Installation**:
```bash
pnpm add fast-json-stable-stringify
pnpm add -D @types/fast-json-stable-stringify
```

**Implementation Pattern**:
```typescript
import stringify from 'fast-json-stable-stringify';
import { createHash } from 'node:crypto';

export class StepInputHasher {
  static computeHash(input: Record<string, unknown>): string {
    const canonical = stringify(input);
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  static createCacheKey(stepId: string, input: Record<string, unknown>): string {
    return `${stepId}:${this.computeHash(input)}`;
  }
}
```

**Alternatives Considered**: `canonical-json` (2x slower, less maintained)

---

### 2. BullMQ Parallel Job Execution for Workflow Steps

**Decision**: Use BullMQ FlowProducer with multi-worker horizontal scaling

**Rationale**:
- **Orchestrator simplicity** - One run at a time per worker, clean state management
- **Horizontal scaling** - Add more worker processes for concurrent runs
- **Parallel steps** - FlowProducer enables DAG parallelism within a run
- **Built-in coordination** - Parent jobs wait for all children before completing
- **Atomic job creation** - All flow jobs created or none (transaction-like)

**Implementation Pattern**:
```typescript
// Orchestrator worker (concurrency: 1)
@Processor(QueueNames.RUN_ORCHESTRATION, { concurrency: 1 })
export class RunOrchestratorProcessor extends WorkerHost {
  // Each worker processes 1 run at a time
}

// Step worker (concurrency: 10)
@Processor(QueueNames.RUN_STEPS, { concurrency: 10 })
export class RunStepProcessor extends WorkerHost {
  // Steps are IO-heavy (LLM calls), high concurrency is safe
}
```

**Scaling Strategy**:
- 2-3 orchestrator workers (concurrency=1 each) for 2-3 concurrent runs
- 2-4 step workers (concurrency=10 each) for parallel step execution
- Add workers horizontally as needed

**Alternatives Considered**: Single processor with async coordination (complex, error-prone)

---

### 3. DAG Topological Sort

**Decision**: Use `typescript-graph` library

**Rationale**:
- Purpose-built for DAGs with DirectedAcyclicGraph class
- Built-in cycle detection (throws on cycles)
- Type-safe API with native TypeScript implementation
- Minimal dependencies, lightweight addition
- Clean API for topological sort and traversal

**Installation**:
```bash
pnpm add typescript-graph
```

**Implementation Pattern**:
```typescript
import { DirectedAcyclicGraph } from 'typescript-graph';

export class DependencyGraphService {
  topologicalSort(steps: StepSpec[]): StepSpec[] {
    const graph = new DirectedAcyclicGraph<StepSpec>(step => step.stepId);

    for (const step of steps) {
      graph.insert(step);
    }

    for (const step of steps) {
      for (const depId of step.dependsOn) {
        graph.addEdge(nodeMap.get(depId)!, step);
      }
    }

    return graph.topologicallySortedNodes();
  }

  downstreamClosure(allSteps: StepSpec[], changedStepIds: string[]): Set<string> {
    // BFS from changed steps to find all downstream dependents
    const closure = new Set<string>(changedStepIds);
    const queue = [...changedStepIds];

    while (queue.length > 0) {
      const stepId = queue.shift()!;
      for (const step of allSteps) {
        if (step.dependsOn.includes(stepId) && !closure.has(step.stepId)) {
          closure.add(step.stepId);
          queue.push(step.stepId);
        }
      }
    }

    return closure;
  }
}
```

**Alternatives Considered**: Hand-rolled Kahn's algorithm (more code, harder to maintain)

---

### 4. Step Cache Strategy

**Decision**: Hybrid Redis + Database approach with content-addressed keys

**Rationale**:
- **Redis for hot cache** - Fast lookup (~1ms) with TTL (24-48 hours)
- **Database for cold cache** - Long-term storage without TTL, durable
- **Content-addressed keys** - Cache invalidation by input hash change (automatic)
- **Cache promotion** - DB hits promoted to Redis for future fast access

**Cache Key Format**: `{workflowName}:{stepId}:{inputHash}`

**TTL Strategy**:
| Step Type | TTL | Rationale |
|-----------|-----|-----------|
| LLM-generated | 48 hours | Unlikely to regenerate identically |
| Template-based | 24 hours | Config changes affect output |
| Deterministic | 6 hours | Frequent updates expected |

**Implementation Pattern**:
```typescript
export class StepCacheService {
  async getCachedResult(workflowName, stepId, input): Promise<string[] | null> {
    const cacheKey = this.buildCacheKey(workflowName, stepId, input);

    // 1. Try Redis (fast path)
    const redisResult = await this.redis.get(cacheKey);
    if (redisResult) return JSON.parse(redisResult);

    // 2. Fallback to database (cold cache)
    const dbResult = await this.stepCacheRepository.findOne({ where: { cacheKey } });
    if (dbResult) {
      // Promote to Redis
      await this.redis.setex(cacheKey, 60 * 60 * 24, JSON.stringify(dbResult.artifactIds));
      return dbResult.artifactIds;
    }

    return null;
  }
}
```

**Cache Stampede Prevention**: Use Redis SETNX for locking during computation

**Alternatives Considered**: Redis-only (no durability), Database-only (slow hot path)

---

### 5. Idempotent Step Execution

**Decision**: Use Redis SETNX + Database upsert pattern

**Rationale**:
- **Redis SETNX** - Atomic execution lock, prevents duplicate processing
- **Database upsert** - Idempotent writes with conflict handling
- **Content-addressed storage** - Same input → same output → safe retry
- **Status tracking** - DB status prevents re-execution of completed steps

**Implementation Patterns**:

**Pattern 1: Execution Lock**
```typescript
async executeStepIdempotent(runId, stepId, input): Promise<StepResult> {
  const inputHash = StepInputHasher.computeHash(input);
  const idempotencyKey = `exec:${runId}:${stepId}:${inputHash}`;

  const lockAcquired = await this.redis.set(idempotencyKey, 'processing', 'NX', 'EX', 600);

  if (!lockAcquired) {
    // Another worker is processing or already processed
    return await this.waitForStepResult(runId, stepId);
  }

  try {
    const result = await this.skillRunner.execute(stepId, input);
    await this.redis.setex(idempotencyKey, 86400, 'completed');
    return result;
  } catch (error) {
    await this.redis.del(idempotencyKey); // Release lock for retry
    throw error;
  }
}
```

**Pattern 2: Database Status Check**
```typescript
async process(job: Job<StepJobData>): Promise<StepResult> {
  const { runId, stepId } = job.data;

  const existing = await this.runStepRepository.findOne({
    where: { runId, stepId, status: In(['completed', 'running']) }
  });

  if (existing?.status === 'completed') {
    return existing.result; // Already done
  }

  // Execute...
}
```

**Retry Strategy**: BullMQ exponential backoff (3s, 6s, 12s, 24s, 48s) with max 5 attempts

---

## Technology Stack Summary

| Component | Library/Pattern | Version | Rationale |
|-----------|----------------|---------|-----------|
| JSON Canonicalization | `fast-json-stable-stringify` | ^2.1.0 | 17K ops/sec, RFC 8785 |
| Hashing | Node.js `crypto` | Built-in | SHA-256, fast |
| DAG Operations | `typescript-graph` | ^2.0.0 | Type-safe, cycle detection |
| Job Queue | BullMQ (existing) | ^5.x | FlowProducer for DAG execution |
| Hot Cache | Redis/Valkey (existing) | - | TTL-based, fast |
| Cold Cache | PostgreSQL (existing) | - | Durable, no TTL |
| Idempotency | Redis SETNX + DB upsert | - | Atomic operations |

## Performance Targets

| Metric | Target | Strategy |
|--------|--------|----------|
| Initial workflow | <2 minutes | Parallel step execution |
| Update workflow | <30 seconds | 60-80% cache hit rate |
| Cache hit rate | >70% | Content-addressed caching |
| Step retry success | >95% | Idempotent operations |
| Concurrent runs | 10-20 | Horizontal worker scaling |

## Dependencies to Install

```bash
# New dependencies for Run Engine
pnpm --filter agent-platform add fast-json-stable-stringify typescript-graph
pnpm --filter agent-platform add -D @types/fast-json-stable-stringify
```

## Sources

- [fast-json-stable-stringify npm](https://www.npmjs.com/package/fast-json-stable-stringify)
- [RFC 8785 JCS Standard](https://www.rfc-editor.org/rfc/rfc8785)
- [typescript-graph npm](https://www.npmjs.com/package/typescript-graph)
- [BullMQ Flows Documentation](https://docs.bullmq.io/guide/flows)
- [BullMQ Concurrency Documentation](https://docs.bullmq.io/guide/workers/concurrency)
- [Redis Cache Best Practices](https://thelinuxcode.com/redis-cache-in-2026-fast-paths-fresh-data-and-a-modern-dx/)
