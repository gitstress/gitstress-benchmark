#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8083

echo "================================================================="
echo "GitStress Hardware Benchmark: Archetype 03 (Swarm Socket Fanout)"
echo "Target: Synchronous Socket Blocking vs Non-Blocking Ring Buffer"
echo "Target Repo: msh-protocol/msh (pkg/fleet/server.go:238)"
echo "Predicted Baseline Knee: 2,500 concurrent | Tuned Headroom: +10x"
echo "================================================================="

# 1. Start Baseline Service
echo "[1/4] Starting Baseline Server (Synchronous Socket Block)..."
GITSTRESS_TUNED=false go run "$DIR/main.go" --port $PORT &
PID=$!
sleep 2

# 2. Run Baseline Benchmark (concurrency = 250)
echo "[2/4] Running Baseline Stress Test: 250 concurrent connections for 10s..."
npx autocannon -c 250 -d 10 -p 10 "http://127.0.0.1:$PORT/broadcast" > "$DIR/baseline_results.txt" 2>&1
cat "$DIR/baseline_results.txt" | grep -E "2xx|Non-2xx|p99|Latency|Req/Sec" || true

kill -9 $PID 2>/dev/null || true
sleep 1

# 3. Start Tuned Service
echo "[3/4] Starting Tuned Server (GitStress Non-Blocking Channel Ring)..."
GITSTRESS_TUNED=true go run "$DIR/main.go" --port $PORT &
PID=$!
sleep 2

# 4. Run Tuned Benchmark
echo "[4/4] Running Tuned Stress Test: 250 concurrent connections for 10s..."
npx autocannon -c 250 -d 10 -p 10 "http://127.0.0.1:$PORT/broadcast" > "$DIR/tuned_results.txt" 2>&1
cat "$DIR/tuned_results.txt" | grep -E "2xx|Non-2xx|p99|Latency|Req/Sec" || true

kill -9 $PID 2>/dev/null || true

echo "================================================================="
echo "Archetype 03 Verification Complete."
echo "Baseline Results: $DIR/baseline_results.txt"
echo "Tuned Results:    $DIR/tuned_results.txt"
echo "================================================================="

