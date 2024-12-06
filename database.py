import sqlite3
from contextlib import contextmanager
from datetime import datetime
import json
from pathlib import Path

DATABASE_FILE = Path(__file__).parent / "jobs.db"

def init_db():
    """Initialize the database with required tables"""
    # Ensure the parent directory exists
    DATABASE_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    # Create database and tables
    with get_db() as db:
        db.execute('''
            CREATE TABLE IF NOT EXISTS job_configs (
                job_id TEXT PRIMARY KEY,
                schedule TEXT NOT NULL,
                tolerance_minutes INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        db.execute('''
            CREATE TABLE IF NOT EXISTS job_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                start_time TIMESTAMP,
                end_time TIMESTAMP,
                duration REAL,
                alert_time TIMESTAMP,
                alert_message TEXT,
                ip_address TEXT,
                user_agent TEXT,
                hostname TEXT,
                os_info TEXT,
                client_metadata TEXT,
                FOREIGN KEY (job_id) REFERENCES job_configs (job_id)
            )
        ''')

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

def save_job_config(job_id: str, schedule: str, tolerance_minutes: int):
    """Save or update a job configuration"""
    with get_db() as db:
        db.execute('''
            INSERT OR REPLACE INTO job_configs (job_id, schedule, tolerance_minutes)
            VALUES (?, ?, ?)
        ''', (job_id, schedule, tolerance_minutes))

def get_job_config(job_id: str):
    """Get a job configuration by ID"""
    with get_db() as db:
        db.execute('SELECT * FROM job_configs WHERE job_id = ?', (job_id,))
        row = db.fetchone()
        if row:
            return dict(row)
        return None

def get_all_job_configs():
    """Get all job configurations"""
    with get_db() as db:
        db.execute('SELECT * FROM job_configs')
        return [dict(row) for row in db.fetchall()]

def start_job_run(job_id: str, client_info: dict, alert_message: str = None):
    """Record a job start with client information"""
    with get_db() as db:
        db.execute('''
            INSERT INTO job_runs (
                job_id, start_time, alert_message, alert_time,
                ip_address, user_agent, hostname, os_info, client_metadata
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            job_id,
            datetime.now().isoformat(),
            alert_message,
            datetime.now().isoformat() if alert_message else None,
            client_info.get('ip_address'),
            client_info.get('user_agent'),
            client_info.get('hostname'),
            client_info.get('os_info'),
            json.dumps(client_info.get('additional_info', {}))
        ))
        return db.lastrowid

def end_job_run(job_id: str, run_id: int):
    """Record a job end"""
    with get_db() as db:
        end_time = datetime.now()
        db.execute('SELECT start_time FROM job_runs WHERE id = ?', (run_id,))
        row = db.fetchone()
        if not row:
            return None
        
        start_time = datetime.fromisoformat(row['start_time'])
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
            return dict(row)
        return None

def get_job_status(job_id: str):
    """Get comprehensive job status including config and latest run"""
    with get_db() as db:
        # Get job config
        db.execute('SELECT * FROM job_configs WHERE job_id = ?', (job_id,))
        config = db.fetchone()
        if not config:
            return None
        
        # Get latest run with client information
        db.execute('''
            SELECT 
                job_runs.*,
                json_extract(client_metadata, '$') as client_info
            FROM job_runs
            WHERE job_id = ?
            ORDER BY start_time DESC
            LIMIT 1
        ''', (job_id,))
        latest_run = db.fetchone()
        
        status = dict(config)
        if latest_run:
            run_info = dict(latest_run)
            status.update({
                'last_start_time': run_info['start_time'],
                'last_end_time': run_info['end_time'],
                'duration': run_info['duration'],
                'last_alert': run_info['alert_time'],
                'last_alert_message': run_info['alert_message'],
                'client': {
                    'ip_address': run_info['ip_address'],
                    'user_agent': run_info['user_agent'],
                    'hostname': run_info['hostname'],
                    'os_info': run_info['os_info'],
                    'additional_info': json.loads(run_info['client_metadata']) if run_info['client_metadata'] else {}
                }
            })
        
        return status

def get_all_jobs_status():
    """Get status for all jobs"""
    jobs = []
    for config in get_all_job_configs():
        status = get_job_status(config['job_id'])
        if status:
            jobs.append(status)
    return jobs

# Initialize database when module is imported
init_db()
