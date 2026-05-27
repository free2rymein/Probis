# Monitoring

Monitoring starts minimal by design:

- structured JSON logs in API and workers
- health route for uptime checks
- future metrics endpoint for ingestion latency, scoring queue depth, and alert delivery

Add Prometheus, OpenTelemetry, or hosted observability only when production traffic justifies the cost.
