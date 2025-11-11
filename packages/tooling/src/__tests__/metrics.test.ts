import { describe, expect, test } from "bun:test";
import { MetricsRegistry } from "../metrics";

describe("MetricsRegistry", () => {
  test("counter increments and renders", () => {
    const registry = new MetricsRegistry();
    const counter = registry.counter("kb_ingestion_total", "Total ingestion jobs");
    counter.inc();
    counter.inc(3);
    const output = registry.toPrometheus();
    expect(output).toContain("kb_ingestion_total 4");
  });

  test("histogram records buckets", () => {
    const registry = new MetricsRegistry();
    const histogram = registry.histogram("kb_ingestion_latency_seconds", "Ingestion latency");
    histogram.observe(0.2);
    histogram.observe(1.2);
    histogram.observe(5);
    const output = registry.toPrometheus();
    expect(output).toContain('kb_ingestion_latency_seconds_bucket{le="0.1"} 0');
    expect(output).toContain('kb_ingestion_latency_seconds_bucket{le="0.5"} 1');
    expect(output).toContain('kb_ingestion_latency_seconds_bucket{le="+Inf"} 3');
  });

});
