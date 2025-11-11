import { serve, Server } from "bun";

export type MetricType = "counter" | "gauge" | "histogram";

interface CounterMetric {
  type: "counter";
  name: string;
  help: string;
  value: number;
}

interface GaugeMetric {
  type: "gauge";
  name: string;
  help: string;
  value: number;
}

interface HistogramMetric {
  type: "histogram";
  name: string;
  help: string;
  buckets: number[];
  counts: number[];
  sum: number;
  observations: number;
}

export class MetricsRegistry {
  private counters = new Map<string, CounterMetric>();
  private gauges = new Map<string, GaugeMetric>();
  private histograms = new Map<string, HistogramMetric>();

  counter(name: string, help: string) {
    if (!this.counters.has(name)) {
      this.counters.set(name, { type: "counter", name, help, value: 0 });
    }
    return {
      inc: (value = 1) => {
        const metric = this.counters.get(name)!;
        metric.value += value;
      }
    };
  }

  gauge(name: string, help: string) {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, { type: "gauge", name, help, value: 0 });
    }
    return {
      set: (value: number) => {
        const metric = this.gauges.get(name)!;
        metric.value = value;
      }
    };
  }

  histogram(name: string, help: string, buckets: number[] = [0.1, 0.5, 1, 3, 5]) {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, {
        type: "histogram",
        name,
        help,
        buckets,
        counts: new Array(buckets.length + 1).fill(0),
        sum: 0,
        observations: 0
      });
    }
    return {
      observe: (value: number) => {
        const metric = this.histograms.get(name)!;
        metric.sum += value;
        metric.observations += 1;
        let bucketIndex = metric.counts.length - 1;
        for (let i = 0; i < metric.buckets.length; i++) {
          if (value <= metric.buckets[i]) {
            bucketIndex = i;
            break;
          }
        }
        metric.counts[bucketIndex] += 1;
      }
    };
  }

  toPrometheus(): string {
    const lines: string[] = [];
    for (const metric of this.counters.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} counter`);
      lines.push(`${metric.name} ${metric.value}`);
    }
    for (const metric of this.gauges.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} gauge`);
      lines.push(`${metric.name} ${metric.value}`);
    }
    for (const metric of this.histograms.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} histogram`);
      let cumulative = 0;
      metric.buckets.forEach((bucket, idx) => {
        cumulative += metric.counts[idx];
        lines.push(`${metric.name}_bucket{le="${bucket}"} ${cumulative}`);
      });
      cumulative += metric.counts[metric.counts.length - 1];
      lines.push(`${metric.name}_bucket{le="+Inf"} ${cumulative}`);
      lines.push(`${metric.name}_sum ${metric.sum}`);
      lines.push(`${metric.name}_count ${metric.observations}`);
    }
    return lines.join("\n");
  }
}

export interface MetricsServerOptions {
  registry: MetricsRegistry;
  port?: number;
  path?: string;
}

export function startMetricsServer(options: MetricsServerOptions): Server {
  const path = options.path ?? "/metrics";
  const server = serve({
    port: options.port ?? 9464,
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname !== path) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(options.registry.toPrometheus(), {
        headers: { "content-type": "text/plain" }
      });
    }
  });
  return server;
}

export const defaultMetrics = {
  registry: new MetricsRegistry(),
  ingestionLatency: new Map<string, ReturnType<MetricsRegistry["histogram"]>>(),
  retrievalLatency: new Map<string, ReturnType<MetricsRegistry["histogram"]>>(),
  queueDepth: new Map<string, ReturnType<MetricsRegistry["gauge"]>>(),
  errors: new Map<string, ReturnType<MetricsRegistry["counter"]>>()
};

export function measureLatency(
  registry: MetricsRegistry,
  name: string,
  help: string,
  start: number,
  buckets?: number[]
) {
  const elapsedSeconds = (Date.now() - start) / 1000;
  registry.histogram(name, help, buckets).observe(elapsedSeconds);
}
