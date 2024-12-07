# Cronicle

A modern, lightweight job monitoring system for tracking scheduled tasks and health checks.

## Features

- Real-time job monitoring and status tracking
- Job configuration management with cron schedule support
- Detailed job run history with client information
- Alert system for missed jobs and long-running tasks
- Dark/light theme support

## Use Cases

### 1. Scheduled Job Monitoring (Timed Runs)
Monitor long-running scheduled tasks like:
- Nightly data backups
- Periodic data processing jobs
- Weekly report generation
- Data synchronization tasks

Features for timed runs:
- Track start and end times
- Monitor job duration
- Alert on missed schedules or exceeded runtime
- Capture detailed execution metrics

Example timed job:
```json
{
    "job_id": "nightly_backup",
    "schedule": "0 0 * * *",  // Run at midnight daily
    "tolerance": 30,          // Allow 30 minutes delay
    "max_runtime": 120        // Should complete within 2 hours
}
```

### 2. Health Checks (Heartbeats)
Monitor service health and uptime through regular heartbeats:
- Service health monitoring
- Application uptime tracking
- System availability checks
- Infrastructure monitoring

Features for health checks:
- Quick status verification
- Instant execution recording
- Alert on missed heartbeats
- Lightweight client info capture

Example health check:
```json
{
    "job_id": "api_health_check",
    "schedule": "*/5 * * * *",  // Check every 5 minutes
    "tolerance": 2,             // Alert after 2 minutes delay
    "is_health_check": true     // Mark as health check
}
```

## API Endpoints

### Job Management
- `GET /jobs` - List all job configurations
- `POST /jobs` - Create or update a job
- `DELETE /jobs/{job_id}` - Delete a job
- `GET /jobs/{job_id}/status` - Get job status

### Job Execution
- `POST /jobs/{job_id}/start` - Record job start
- `POST /jobs/{job_id}/end` - Record job end
- `GET /job_runs` - Get job execution history

### Alerts
- `GET /alerts` - List job alerts
- `POST /alerts/{alert_id}/acknowledge` - Acknowledge an alert

## API Examples

### Create a New Job
```bash
curl -X POST http://localhost:8000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "data_sync",
    "schedule": "0 */4 * * *",
    "tolerance": 15,
    "max_runtime": 60
  }'
```

### Record Job Start
```bash
curl -X POST http://localhost:8000/jobs/data_sync/start \
  -H "Content-Type: application/json" \
  -d '{
    "client_info": {
      "hostname": "worker-01",
      "ip": "10.0.0.100",
      "os": "Linux 5.15.0",
      "metadata": {
        "batch_size": 1000,
        "source": "prod_db"
      }
    }
  }'
```

### Record Job End
```bash
curl -X POST http://localhost:8000/jobs/data_sync/end
```

### Send Health Check
```bash
curl -X POST http://localhost:8000/jobs/api_health/start \
  -H "Content-Type: application/json" \
  -d '{
    "client_info": {
      "status": "healthy",
      "memory_usage": "24%",
      "response_time": "45ms"
    }
  }'
```

### Get Job Runs (with pagination)
```bash
curl "http://localhost:8000/job_runs?page=1&per_page=10"
```

## Technical Stack

### Backend
- FastAPI (Python web framework)
- SQLite (Database)
- Croniter (Cron expression parsing)
- PyTZ (Timezone handling)

### Frontend
- Bootstrap 5.1.3 (UI framework)
- Bootstrap Icons
- Cronstrue (Human-readable cron expressions)
- Vanilla JavaScript

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/cronicle.git
   cd cronicle
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the development server:
   ```bash
   python app.py
   ```
4. Access Cronicle at `http://localhost:8000`

## Job Configuration

Jobs are configured with:
- Job ID (unique identifier)
- Cron Schedule (standard cron format)
- Tolerance (minutes allowed for late starts)
- Max Runtime (maximum allowed runtime in minutes)

## Client Information

Each job run captures:
- IP Address
- Hostname
- OS Information
- User Agent
- Additional metadata

## Alert Types

1. Missed Jobs
   - Job didn't start within tolerance window
2. Long Running Jobs
   - Job exceeds maximum runtime

## Database Schema

### Tables
- `job_configs`: Job configuration and scheduling
  - `job_id` (TEXT): Unique identifier
  - `schedule` (TEXT): Cron expression
  - `tolerance` (INTEGER): Minutes allowed for late starts
  - `max_runtime` (INTEGER): Maximum runtime in minutes
  - `is_health_check` (BOOLEAN): Whether this is a health check job

- `job_runs`: Execution history and client data
  - `id` (INTEGER): Auto-incrementing primary key
  - `job_id` (TEXT): Reference to job_configs
  - `start_time` (TIMESTAMP): Job start time
  - `end_time` (TIMESTAMP): Job end time
  - `client_info` (JSON): Client metadata
  - `duration` (FLOAT): Runtime in minutes

- `job_alerts`: Alert tracking and acknowledgment
  - `id` (INTEGER): Auto-incrementing primary key
  - `job_id` (TEXT): Reference to job_configs
  - `type` (TEXT): Alert type (missed_job, long_running)
  - `created_at` (TIMESTAMP): Alert creation time
  - `acknowledged` (BOOLEAN): Whether alert was acknowledged

## Features in Development

1. Authentication system
2. Advanced reporting and analytics
3. Email notifications
4. Job dependencies
5. Distributed monitoring
6. API client libraries (Python, Node.js)
