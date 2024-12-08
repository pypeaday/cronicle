from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, validator, Field
import time
from typing import Optional, Dict, List
from datetime import datetime, timedelta
from croniter import croniter
import pytz
from pathlib import Path
import database as db
from database import AlertType, to_utc, from_db_datetime
import platform
import socket
import json
import asyncio
from contextlib import asynccontextmanager

# Background task for checking job issues
async def check_job_issues():
    while True:
        try:
            current_time = datetime.now(pytz.UTC)
            
            # Check for missed jobs
            jobs = db.get_all_job_configs()
            for job in jobs:
                # Skip paused jobs
                if job.get('paused', False):
                    continue
                
                # Skip heartbeat jobs for missed job checks
                if not job.get('max_runtime_minutes'):
                    continue
                
                # Handle sub-minute schedules
                if ' * *' in job['schedule']:  # Check if it's a sub-minute schedule
                    seconds = int(job['schedule'].split()[0].strip('*/'))
                    if seconds < 60:
                        # For sub-minute schedules, check if we've missed the last expected run
                        last_run = db.get_latest_job_run(job['job_id'])
                        last_run_time = last_run['start_time'] if last_run else None
                        
                        if not last_run_time:
                            expected_time = current_time - timedelta(seconds=seconds)
                        else:
                            expected_time = last_run_time + timedelta(seconds=seconds)
                        
                        # Calculate the tolerance window
                        tolerance_minutes = job.get('tolerance_minutes', 0)  # Default to 0 if not set
                        if tolerance_minutes is None:
                            tolerance_minutes = 0
                        tolerance = timedelta(minutes=tolerance_minutes)
                        window_end = expected_time + tolerance
                        
                        # If we're past the window end and there's no run recorded
                        if current_time > window_end and (
                            not last_run_time or 
                            last_run_time < expected_time
                        ):
                            # Check if alert already exists for this expected start time
                            if not db.has_existing_alert(job['job_id'], expected_time, AlertType.MISSED_JOB):
                                alert_message = (
                                    f"Job {job['job_id']} missed its scheduled run. "
                                    f"Expected at {format_time_with_cst(expected_time)}, "
                                    f"tolerance window ended at {format_time_with_cst(window_end)}."
                                )
                                db.add_job_alert(
                                    job_id=job['job_id'],
                                    alert_type=AlertType.MISSED_JOB,
                                    alert_message=alert_message,
                                    expected_start_time=expected_time
                                )
                        continue
                
                # Handle regular cron schedules
                # Get the last run time for this job
                last_run = db.get_latest_job_run(job['job_id'])
                last_run_time = last_run['start_time'] if last_run else None
                
                # Get the most recent expected run time according to the schedule
                cron = croniter(job['schedule'], current_time)
                expected_time = to_utc(cron.get_prev(datetime))
                
                # Calculate the tolerance window
                tolerance_minutes = job.get('tolerance_minutes', 0)  # Default to 0 if not set
                if tolerance_minutes is None:
                    tolerance_minutes = 0
                tolerance = timedelta(minutes=tolerance_minutes)
                window_end = expected_time + tolerance
                
                # If we're past the window end and there's no run recorded
                if current_time > window_end and (
                    not last_run_time or 
                    last_run_time < expected_time
                ):
                    # Check if alert already exists for this expected start time
                    if not db.has_existing_alert(job['job_id'], expected_time, AlertType.MISSED_JOB):
                        alert_message = (
                            f"Job {job['job_id']} missed its scheduled run. "
                            f"Expected at {format_time_with_cst(expected_time)}, "
                            f"tolerance window ended at {format_time_with_cst(window_end)}."
                        )
                        db.add_job_alert(
                            job_id=job['job_id'],
                            alert_type=AlertType.MISSED_JOB,
                            alert_message=alert_message,
                            expected_start_time=expected_time
                        )
            
            # Check for long-running jobs
            running_jobs = db.get_running_jobs()
            for job in running_jobs:
                # Skip heartbeat jobs for long-running checks
                if not job.get('max_runtime_minutes'):
                    continue
                    
                start_time = job['start_time']
                runtime = current_time - start_time
                max_runtime = timedelta(minutes=job['max_runtime_minutes'])
                
                if runtime > max_runtime:
                    # Check if long-running alert already exists for this start time
                    if not db.has_existing_alert(job['job_id'], start_time, AlertType.LONG_RUNNING):
                        alert_message = (
                            f"Job {job['job_id']} has been running for {runtime.total_seconds() / 60:.1f} minutes, "
                            f"exceeding the maximum runtime of {job['max_runtime_minutes']} minutes. "
                            f"Started at {format_time_with_cst(start_time)}."
                        )
                        db.add_job_alert(
                            job_id=job['job_id'],
                            alert_type=AlertType.LONG_RUNNING,
                            alert_message=alert_message,
                            actual_start_time=start_time
                        )
            
        except Exception as e:
            print(f"Error in check_job_issues: {str(e)}")
        
        # Check more frequently for sub-minute schedules
        await asyncio.sleep(5)  # Check every 5 seconds instead of every minute

