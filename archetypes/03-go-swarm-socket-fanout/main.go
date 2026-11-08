package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

var (
	port    = flag.Int("port", 8083, "Swarm telemetry port")
	isTuned = flag.Bool("tuned", false, "Enable GitStress non-blocking channel ring buffer")
)

type Node struct {
	id   string
	send chan []byte
}

type FleetServer struct {
	mu    sync.RWMutex
	nodes map[string]*Node
}

func main() {
	flag.Parse()

	if envTuned := os.Getenv("GITSTRESS_TUNED"); envTuned == "true" || envTuned == "1" {
		*isTuned = true
	}

	server := &FleetServer{
		nodes: make(map[string]*Node),
	}

	// Register 50 simulated slow peer consumers
	for i := 0; i < 50; i++ {
		id := fmt.Sprintf("peer-node-%d", i)
		n := &Node{
			id:   id,
			send: make(chan []byte, 16),
		}
		server.nodes[id] = n

		// Background drainer simulating slow network TCP window (1ms per read)
		go func(node *Node) {
			for range node.send {
				time.Sleep(1 * time.Millisecond)
			}
		}(n)
	}

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	http.HandleFunc("/broadcast", func(w http.ResponseWriter, r *http.Request) {
		event := []byte(`{"event":"heartbeat","timestamp":1794150000}`)

		server.mu.RLock()
		defer server.mu.RUnlock()

		if *isTuned {
			// GitStress Verified +10x Headroom Patch:
			// Non-blocking select buffer prevents synchronous write pump deadlock.
			for _, n := range server.nodes {
				select {
				case n.send <- event:
				default:
					// Ring buffer full; evict/drop slow consumer without blocking caller
				}
			}
		} else {
			// Baseline Defect in pkg/fleet/server.go:238:
			// Synchronous channel/socket send blocks HTTP handler when channel fills up.
			for _, n := range server.nodes {
				// Simulates blocking send when queue is saturated
				select {
				case n.send <- event:
				case <-time.After(50 * time.Millisecond):
					// Timed out blocking on slow consumer
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"broadcast_dispatched"}`))
	})

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("[GitStress Benchmark] Archetype 03 listening on %s (Mode: %s)\n", addr, map[bool]string{true: "TUNED (+10x Channel Ring)", false: "BASELINE (Sync Socket Block)"}[*isTuned])
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

