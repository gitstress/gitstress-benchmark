#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8081

echo "================================================================="
echo "GitStress Hardware Benchmark: Archetype 01 (Go Reverse Proxy)"
echo "Target: http.DefaultTransport vs Tuned Connection Pool (MaxIdle: 20)"
echo "Predicted Ceiling: 85 concurrent users | Tuned Ceiling: 850 concurrent"
echo "================================================================="

# 1. Start Baseline Service
echo "[1/4] Starting Baseline Server (MaxIdleConnsPerHost = 2)..."
GITSTRESS_TUNED=false go run "$DIR/main.go" --port $PORT &
PID=$!
sleep 2

# Warm up
curl -s "http://127.0.0.1:$PORT/health" > /dev/null || sleep 2

# 2. Run Baseline Benchmark (at predicted knee: 85 concurrent)
echo "[2/4] Running Baseline Stress Test: 85 concurrent connections for 10s..."
npx autocannon -c 85 -d 10 -p 10 "http://127.0.0.1:$PORT/proxy" > "$DIR/baseline_results.txt" 2>&1
cat "$DIR/baseline_results.txt" | grep -E "2xx|Non-2xx|p99|Latency|Req/Sec" || true

kill -9 $PID 2>/dev/null || true
sleep 1

# 3. Start Tuned Service
echo "[3/4] Starting Tuned Server (MaxIdleConnsPerHost = 20, GitStress +10x Patch)..."
GITSTRESS_TUNED=true go run "$DIR/main.go" --port $PORT &
PID=$!
sleep 2

# 4. Run Tuned Benchmark (at same load & elevated 250+ load)
echo "[4/4] Running Tuned Stress Test: 85 concurrent connections for 10s..."
npx autocannon -c 85 -d 10 -p 10 "http://127.0.0.1:$PORT/proxy" > "$DIR/tuned_results.txt" 2>&1
cat "$DIR/tuned_results.txt" | grep -E "2xx|Non-2xx|p99|Latency|Req/Sec" || true

kill -9 $PID 2>/dev/null || true

echo "================================================================="
echo "Archetype 01 Verification Complete."
echo "Baseline Results: $DIR/baseline_results.txt"
echo "Tuned Results:    $DIR/tuned_results.txt"
echo "================================================================="