# Startup and shutdown events manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure data directory exists and initialize database
    data_dir = Path(__file__).parent / "data"
    data_dir.mkdir(exist_ok=True)
    db.init_db()
    
    # Start background task
    task = asyncio.create_task(check_job_issues())
    yield
    # Cancel background task
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title="Cronjob Monitor",
    description="A service to monitor and track cron jobs",
    lifespan=lifespan
)

# Mount the static directory
static_path = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

class JobConfig(BaseModel):
    job_id: str
    schedule: str
    tolerance_minutes: int = Field(ge=0, description="Tolerance in minutes")
    max_runtime_minutes: Optional[int] = Field(
        None, 
        ge=0, 
        le=10080, 
        description="Max runtime in minutes. Set to null or 0 for health check jobs"
    )

    @validator('schedule')
    def validate_cron(cls, v):
        # Handle sub-minute schedules
        if ' * * * *' in v:
            try:
                seconds = int(v.split()[0].strip('*/'))
                if 0 < seconds < 60:
                    return v
            except ValueError:
                pass
        
        # Handle regular cron schedules
        try:
            croniter(v)
            return v
        except ValueError as e:
            raise ValueError(f"Invalid cron expression: {str(e)}")

    @validator('max_runtime_minutes')
    def validate_max_runtime(cls, v):
        # Allow None or 0 for health check jobs
        if v is None or v == 0:
            return None
        # For jobs that need monitoring, ensure runtime is between 1 and 10080
        if v < 1 or v > 10080:
            raise ValueError("For monitored jobs, runtime must be between 1 and 10080 minutes")
        return v

class JobMetadata(BaseModel):
    metadata: Optional[Dict] = Field(default=None, description="Custom metadata for the job run")

def format_time_with_cst(dt: datetime) -> str:
    """Format time in both UTC and CST"""
    utc_str = dt.strftime('%I:%M %p %Z')
    cst = dt.astimezone(pytz.timezone('America/Chicago'))
    cst_str = cst.strftime('%I:%M %p CST')
    return f"{utc_str} ({cst_str})"

def check_schedule(schedule: str, tolerance_minutes: int, current_time: datetime) -> bool:
    """
    Check if the current time is within the allowed window for the job schedule.
    Returns True if the time is valid, False otherwise.
    """
    # Convert to UTC for consistent timezone handling
    current_time_utc = current_time.astimezone(pytz.UTC)
    
    # Get the most recent scheduled time
    cron = croniter(schedule, current_time_utc)
    scheduled_time = to_utc(cron.get_prev(datetime))
    
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

@app.post("/start_job")
async def start_job(request: Request):
    """Record a job start"""
    data = await request.json()
    job_id = data.get('job_id')
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id is required")
    
    # Get client information
    client_info = get_client_info(request)
    
    # Check if job exists
    job_config = db.get_job_config(job_id)
    if not job_config:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    # Check if there's already a running job
    latest_run = db.get_latest_job_run(job_id)
    if latest_run and not latest_run['end_time']:
        raise HTTPException(status_code=400, detail=f"Job {job_id} is already running")
    
    # Check if job should run now
    current_time = datetime.now(pytz.UTC)
    cron = croniter(job_config['schedule'], current_time)
    prev_run = to_utc(cron.get_prev(datetime))
    next_run = to_utc(cron.get_next(datetime))
    tolerance = timedelta(minutes=job_config['tolerance_minutes'])
    
    # Calculate time windows
    prev_window_start = prev_run - tolerance
    prev_window_end = prev_run + tolerance
    next_window_start = next_run - tolerance
    next_window_end = next_run + tolerance
    
    # Check if we're in either window
    in_prev_window = prev_window_start <= current_time <= prev_window_end
    in_next_window = next_window_start <= current_time <= next_window_end
    
    alert = None
    if not (in_prev_window or in_next_window):
        alert = (
            f"Warning: Job started outside scheduled windows. "
            f"Previous window was {format_time_with_cst(prev_run)} ±{int(tolerance.total_seconds()/60)}min, "
            f"next window is {format_time_with_cst(next_run)} ±{int(tolerance.total_seconds()/60)}min"
        )
    
    run_id = db.start_job_run(job_id, client_info, alert)
    return {"message": "Job started", "run_id": run_id, "alert": alert}

@app.post("/end_job")
async def end_job(request: Request):
    """Record a job end"""
    data = await request.json()
    job_id = data.get('job_id')
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id is required")
    
    # Get job config
    job_config = db.get_job_config(job_id)
    if not job_config:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    # Get latest run
    latest_run = db.get_latest_job_run(job_id)
    if not latest_run or latest_run['end_time']:
        raise HTTPException(status_code=400, detail=f"Job {job_id} is not running")
    
    db.end_job_run(job_id, latest_run['id'])
    return {"message": "Job ended"}

