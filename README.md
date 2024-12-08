# Cronicle

A modern, lightweight job monitoring system for tracking scheduled tasks and health checks.

## Quick Start

Clone the repository:
```bash
git clone https://github.com/yourusername/cronicle.git
cd cronicle
```

### Option 1: Docker Setup (Recommended)
The easiest way to get started is using Docker:
```bash
docker compose up --build
```
Access Cronicle at `http://localhost:8000`

### Option 2: Python Setup
If you prefer a local Python setup:

1. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Linux/macOS
   # OR
   .venv\Scripts\activate     # On Windows
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

## Core Features

- Real-time job monitoring and status tracking
- Job configuration with cron schedule support
- Detailed job run history with client information
- Alert system for missed jobs and long-running tasks
- Dark/light theme support
- Support for both timed jobs and health checks

## Job Types

### 1. Timed Jobs
For monitoring long-running scheduled tasks like:
- Nightly data backups
- Periodic data processing
- Weekly report generation
- Data synchronization

Configuration example:
```json
{
    "job_id": "nightly_backup",
    "schedule": "0 0 * * *",    // Run at midnight daily
    "tolerance": 30,            // Allow 30 minutes delay
    "max_runtime": 120          // Should complete within 2 hours
}
```

### 2. Health Check Jobs
For monitoring service health and uptime:
- Service health monitoring
- Application uptime tracking
- System availability checks

Configuration example:
```json
{
    "job_id": "api_health_check",
    "schedule": "*/5 * * * *",  // Check every 5 minutes
    "tolerance": 2,             // Alert after 2 minutes delay
    "is_health_check": true     // Mark as health check
}
```

## Job Simulation

The system supports simulating job executions for testing:

### Timed Jobs
- Can be started multiple times, creating multiple running instances
- Stopping a job ends all running instances simultaneously
- Each instance tracks its own start time and duration

### Health Check Jobs
- Execute instantly and complete immediately
- Don't support multiple running instances

### Client Information
When simulating jobs, you can provide custom metadata in JSON format. The system will combine this with automatically collected information:

#### System-collected Information
```json
{
    "ip_address": "192.168.1.100",
    "user_agent": "Mozilla/5.0...",
    "hostname": "worker-01",
    "os_info": "Linux 5.15.0-1053-aws",
    "additional_info": {
        "python_version": "3.9.7",
        "platform": "Linux-5.15.0-1053-aws-x86_64-with-glibc2.31",
        "headers": {
            "host": "localhost:8000",
            "user-agent": "Mozilla/5.0...",
            "accept": "*/*"
        },
        "timestamp": "2024-12-08T14:06:43-06:00"
    }
}
```

#### Custom Metadata Examples
You can add any custom metadata in the client info input box. Here are some examples:

For Timed Jobs:
```json
{
    "batch_size": 1000,
    "source_system": "mysql-prod-1",
    "target_system": "data-warehouse",
    "worker_thread": 3,
    "memory_usage": "4.2GB"
}
```

For Health Checks:
```json
{
    "status": "healthy",
    "response_time": "45ms",
    "memory_usage": "24%",
    "cpu_load": "0.75",
    "active_connections": 132
}
```

The metadata will be stored with the job run and can be viewed in the job history by clicking "View Details".

## Job Configuration

Each job requires:
- **Job ID**: Unique identifier
- **Schedule**: Standard cron expression
- **Tolerance**: Minutes allowed for late starts
- **Max Runtime**: Maximum allowed runtime (timed jobs only)

Client information captured on each run:
- IP Address and Hostname
- OS Information
- User Agent
- Custom metadata

## Alert System

### Types
1. **Missed Jobs**: Job didn't start within tolerance window
2. **Long Running Jobs**: Job exceeds maximum runtime

### Management
- View alerts in the UI
- Acknowledge alerts to clear them
- Configure tolerance and max runtime to control alert triggers

## API Reference

### Job Management
- `GET /jobs` - List all jobs
- `POST /jobs` - Create/update job
- `DELETE /jobs/{job_id}` - Delete job
- `GET /jobs/{job_id}/status` - Get status

### Job Execution
- `POST /jobs/{job_id}/start` - Start job
- `POST /jobs/{job_id}/end` - End job
- `GET /job_runs` - Get execution history

### Alerts
- `GET /alerts` - List alerts
- `POST /alerts/{alert_id}/acknowledge` - Acknowledge alert

### Example: Creating a Job
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

### Example: Recording Job Start
```bash
curl -X POST http://localhost:8000/jobs/data_sync/start \
  -H "Content-Type: application/json" \
  -d '{
    "client_info": {
      "hostname": "worker-01",
      "ip": "10.0.0.100",
      "metadata": {
        "batch_size": 1000,
        "source": "prod_db"
      }
    }
  }'
```

## Technical Details

### Stack
- **Backend**: FastAPI (Python), SQLite, Croniter, PyTZ
- **Frontend**: Bootstrap 5.1.3, Bootstrap Icons, Cronstrue, Vanilla JavaScript

### Database Schema

#### job_configs
- `job_id` (TEXT): Unique identifier
- `schedule` (TEXT): Cron expression
- `tolerance` (INTEGER): Minutes allowed for late starts
- `max_runtime` (INTEGER): Maximum runtime in minutes
- `is_health_check` (BOOLEAN): Health check flag

#### job_runs
- `id` (INTEGER): Auto-incrementing primary key
- `job_id` (TEXT): Reference to job_configs
- `start_time` (TIMESTAMP): Job start time
- `end_time` (TIMESTAMP): Job end time
- `client_info` (TEXT): JSON blob of client data

#### job_alerts
- `id` (INTEGER): Auto-incrementing primary key
- `job_id` (TEXT): Reference to job_configs
- `type` (TEXT): Alert type (missed_job, long_running)
- `created_at` (TIMESTAMP): Alert creation time
