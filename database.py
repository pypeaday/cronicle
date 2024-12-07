import sqlite3
from contextlib import contextmanager
from datetime import datetime
import json
from pathlib import Path
from typing import List, Optional
from enum import Enum
import pytz
import os

class AlertType(Enum):
    MISSED_JOB = "missed_job"
    LONG_RUNNING = "long_running"

# Get the absolute path to the data directory
if os.environ.get('DOCKER_ENV') == 'true':
    # In Docker, use the mounted volume path
    data_dir = Path('/app/data')
else:
    # On host, use relative path
    data_dir = Path(__file__).parent / "data"

data_dir.mkdir(exist_ok=True)

DATABASE_FILE = data_dir / "jobs.db"

def to_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Convert datetime to UTC or return None"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = pytz.UTC.localize(dt)
    return dt.astimezone(pytz.UTC)

def from_db_datetime(dt_str: Optional[str]) -> Optional[datetime]:
    """Convert database datetime string to UTC datetime"""
    if not dt_str:
        return None
    dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
    return to_utc(dt)

def init_db(force_recreate: bool = False):
    """Initialize the database with required tables"""
    # Ensure the parent directory exists
    DATABASE_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    # Optionally delete existing database
    if force_recreate and DATABASE_FILE.exists():
        os.remove(DATABASE_FILE)
    
    # Create database and tables
    with get_db() as db:
        # Create job_configs table
        db.execute('''
            CREATE TABLE IF NOT EXISTS job_configs (
                job_id TEXT PRIMARY KEY,
                schedule TEXT NOT NULL,
                tolerance_minutes INTEGER NOT NULL,
                max_runtime_minutes INTEGER,
                needs_end_signal BOOLEAN DEFAULT FALSE,
                paused BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_start TIMESTAMP,
                last_end TIMESTAMP,
                duration REAL
            )
        ''')

        # Create job_runs table
        db.execute('''
            CREATE TABLE IF NOT EXISTS job_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                start_time TIMESTAMP NOT NULL,
                end_time TIMESTAMP,
                duration REAL,
                client_info TEXT,
                FOREIGN KEY (job_id) REFERENCES job_configs (job_id)
            )
        ''')

        # Create job_alerts table
        db.execute('''
            CREATE TABLE IF NOT EXISTS job_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                alert_type TEXT NOT NULL,
                expected_start_time TIMESTAMP,
                actual_start_time TIMESTAMP,
                detected_time TIMESTAMP NOT NULL,
                alert_message TEXT NOT NULL,
                acknowledged BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES job_configs (job_id)
            )
        ''')
        
        # Add any missing columns to existing tables
        columns = {col[1] for col in db.execute('PRAGMA table_info(job_runs)')}
        
        # Add client_info column if it doesn't exist
        if 'client_info' not in columns:
            db.execute('ALTER TABLE job_runs ADD COLUMN client_info TEXT')
    
    # Update schema if needed
    update_schema()

@contextmanager
def get_db():
    """Context manager for database connections"""
    conn = sqlite3.connect(str(DATABASE_FILE))
    conn.row_factory = sqlite3.Row
    try:
        yield conn.cursor()
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def save_job_config(job_id: str, schedule: str, tolerance_minutes: int, max_runtime_minutes: int = 60, paused: bool = False):
    """Save or update a job configuration"""
    with get_db() as db:
        db.execute('''
            INSERT OR REPLACE INTO job_configs (job_id, schedule, tolerance_minutes, max_runtime_minutes, paused)
            VALUES (?, ?, ?, ?, ?)
        ''', (job_id, schedule, tolerance_minutes, max_runtime_minutes, paused))

