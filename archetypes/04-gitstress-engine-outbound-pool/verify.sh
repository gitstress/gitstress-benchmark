#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8084

echo "================================================================="
echo "GitStress Hardware Benchmark: Archetype 04 (Analytical Engine Pool)"
echo "Target: Outbound HTTPS Agent Socket Allocation vs Undici + LRU Pool"
echo "Target Repo: gitstress/gitstress (src/core/github_fetcher.ts:103)"
echo "Predicted Baseline Knee: 12,500 concurrent | Tuned Headroom: +10x"
echo "================================================================="

# 1. Start Baseline Service
echo "[1/4] Starting Baseline Server (Unpooled Socket Allocation)..."
GITSTRESS_TUNED=false node "$DIR/server.js" &
PID=$!
sleep 2

# 2. Run Baseline Benchmark (at concurrency = 150)
echo "[2/4] Running Baseline Stress Test: 150 concurrent connections for 10s..."
npx autocannon -c 150 -d 10 -p 10 "http://127.0.0.1:$PORT/api/diagnose" > "$DIR/baseline_results.txt" 2>&1
cat "$DIR/baseline_results.txt" | grep -E "2xx|Non-2xx|p99|Latency|Req/Sec" || true

kill -9 $PID 2>/dev/null || true
sleep 1

# 3. Start Tuned Service
echo "[3/4] Starting Tuned Server (GitStress Undici Agent + LRU Cache)..."
GITSTRESS_TUNED=true node "$DIR/server.js" &
PID=$!
sleep 2

# 4. Run Tuned Benchmark
echo "[4/4] Running Tuned Stress Test: 150 concurrent connections for 10s..."
npx autocannon -c 150 -d 10 -p 10 "http://127.0.0.1:$PORT/api/diagnose" > "$DIR/tuned_results.txt" 2>&1
cat "$DIR/tuned_results.txt" | grep -E "2xx|Non-2xx|p99|Latency|Req/Sec" || true

kill -9 $PID 2>/dev/null || true

echo "================================================================="
echo "Archetype 04 Verification Complete."
echo "Baseline Results: $DIR/baseline_results.txt"
echo "Tuned Results:    $DIR/tuned_results.txt"
echo "================================================================="
