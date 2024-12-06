from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, validator
import time
from typing import Optional, Dict, List
from datetime import datetime, timedelta
from croniter import croniter
import pytz
from pathlib import Path
import database as db
import platform
import socket
import json

app = FastAPI(title="Cronjob Monitor", description="A service to monitor and track cron jobs")

# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    db.init_db()

# Mount the static directory
static_path = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

class JobConfig(BaseModel):
    job_id: str
    schedule: str  # Cron expression (e.g., "0 12 * * *" for daily at noon)
    tolerance_minutes: int = 10  # Default 10-minute window

    @validator('schedule')
    def validate_cron(cls, v):
        if not croniter.is_valid(v):
            raise ValueError('Invalid cron expression')
        return v

    @validator('tolerance_minutes')
    def validate_tolerance(cls, v):
        if v < 0 or v > 1440:  # 1440 minutes = 24 hours
            raise ValueError('Tolerance must be between 0 and 1440 minutes')
        return v

def check_schedule(schedule: str, tolerance_minutes: int, current_time: datetime) -> bool:
    """
    Check if the current time is within the allowed window for the job schedule.
    Returns True if the time is valid, False otherwise.
    """
    # Convert to UTC for consistent timezone handling
    current_time_utc = current_time.astimezone(pytz.UTC)
    
    # Get the most recent scheduled time
    cron = croniter(schedule, current_time_utc)
    scheduled_time = cron.get_prev(datetime)
    
    # Calculate the time window
    window_start = scheduled_time - timedelta(minutes=tolerance_minutes)
    window_end = scheduled_time + timedelta(minutes=tolerance_minutes)
    
    return window_start <= current_time_utc <= window_end

def get_client_info(request: Request) -> dict:
    """Collect client information from the request"""
    client_host = request.client.host if request.client else None
    
    # Get the X-Forwarded-For header if behind a proxy
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # The first IP in X-Forwarded-For is the original client
        client_host = forwarded_for.split(',')[0].strip()
    
    client_info = {
        'ip_address': client_host,
        'user_agent': request.headers.get("User-Agent"),
        'hostname': socket.gethostname(),
        'os_info': f"{platform.system()} {platform.release()}",
        'additional_info': {
            'python_version': platform.python_version(),
            'platform': platform.platform(),
            'headers': dict(request.headers),
            'timestamp': datetime.now().isoformat()
        }
    }
    return client_info

@app.post("/configure_job")
async def configure_job(config: JobConfig):
    db.save_job_config(config.job_id, config.schedule, config.tolerance_minutes)
    return {"message": "Job configured", "job_id": config.job_id}

@app.post("/start_job")
async def start_job(job_id: str, request: Request):
    config = db.get_job_config(job_id)
    if not config:
        raise HTTPException(status_code=404, detail="Job not configured. Please configure the job first.")
    
    current_time = datetime.now(pytz.UTC)
    client_info = get_client_info(request)
    
    # Check if the job is starting within its scheduled window
    if not check_schedule(config['schedule'], config['tolerance_minutes'], current_time):
        # Calculate the expected schedule time
        cron = croniter(config['schedule'], current_time)
        expected_time = cron.get_prev(datetime)
        
        alert_message = (
            f"Job {job_id} started outside its scheduled window. "
            f"Expected around {expected_time}, started at {current_time}. "
            f"Tolerance window: {config['tolerance_minutes']} minutes"
        )
        
        # Store the job run with alert and client info
        run_id = db.start_job_run(job_id, client_info, alert_message)
        
        return {
            "message": "Job started with schedule violation",
            "job_id": job_id,
            "run_id": run_id,
            "alert": alert_message,
            "client_info": client_info
        }
    
    # Store the job run with client info
    run_id = db.start_job_run(job_id, client_info)
    return {
        "message": "Job started",
        "job_id": job_id,
        "run_id": run_id,
        "client_info": client_info
    }

@app.post("/end_job")
async def end_job(job_id: str):
    # Get the latest run for this job
    latest_run = db.get_latest_job_run(job_id)
    if not latest_run or latest_run['end_time'] is not None:
        raise HTTPException(status_code=404, detail="No active job run found")
    
    duration = db.end_job_run(job_id, latest_run['id'])
    if duration is None:
        raise HTTPException(status_code=500, detail="Failed to update job run")
    
    return {
        "message": "Job ended",
        "job_id": job_id,
        "duration": duration,
        "run_id": latest_run['id']
    }

@app.get("/jobs")
async def list_jobs():
    """Get all jobs with their latest status"""
    return db.get_all_jobs_status()

@app.get("/job_status/{job_id}")
async def get_job_status(job_id: str):
    status = db.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Add next scheduled run information
    current_time = datetime.now(pytz.UTC)
    cron = croniter(status['schedule'], current_time)
    next_run = cron.get_next(datetime)
    prev_run = cron.get_prev(datetime)
    
    status.update({
        "next_scheduled_run": next_run.isoformat(),
        "last_scheduled_run": prev_run.isoformat(),
    })
    
    return status

@app.get("/", response_class=HTMLResponse)
async def get_html():
    """Serve the main HTML page"""
    html_path = static_path / "index.html"
    return HTMLResponse(content=html_path.read_text())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
