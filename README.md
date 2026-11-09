# GitStress Concurrency Benchmark & Verification Suite

[![Hardware Concurrency Verification Matrix](https://github.com/gitstress/gitstress-benchmark/actions/workflows/verify-matrix.yml/badge.svg)](https://github.com/gitstress/gitstress-benchmark/actions/workflows/verify-matrix.yml)
[![GitStress Platform](https://img.shields.io/badge/gitstress-v0.12.0-ea580c)](https://gitstress.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A dual-harness verification suite for [GitStress](https://gitstress.com) that evaluates concurrency failure patterns across both analytical queuing theory and empirical load testing.

This repository provides:
1. **The Software Verification Harness**: Validates that GitStress's static AST rules and 4-station Mean Value Analysis (MVA) solver correctly flag the bottleneck symbol and compute theoretical queue saturation parameters ($L = \lambda W$) without executing code.
2. **The Physical Hardware Verification Harness**: Runs isolated load-test archetypes using `autocannon` to empirically stress the specific socket, channel, and connection-pool failure patterns on physical hardware.

---

## Verification Scope & Methodology Tiers

To maintain rigorous scientific standards, results are strictly categorized across three distinct evaluation tiers:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Tier 1: Analytical Model Prediction (Static AST + Little's Law Queuing Solver)   │
│ Predicts fatal bottleneck symbol, station service demands, and theoretical knee. │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Tier 2: Isolated Archetype Microbenchmark (Targeted Code Snippet Load Test)     │
│ Isolates the exact symbol/pool in archetypes/ to verify failure mechanics.       │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Tier 3: Full Production Software Load Test (Real Binaries & End-to-End Daemons)  │
│ Runs the full msh.exe, tkngate.exe, and Next.js services under sustained load.   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

> **Important Distinction**: Testing an isolated archetype validates whether a specific architectural pattern (e.g., synchronous channel broadcast or idle connection churn) exhibits the predicted bottleneck behavior and responds to the remedy. It demonstrates the failure mechanism, but does not claim that a complex production monolith will saturate at the exact same user count without full environmental calibration.

---

## Dual Verification Matrix: Model Prediction vs. Harness Observation

Results recorded on an 8-core host (Intel Core i5-8350U @ 1.70GHz, Windows NT x64, Node v24.15.0, Go 1.26.5):

| Target Workload | Fatal Bottleneck Symbol | Theoretical MVA Ceiling ($N_{\text{fail}}$) | Applied Test Load ($N_{\text{client}}$) | Baseline Throughput | Baseline Latency (p50 / p99) | Tuned Throughput | Tuned Latency (p50 / p99) | Observed Improvement | Harness Verdict |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`msh-protocol/msh`** | `fleet.Server.handleRegister` | 2,500 c/s | 120 conns | 590 req/s | 188ms / 314ms | 3,594 req/s | 28ms / 188ms | **+6.1x throughput** (6.7x p50 drop) | **Observed in harness** |
| **`gitstress/gitstress`** | `fetcher.fetchLiveGitHubRepo` | 12,500 c/s | 120 conns | 1,074 req/s | 52ms / 425ms | 4,133 req/s | 24ms / 72ms | **+3.8x throughput** (5.9x p99 drop) | **Observed in harness** |
| **`tkngate/tkngate`** | `http.DefaultTransport` | 85 c/s | 85 conns | 2,020 req/s | 30ms / 174ms | 3,038 req/s | 25ms / 46ms | **+1.5x throughput** (3.8x p99 drop) | **Observed in harness** |
| **`calcom/cal.com`** | `bookings.syncUpcoming` | 62 c/s | 65 conns | 91 req/s | 661ms / 799ms | 785 req/s | 91ms / 110ms | **+8.6x throughput** (7.3x p99 drop) | **Observed in harness** |

Raw Telemetry Logs:
- Combined Dual Matrix: [`results/dual_verification_matrix.json`](results/dual_verification_matrix.json)
- Software AST & MVA Engine Output: [`results/software_verification.json`](results/software_verification.json)
- Physical Hardware Sweep Telemetry: [`results/benchmark_results.json`](results/benchmark_results.json)

---

## Technical Failure Mechanisms & Observed Data

### 1. `msh-protocol/msh` (Go Swarm Telemetry & Fleet Mesh)
- **Bottleneck**: Synchronous channel write loop across peer connections in `pkg/fleet/server.go`. When a peer buffer fills or encounters TCP zero-window events, the broadcast loop blocks on channel send.
- **Microbenchmark Workload**: 120 concurrent unthrottled load clients broadcasting heartbeats across registered peers.
- **Observed Baseline**: Channel head-of-line blocking inflated p50 delivery latency to 188ms and p99 to 314ms, constraining throughput to 590 req/s.
- **Observed Remedy**: Converting the channel send to a non-blocking ring buffer (`select { case n.send <- event: default: }`) increased throughput to 3,594 req/s (+6.1x) and lowered p50 latency to 28ms (6.7x faster).

### 2. `gitstress/gitstress` (MVA Analytical Ingestion Engine)
- **Bottleneck**: Outbound API socket pool contention during parallel repository ingestion (`fetcher.fetchLiveGitHubRepo`). Unbounded parallel requests exhaust Node.js global HTTP agent connection pool.
- **Microbenchmark Workload**: 120 concurrent diagnostic requests simulating parallel tree fetching.
- **Observed Baseline**: Sockets starved under burst concurrency, resulting in 3,495 HTTP 504 timeouts during the 5-second test window with p99 latency at 425ms.
- **Observed Remedy**: Dedicated Undici connection pool with socket keep-alive and in-memory LRU caching processed 4,133 clean req/s (+3.8x) with zero timeouts observed in the test window and p99 latency dropping to 72ms (5.9x faster).

### 3. `tkngate/tkngate` (Go High-Performance Reverse Proxy)
- **Bottleneck**: `http.DefaultTransport` configures `MaxIdleConnsPerHost: 2` by default in Go's standard library. This does *not* cap in-flight concurrent requests to 2, but limits the number of idle keep-alive connections preserved for subsequent requests.
- **Mechanism Under Load**: Under concurrent reverse proxy traffic, completed connections cannot be retained in the idle pool. Sockets are aggressively closed, leading to rapid ephemeral port recycling, `TIME_WAIT` socket accumulation, and TLS handshake renegotiation overhead on new requests.
- **Microbenchmark Workload**: 85 concurrent clients forwarding through the reverse proxy to an upstream backend.
- **Observed Baseline**: Connection pool eviction pushed p99 latency to 174ms at 2,020 req/s.
- **Observed Remedy**: Configured `http.Transport` with `MaxIdleConns: 10000`, `MaxIdleConnsPerHost: 2000`, and `IdleConnTimeout: 90s` cut p99 latency to 46ms (3.8x reduction) while increasing throughput to 3,038 req/s (+1.5x).

### 4. `calcom/cal.com` (Node.js Prisma Pool Starvation)
- **Bottleneck**: Sequential table scan on unindexed booking records holding connections in a default 10-connection Prisma pool.
- **Microbenchmark Workload**: 65 concurrent clients competing for 10 database connection slots.
- **Observed Baseline**: Pool acquisition queue backed up, causing p99 latency to climb to 799ms with throughput throttled at 91 req/s.
- **Observed Remedy**: Simulating a B-Tree index scan (reducing query duration from 95ms to 2.4ms) reduced connection holding time, increasing throughput to 785 req/s (+8.6x) and lowering p99 latency to 110ms (7.3x reduction).

---

## How to Reproduce Locally

### 1. Software Verification Harness (AST & MVA Static Math)
Runs the static analysis rules and MVA queuing model against the codebase in <100ms without spinning up network ports:
```bash
npm run verify:software
```

### 2. Physical Hardware Verification Harness (autocannon Microbenchmarks)
Spawns isolated archetype services on collision-free ports (`8101`–`8108`) and executes sustained load sweeps:
```bash
npm run verify:hardware
```

### 3. Dual Correlation Suite
Executes the software verification harness followed by the physical hardware sweeps, compiling the comparison table:
```bash
npm test
# or
npm run verify:both
```

### 4. Full Production Software Mode (Tier 3)
Benchmarks against installed local production binaries (`msh.exe`, `tkngate.exe`, `gitstress`):
```bash
npm run test:real
```

### 5. Interactive Web Dashboard
Launches the local browser UI at `http://127.0.0.1:4200` to inspect comparative dynamometers, latency distributions, and live SSE execution logs:
```bash
npm start
```

---

## Repository Structure

```
gitstress-benchmark/
├── README.md                            # Methodology, benchmark figures, and reproduction steps
├── package.json
├── server.js                            # Web Application Dashboard Server
├── harness/
│   ├── software_verification.js        # Tier 1: Static AST & 4-Station MVA Model Validator
│   ├── hardware_verification.js        # Tier 2: Physical Hardware Load Testing Harness
│   └── dual_matrix.js                  # Master Dual Runner: Software vs. Hardware
├── archetypes/
│   ├── 01-go-reverse-proxy-pool/        # tkngate archetype
│   │   ├── main.go
│   │   └── verify.sh
│   ├── 02-node-prisma-unindexed-pool/   # cal.com archetype
│   │   ├── server.js
│   │   └── verify.sh
│   ├── 03-go-swarm-socket-fanout/       # msh-protocol archetype
│   │   ├── main.go
│   │   └── verify.sh
│   └── 04-gitstress-engine-outbound-pool/ # gitstress archetype
│       ├── server.js
│       └── verify.sh
├── public/                              # Interactive Web Dashboard (Brutalist UI)
│   ├── index.html
│   ├── app.css
│   └── app.js
├── results/
│   ├── dual_verification_matrix.json   # Combined Software vs. Hardware correlation
│   ├── software_verification.json       # Software AST & MVA telemetry
│   └── benchmark_results.json           # Physical hardware empirical telemetry
└── .github/
    └── workflows/
        └── verify-matrix.yml            # Automated CI verification runs
```

---

## Links

- **GitStress Platform**: [https://gitstress.com](https://gitstress.com)
- **GitStress Core Engine**: [https://github.com/gitstress/gitstress](https://github.com/gitstress/gitstress)
- **Production Concurrency Matrix**: [https://gitstress.com/stacks](https://gitstress.com/stacks)
- **Report an Issue**: [https://github.com/gitstress/gitstress-benchmark/issues](https://github.com/gitstress/gitstress-benchmark/issues)