@app.get("/jobs")
async def list_jobs():
    """Get all jobs with their latest status"""
    jobs = db.get_all_job_configs()
    current_time = datetime.now(pytz.UTC)
    
    for job in jobs:
        # Calculate next run time
        cron = croniter(job['schedule'], current_time)
        next_run = to_utc(cron.get_next(datetime))
        job['next_scheduled_run'] = next_run.isoformat()
        
        # Get latest run info
        latest_run = db.get_latest_job_run(job['job_id'])
        if latest_run:
            job['last_start_time'] = latest_run['start_time'].isoformat() if latest_run['start_time'] else None
            job['last_end_time'] = latest_run['end_time'].isoformat() if latest_run['end_time'] else None
    
    return jobs

@app.post("/jobs")
async def create_job(job: JobConfig):
    try:
        db.add_job(
            job_id=job.job_id,
            schedule=job.schedule,
            tolerance_minutes=job.tolerance_minutes,
            max_runtime_minutes=job.max_runtime_minutes
        )
        return {"message": f"Job {job.job_id} created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/job_status/{job_id}")
async def get_job_status(job_id: str):
    status = db.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Add next scheduled run information
    current_time = datetime.now(pytz.UTC)
    cron = croniter(status['schedule'], current_time)
    next_run = to_utc(cron.get_next(datetime))
    prev_run = to_utc(cron.get_prev(datetime))
    
    status.update({
        "next_scheduled_run": next_run.isoformat(),
        "last_scheduled_run": prev_run.isoformat(),
    })
    
    return status

@app.get("/job_alerts")
async def get_alerts(
    job_id: Optional[str] = None,
    alert_type: Optional[str] = None,
    include_acknowledged: bool = False
):
    """Get job alerts"""
    try:
        alert_type_enum = AlertType(alert_type) if alert_type else None
        return db.get_job_alerts(job_id, alert_type_enum, include_acknowledged)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/acknowledge_alert/{alert_id}")
async def acknowledge_alert(alert_id: int):
    """Acknowledge a job alert"""
    if not db.acknowledge_job_alert(alert_id):
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "success", "message": "Alert acknowledged"}

@app.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    """Delete a job configuration and all its related data"""
    if not db.get_job_config(job_id):
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    db.delete_job(job_id)
    return {"message": f"Job {job_id} deleted successfully"}

@app.get("/job_runs")
def get_job_runs(page: int = 1, per_page: int = 10):
    """Get the history of job runs with pagination"""
    try:
        total = db.count_job_runs()
        runs = db.get_job_runs(offset=(page-1)*per_page, limit=per_page)
        return {
            "runs": runs,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/", response_class=HTMLResponse)
async def get_html():
    """Serve the main HTML page"""
    html_path = static_path / "index.html"
    return HTMLResponse(content=html_path.read_text())

@app.post("/jobs/{job_id}/start")
async def start_job(job_id: str, request: Request, metadata: Optional[JobMetadata] = None):
    try:
        job = db.get_job_config(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        if job['paused']:
            raise HTTPException(status_code=400, detail=f"Job {job_id} is paused")

        # Collect client information
        client_info = get_client_info(request)
        
        # Add custom metadata if provided
        if metadata and metadata.metadata:
            client_info['custom_metadata'] = metadata.metadata
        
        # Record the job start
        db.record_job_start(job_id, client_info)
        
        # For health check jobs (no max runtime), automatically record the end
        if not job['max_runtime_minutes']:
            db.record_job_end(job_id)
            return {"status": "success", "message": f"Health check recorded for job {job_id}"}
            
        return {"status": "success", "message": f"Job {job_id} started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/jobs/{job_id}/end")
async def end_job(job_id: str, request: Request):
    try:
        job = db.get_job_config(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
            
        if not job['max_runtime_minutes']:
            raise HTTPException(status_code=400, detail=f"Job {job_id} is a health check job and doesn't support manual end")
            
        if job['paused']:
            raise HTTPException(status_code=400, detail=f"Job {job_id} is paused")

        db.record_job_end(job_id)
        return {"status": "success", "message": f"Job {job_id} ended"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/jobs/{job_id}/pause")
async def pause_job(job_id: str):
    """Pause a job configuration"""
    try:
        job = db.get_job_config(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
            
        db.update_job_pause_status(job_id, True)
        return {"message": f"Job {job_id} paused"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/jobs/{job_id}/resume")
async def resume_job(job_id: str):
    """Resume a job configuration"""
    try:
        job = db.get_job_config(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
            
        db.update_job_pause_status(job_id, False)
        return {"message": f"Job {job_id} resumed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
