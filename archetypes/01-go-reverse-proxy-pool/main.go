package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"time"
)

var (
	port   = flag.Int("port", 8081, "Proxy server port")
	isTuned = flag.Bool("tuned", false, "Enable GitStress tuned connection pool (MaxIdleConnsPerHost: 20)")
)

func main() {
	flag.Parse()

	if envTuned := os.Getenv("GITSTRESS_TUNED"); envTuned == "true" || envTuned == "1" {
		*isTuned = true
	}

	// Mock Upstream Service (Simulates 25ms upstream database or model inference latency)
	upstreamServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(25 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","latency_ms":25}`))
	}))
	defer upstreamServer.Close()

	var client *http.Client

	if *isTuned {
		// GitStress Verified 10x Headroom Remedy:
		// Replaces default http.DefaultTransport (MaxIdleConnsPerHost: 2) with high-capacity connection pool.
		log.Println("[GitStress Benchmark] Mode: TUNED (MaxIdleConnsPerHost: 20, MaxIdleConns: 100)")
		tunedTransport := &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 20,
			IdleConnTimeout:     90 * time.Second,
			DisableCompression: true,
		}
		client = &http.Client{
			Transport: tunedTransport,
			Timeout:   2 * time.Second,
		}
	} else {
		// GitStress Identified Baseline Bottleneck:
		// Go net/http stdlib default transport hardcodes MaxIdleConnsPerHost to 2, causing severe socket churn.
		log.Println("[GitStress Benchmark] Mode: BASELINE (http.DefaultTransport, MaxIdleConnsPerHost: 2)")
		client = &http.Client{
			Transport: http.DefaultTransport,
			Timeout:   2 * time.Second,
		}
	}

	// Reverse Proxy Handler
	http.HandleFunc("/proxy", func(w http.ResponseWriter, r *http.Request) {
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, upstreamServer.URL, nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, fmt.Sprintf("Upstream Transport Exhaustion: %v", err), http.StatusGatewayTimeout)
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("[GitStress Benchmark] Archetype 01 listening on %s (Proxy target: %s)\n", addr, upstreamServer.URL)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