def get_job_config(job_id: str) -> Optional[dict]:
    """Get a job configuration by ID"""
    with get_db() as db:
        cursor = db.execute('''
            SELECT 
                job_id,
                schedule,
                tolerance_minutes,
                max_runtime_minutes,
                paused,
                last_start,
                last_end,
                duration
            FROM job_configs 
            WHERE job_id = ?
        ''', (job_id,))
        
        row = cursor.fetchone()
        if row:
            return {
                'job_id': row[0],
                'schedule': row[1],
                'tolerance_minutes': row[2],
                'max_runtime_minutes': row[3],
                'paused': bool(row[4]),
                'last_start_time': row[5],  # Keep the _time suffix for frontend compatibility
                'last_end_time': row[6],    # Keep the _time suffix for frontend compatibility
                'duration': row[7]
            }
        return None

def get_all_job_configs():
    """Get all job configurations"""
    with get_db() as db:
        cursor = db.execute('''
            SELECT 
                job_id,
                schedule,
                tolerance_minutes,
                max_runtime_minutes,
                paused,
                last_start,
                last_end,
                duration
            FROM job_configs
            ORDER BY job_id
        ''')
        
        jobs = []
        for row in cursor:
            jobs.append({
                'job_id': row[0],
                'schedule': row[1],
                'tolerance_minutes': row[2],
                'max_runtime_minutes': row[3],
                'paused': bool(row[4]),
                'last_start_time': row[5],  # Keep the _time suffix for frontend compatibility
                'last_end_time': row[6],    # Keep the _time suffix for frontend compatibility
                'duration': row[7]
            })
        return jobs

def start_job_run(job_id: str, client_info: dict, alert_message: str = None):
    """Record a job start with client information"""
    with get_db() as db:
        db.execute('''
            INSERT INTO job_runs (
                job_id, start_time, client_info
            )
            VALUES (?, ?, ?)
        ''', (
            job_id,
            datetime.now(pytz.UTC).isoformat(),
            json.dumps(client_info) if client_info else None
        ))
        return db.lastrowid

def end_job_run(job_id: str, run_id: int):
    """Record a job end"""
    with get_db() as db:
        end_time = datetime.now(pytz.UTC)
        db.execute('SELECT start_time FROM job_runs WHERE id = ?', (run_id,))
        row = db.fetchone()
        if not row:
            return None
        
        start_time = from_db_datetime(row['start_time'])
        duration = (end_time - start_time).total_seconds()
        
        db.execute('''
            UPDATE job_runs
            SET end_time = ?, duration = ?
            WHERE id = ?
        ''', (end_time.isoformat(), duration, run_id))
        return duration

def get_latest_job_run(job_id: str):
    """Get the most recent run for a job"""
    with get_db() as db:
        db.execute('''
            SELECT * FROM job_runs
            WHERE job_id = ?
            ORDER BY start_time DESC
            LIMIT 1
        ''', (job_id,))
        row = db.fetchone()
        if row:
            result = dict(row)
            result['start_time'] = from_db_datetime(result.get('start_time'))
            result['end_time'] = from_db_datetime(result.get('end_time'))
            result['client_info'] = json.loads(result.get('client_info')) if result.get('client_info') else None
            return result
        return None

