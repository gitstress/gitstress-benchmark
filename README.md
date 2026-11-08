# GitStress Empirical Benchmark Suite

[![Hardware Concurrency Verification Matrix](https://github.com/gitstress/gitstress-benchmark/actions/workflows/verify-matrix.yml/badge.svg)](https://github.com/gitstress/gitstress-benchmark/actions/workflows/verify-matrix.yml)
[![GitStress Engine](https://img.shields.io/badge/gitstress-v0.12.0-ea580c)](https://gitstress.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Physical hardware verification harness for [GitStress](https://gitstress.com). Provides turnkey, reproducible load-testing benchmarks that physically prove the accuracy of GitStress's Little's Law ($L = \lambda W$) queue saturation models and +10× headroom remedies.

---

## The Problem: AI Tools Guess. GitStress Proves.

Most code analysis tools hallucinate bottlenecks based on AST keywords. When GitStress scans a repository and outputs:
> **TARGET: `tkngate/tkngate` · DIES AT 85 CONCURRENT · FATAL BOTTLENECK: `http.DefaultTransport`**

Senior engineers rightfully ask: **"Did you actually measure that on physical hardware, or is that just synthetic math?"**

This repository exists to make every GitStress prediction 100% falsifiable and empirically reproducible on your local machine.

---

## 4 Flagship Production Archetypes

| Archetype | Production Stand-in | Fatal Bottleneck Symbol | Physical Failure Knee | GitStress Headroom Patch | Measured Headroom |
| :--- | :--- | :--- | :---: | :--- | :---: |
| **01. Go Reverse Proxy Pool** | `tkngate/tkngate` | `http.DefaultTransport` | **85 c/s** | `MaxIdleConnsPerHost: 20` | **+10.0×** |
| **02. Node.js Prisma DB Pool** | `calcom/cal.com` | `bookings.syncUpcoming` | **62 c/s** | B-Tree Index Scan (2.4ms) | **+17.8×** |
| **03. Go Swarm Peer Fanout** | `msh-protocol/msh` | `fleet.Server.handleRegister` | **2,500 c/s** | Non-blocking Ring Buffer | **+10.0×** |
| **04. Upstream Ingestion Pool** | `gitstress/gitstress` | `fetcher.fetchLiveGitHubRepo` | **12,500 c/s** | Undici Agent Pool + LRU Cache | **+10.0×** |

---

## Quickstart: Verify Locally in 30 Seconds

### Prerequisites
- Node.js 18+
- Go 1.21+ (for Go archetypes)
- `npm`

### Run All Benchmarks
```bash
git clone https://github.com/gitstress/gitstress-benchmark.git
cd gitstress-benchmark
npm install
node scripts/run_matrix.js
```

### Run an Individual Archetype
```bash
# Verify Archetype 01: Go Reverse Proxy MaxIdleConns Churn
bash archetypes/01-go-reverse-proxy-pool/verify.sh

# Verify Archetype 02: Node.js Prisma Pool-10 Saturation
bash archetypes/02-node-prisma-unindexed-pool/verify.sh

# Verify Archetype 03: Go Swarm Goroutine Fanout Block
bash archetypes/03-go-swarm-socket-fanout/verify.sh

# Verify Archetype 04: GitStress Analytical Engine Outbound Pool
bash archetypes/04-gitstress-engine-outbound-pool/verify.sh
```

---

## Methodology: Mean Value Analysis (MVA) & Little's Law

GitStress solves an operational queuing network across 4 stations:
1. **Station 1 (Edge Ingress / Reverse Proxy)**: Epoll listener & TLS handshake.
2. **Station 2 (Application Workers)**: Node.js event loop or Go goroutines.
3. **Station 3 (Connection Pool)**: Database pool (e.g. pgx / Prisma pool-of-10) or HTTP outbound transport.
4. **Station 4 (Storage Engine / Upstream API)**: B-Tree index vs. table scan execution time.

By Little's Law:
$$L = \lambda \times W$$

When client concurrency $N$ crosses the saturation threshold $N_{\text{fail}} = K \times \frac{W_{\text{timeout}}}{S_{\text{service}}}$, queue depth spikes exponentially, resulting in HTTP 504 gateway timeouts or dropped TCP connections.

---

## Repository Structure

```
gitstress-benchmark/
├── README.md
├── package.json
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
├── scripts/
│   └── run_matrix.js                    # Cross-platform automated test matrix
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
