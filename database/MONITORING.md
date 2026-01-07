# Database Monitoring & Observability

## Metrics
Key metrics to monitor via Neon Dashboard:
1.  **Active Connections**: Ensure we don't hit the pool limit.
2.  **CPU/RAM Usage**: Monitor compute endpoints.
3.  **Query Duration**: Identify slow queries (>100ms).

## Alerts
Set up alerts for:
- Connection failures (potential outage).
- High CPU usage (>80% for 5 mins).
- Storage capacity warnings.

## Logging
- **Application Logs**: API errors are logged to Vercel Logs.
- **Database Logs**: Slow query logs can be enabled in Postgres.