def get_job_status(job_id: str):
    """Get comprehensive job status including config and latest run"""
    with get_db() as db:
        # Get job config
        db.execute('SELECT * FROM job_configs WHERE job_id = ?', (job_id,))
        config = db.fetchone()
        if not config:
            return None
        
        # Get latest run with client information and latest alert status
        db.execute('''
            WITH LatestAlert AS (
                SELECT 
                    job_id,
                    alert_message,
                    detected_time as alert_time,
                    acknowledged
                FROM job_alerts 
                WHERE job_id = ?
                ORDER BY detected_time DESC
                LIMIT 1
            )
            SELECT 
                job_runs.*,
                json_extract(client_info, '$') as client_info,
                la.alert_message,
                la.alert_time,
                la.acknowledged as alert_acknowledged
            FROM job_runs
            LEFT JOIN LatestAlert la ON job_runs.job_id = la.job_id
            WHERE job_runs.job_id = ?
            ORDER BY start_time DESC
            LIMIT 1
        ''', (job_id, job_id))
        latest_run = db.fetchone()
        
        status = dict(config)
        # Initialize default values for jobs that haven't run yet
        status.update({
            'last_start': None,
            'last_end': None,
            'duration': None,
            'last_alert': None,
            'last_alert_message': None,
            'last_alert_acknowledged': False,
            'client': None
        })
        
        if latest_run:
            run_info = dict(latest_run)
            run_info['start_time'] = from_db_datetime(run_info.get('start_time'))
            run_info['end_time'] = from_db_datetime(run_info.get('end_time'))
            run_info['alert_time'] = from_db_datetime(run_info.get('alert_time'))
            status.update({
                'last_start': run_info['start_time'],
                'last_end': run_info['end_time'],
                'duration': run_info['duration'],
                'last_alert': run_info['alert_time'],
                'last_alert_message': run_info['alert_message'],
                'last_alert_acknowledged': bool(run_info.get('alert_acknowledged', False)),
                'client': {
                    'ip_address': run_info['ip_address'],
                    'user_agent': run_info['user_agent'],
                    'hostname': run_info['hostname'],
                    'os_info': run_info['os_info'],
                    'additional_info': json.loads(run_info['client_info']) if run_info['client_info'] else {}
                }
            })
        
        return status

def get_all_job_statuses() -> List[dict]:
    """Get status for all jobs"""
    jobs = []
    configs = get_all_job_configs()
    for config in configs:
        status = get_job_status(config['job_id'])
        if status:
            jobs.append(status)
    return jobs

