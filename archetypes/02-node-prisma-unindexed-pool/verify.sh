#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8082

echo "================================================================="
echo "GitStress Hardware Benchmark: Archetype 02 (Prisma Pool-10)"
echo "Target: Sequential Scan (95ms) vs B-Tree Index (2.4ms)"
echo "Predicted Baseline Knee: 62 concurrent | Tuned Headroom: +17.8x"
echo "================================================================="

# 1. Start Baseline Service
echo "[1/4] Starting Baseline Server (Unindexed Query, Pool: 10, Latency: 95ms)..."
GITSTRESS_TUNED=false node "$DIR/server.js" &
PID=$!
sleep 2

# 2. Run Baseline Benchmark (at predicted failure knee: 65 concurrent)
echo "[2/4] Running Baseline Load Test: 65 concurrent connections for 10s..."
npx autocannon -c 65 -d 10 -p 10 "http://127.0.0.1:$PORT/api/bookings/sync" > "$DIR/baseline_results.txt" 2>&1
cat "$DIR/baseline_results.txt" | grep -E "2xx|Non-2xx|p99|Latency|Req/Sec" || true

kill -9 $PID 2>/dev/null || true
sleep 1

# 3. Start Tuned Service
echo "[3/4] Starting Tuned Server (B-Tree Index Scan: 2.4ms, GitStress Remedy)..."
GITSTRESS_TUNED=true node "$DIR/server.js" &
PID=$!
sleep 2

# 4. Run Tuned Benchmark
echo "[4/4] Running Tuned Load Test: 65 concurrent connections for 10s..."
npx autocannon -c 65 -d 10 -p 10 "http://127.0.0.1:$PORT/api/bookings/sync" > "$DIR/tuned_results.txt" 2>&1
cat "$DIR/tuned_results.txt" | grep -E "2xx|Non-2xx|p99|Latency|Req/Sec" || true

kill -9 $PID 2>/dev/null || true

echo "================================================================="
echo "Archetype 02 Verification Complete."
echo "Baseline Results: $DIR/baseline_results.txt"
echo "Tuned Results:    $DIR/tuned_results.txt"
echo "================================================================="