def add_job_alert(
    job_id: str,
    alert_type: AlertType,
    alert_message: str,
    expected_start_time: Optional[datetime] = None,
    actual_start_time: Optional[datetime] = None
) -> int:
    """Add a job alert to the database"""
    with get_db() as db:
        db.execute('''
            INSERT INTO job_alerts (
                job_id, alert_type, expected_start_time, actual_start_time,
                detected_time, alert_message
            ) VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            job_id,
            alert_type.value,
            to_utc(expected_start_time).isoformat() if expected_start_time else None,
            to_utc(actual_start_time).isoformat() if actual_start_time else None,
            datetime.now(pytz.UTC).isoformat(),
            alert_message
        ))
        return db.lastrowid

def get_job_alerts(
    job_id: Optional[str] = None,
    alert_type: Optional[AlertType] = None,
    include_acknowledged: bool = False
) -> List[dict]:
    """Get job alerts, optionally filtered by job_id, type and acknowledgment status"""
    with get_db() as db:
        query = """
            WITH RankedAlerts AS (
                SELECT 
                    id,
                    job_id,
                    alert_type,
                    COUNT(*) OVER (PARTITION BY job_id, alert_type) as alert_count,
                    MIN(detected_time) as first_detected,
                    MAX(detected_time) as last_detected,
                    alert_message,
                    expected_start_time,
                    actual_start_time,
                    detected_time,
                    acknowledged,
                    created_at,
                    ROW_NUMBER() OVER (PARTITION BY job_id, alert_type ORDER BY detected_time DESC) as rn
                FROM job_alerts
                WHERE 1=1
        """
        params = []
        
        if not include_acknowledged:
            query += " AND acknowledged = 0"
        
        if job_id:
            query += " AND job_id = ?"
            params.append(job_id)
        
        if alert_type:
            query += " AND alert_type = ?"
            params.append(alert_type.value)
            
        query += """
            GROUP BY job_id, alert_type
            )
            SELECT * FROM RankedAlerts WHERE rn = 1
            ORDER BY detected_time DESC
        """
        
        results = []
        for row in db.execute(query, params).fetchall():
            result = dict(row)
            result['expected_start_time'] = from_db_datetime(result['expected_start_time'])
            result['actual_start_time'] = from_db_datetime(result['actual_start_time'])
            result['detected_time'] = from_db_datetime(result['detected_time'])
            result['created_at'] = from_db_datetime(result['created_at'])
            results.append(result)
        
        return results

def acknowledge_job_alert(alert_id: int) -> bool:
    """Mark a job alert as acknowledged"""
    with get_db() as db:
        # Get the job_id and alert_type for the alert we're acknowledging
        cursor = db.execute(
            "SELECT job_id, alert_type FROM job_alerts WHERE id = ?",
            (alert_id,)
        )
        alert = cursor.fetchone()
        
        if not alert:
            return False
            
        # Acknowledge all alerts of the same type for this job
        db.execute(
            "UPDATE job_alerts SET acknowledged = 1 WHERE job_id = ? AND alert_type = ?",
            (alert['job_id'], alert['alert_type'])
        )
        return True

def update_job_config(job_id: str, max_runtime_minutes: int) -> bool:
    """Update a job configuration with max runtime"""
    with get_db() as db:
        db.execute('''
            UPDATE job_configs
            SET max_runtime_minutes = ?
            WHERE job_id = ?
        ''', (max_runtime_minutes, job_id))
        return db.rowcount > 0

def get_running_jobs() -> List[dict]:
    """Get all currently running jobs (started but not ended)"""
    with get_db() as db:
        db.execute('''
            SELECT jr.*, jc.max_runtime_minutes
            FROM job_runs jr
            JOIN job_configs jc ON jr.job_id = jc.job_id
            WHERE jr.start_time IS NOT NULL
            AND jr.end_time IS NULL
        ''')
        jobs = [dict(row) for row in db.fetchall()]
        # Convert datetime strings to UTC datetime objects
        for job in jobs:
            job['start_time'] = from_db_datetime(job.get('start_time'))
            job['end_time'] = from_db_datetime(job.get('end_time'))
            job['alert_time'] = from_db_datetime(job.get('alert_time'))
        return jobs

def delete_job(job_id: str) -> None:
    """Delete a job and all its related data"""
    with get_db() as db:
        # Delete job alerts
        db.execute('DELETE FROM job_alerts WHERE job_id = ?', (job_id,))
        # Delete job runs
        db.execute('DELETE FROM job_runs WHERE job_id = ?', (job_id,))
        # Delete job config
        db.execute('DELETE FROM job_configs WHERE job_id = ?', (job_id,))

def update_schema():
    """Update database schema without losing data"""
    with get_db() as db:
        # Check if max_runtime_minutes column exists
        cursor = db.execute("PRAGMA table_info(job_configs)")
        columns = [col[1] for col in cursor.fetchall()]
        
        # Add max_runtime_minutes if it doesn't exist
        if 'max_runtime_minutes' not in columns:
            db.execute('''
                ALTER TABLE job_configs 
                ADD COLUMN max_runtime_minutes INTEGER
            ''')
        
        # Add paused column if it doesn't exist
        if 'paused' not in columns:
            db.execute('''
                ALTER TABLE job_configs 
                ADD COLUMN paused BOOLEAN DEFAULT FALSE
            ''')
        
        # Add last_start, last_end, duration columns if they don't exist
        if 'last_start' not in columns:
            db.execute('''
                ALTER TABLE job_configs 
                ADD COLUMN last_start TIMESTAMP
            ''')
        if 'last_end' not in columns:
            db.execute('''
                ALTER TABLE job_configs 
                ADD COLUMN last_end TIMESTAMP
            ''')
        if 'duration' not in columns:
            db.execute('''
                ALTER TABLE job_configs 
                ADD COLUMN duration REAL
            ''')
        
        # Add needs_end_signal column if it doesn't exist
        if 'needs_end_signal' not in columns:
            db.execute('''
                ALTER TABLE job_configs 
                ADD COLUMN needs_end_signal BOOLEAN DEFAULT FALSE
            ''')

def has_existing_alert(job_id: str, expected_start_time: Optional[datetime], alert_type: AlertType) -> bool:
    """Check if an alert already exists for this job and expected start time"""
    with get_db() as db:
        query = """
            SELECT COUNT(*) as count 
            FROM job_alerts 
            WHERE job_id = ? AND alert_type = ?
        """
        params = [job_id, alert_type.value]
        
        if expected_start_time:
            query += " AND expected_start_time = ?"
            params.append(expected_start_time.isoformat())
        
        result = db.execute(query, params).fetchone()
        return result['count'] > 0

def get_job_runs(offset: int = 0, limit: int = 10) -> List[dict]:
    """Get paginated job runs"""
    with get_db() as db:
        cursor = db.execute('''
            SELECT 
                jr.job_id,
                jr.start_time,
                jr.end_time,
                jr.client_info,
                jc.max_runtime_minutes
            FROM job_runs jr
            LEFT JOIN job_configs jc ON jr.job_id = jc.job_id
            ORDER BY jr.start_time DESC
            LIMIT ? OFFSET ?
        ''', (limit, offset))
        
        runs = []
        for row in cursor:
            run = {
                'job_id': row[0],
                'start_time': from_db_datetime(row[1]) if row[1] else None,
                'end_time': from_db_datetime(row[2]) if row[2] else None,
                'client_info': json.loads(row[3]) if row[3] else None,
                'is_health_check': not row[4],  # True if max_runtime_minutes is None/0
            }
            if run['start_time'] and run['end_time'] and not run['is_health_check']:
                run['duration'] = (run['end_time'] - run['start_time']).total_seconds() / 60
            else:
                run['duration'] = None
            runs.append(run)
        return runs

def count_job_runs() -> int:
    """Get total count of job runs"""
    with get_db() as db:
        cursor = db.execute('SELECT COUNT(*) FROM job_runs')
        return cursor.fetchone()[0]

def record_job_start(job_id: str, client_info: dict = None) -> None:
    """Record a job start in both job_configs and job_runs tables"""
    now = datetime.now(pytz.utc)
    with get_db() as db:
        # Update the job_configs table
        db.execute('''
            UPDATE job_configs 
            SET last_start = ?
            WHERE job_id = ?
        ''', (now, job_id))
        
        # Insert into job_runs table
        db.execute('''
            INSERT INTO job_runs (job_id, start_time, client_info)
            VALUES (?, ?, ?)
        ''', (job_id, now, json.dumps(client_info) if client_info else None))

def record_job_end(job_id: str) -> None:
    """Record a job end in both job_configs and job_runs tables"""
    now = datetime.now(pytz.utc)
    with get_db() as db:
        # Get the last start time from job_runs
        last_run = db.execute('''
            SELECT id, start_time 
            FROM job_runs 
            WHERE job_id = ? AND end_time IS NULL
            ORDER BY start_time DESC LIMIT 1
        ''', (job_id,)).fetchone()
        
        if last_run:
            run_id, start_time = last_run
            start_time = datetime.fromisoformat(start_time) if isinstance(start_time, str) else start_time
            duration = (now - start_time).total_seconds() / 60  # Convert to minutes
            
            # Update job_runs
            db.execute('''
                UPDATE job_runs 
                SET end_time = ?, duration = ?
                WHERE id = ?
            ''', (now, duration, run_id))
            
            # Update job_configs
            db.execute('''
                UPDATE job_configs 
                SET last_end = ?, duration = ?
                WHERE job_id = ?
            ''', (now, duration, job_id))

def update_job_pause_status(job_id: str, paused: bool) -> None:
    """Update the pause status of a job"""
    with get_db() as db:
        db.execute(
            """
            UPDATE job_configs 
            SET paused = ?
            WHERE job_id = ?
            """,
            (paused, job_id)
        )

def add_job(job_id: str, schedule: str, tolerance_minutes: int, max_runtime_minutes: int = None):
    needs_end_signal = max_runtime_minutes is not None and max_runtime_minutes > 0
    with get_db() as db:
        db.execute('''
        INSERT OR REPLACE INTO job_configs 
        (job_id, schedule, tolerance_minutes, max_runtime_minutes, needs_end_signal) 
        VALUES (?, ?, ?, ?, ?)
        ''', (job_id, schedule, tolerance_minutes, max_runtime_minutes, needs_end_signal))

# Initialize database when module is imported
init_db()
