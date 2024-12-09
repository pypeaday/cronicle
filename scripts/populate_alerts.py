#!/usr/bin/env python3
import sqlite3
import random
from datetime import datetime, timedelta
import pytz
import os

# Ensure data directory exists
data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
os.makedirs(data_dir, exist_ok=True)

# Connect to the database
db_path = os.path.join(data_dir, 'jobs.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create jobs table if it doesn't exist
cursor.execute('''
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    schedule TEXT NOT NULL,
    command TEXT NOT NULL,
    created_at DATETIME NOT NULL
)
''')

# Sample jobs to populate
sample_jobs = [
    ('backup-job', 'Daily Backup', '0 0 * * *', 'backup.sh /data', '2024-12-01 00:00:00'),
    ('log-cleanup', 'Log Cleanup', '0 1 * * *', 'cleanup-logs.sh', '2024-12-01 00:00:00'),
    ('health-check', 'Health Check', '*/15 * * * *', 'health-check.sh', '2024-12-01 00:00:00'),
    ('data-sync', 'Data Sync', '*/30 * * * *', 'sync-data.sh', '2024-12-01 00:00:00'),
    ('report-gen', 'Report Generator', '0 6 * * 1-5', 'generate-report.sh', '2024-12-01 00:00:00')
]

# Insert sample jobs if they don't exist
for job in sample_jobs:
    cursor.execute('''
    INSERT OR IGNORE INTO jobs (id, name, schedule, command, created_at)
    VALUES (?, ?, ?, ?, ?)
    ''', job)

# Ensure alerts table exists
cursor.execute('''
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
    FOREIGN KEY (job_id) REFERENCES jobs(id)
)
''')

# Get existing jobs
cursor.execute('SELECT id FROM jobs')
job_ids = [row[0] for row in cursor.fetchall()]

if not job_ids:
    print("No jobs found in the database. Please add some jobs first.")
    conn.close()
    exit(1)

# Generate random historical timestamps
central = pytz.timezone('America/Chicago')
end_time = central.localize(datetime.now())
start_time = end_time - timedelta(days=7)  # Last 7 days

# Clear existing alerts
cursor.execute('DELETE FROM job_alerts')

# Generate random alerts for each job
for job_id in job_ids:
    # Generate 3-8 alerts per job
    num_alerts = random.randint(3, 8)
    
    for _ in range(num_alerts):
        # Random timestamp within the last 7 days
        detected_time = start_time + timedelta(
            seconds=random.randint(0, int((end_time - start_time).total_seconds()))
        )
        expected_start_time = detected_time - timedelta(minutes=random.randint(5, 30))
        actual_start_time = detected_time + timedelta(minutes=random.randint(5, 30)) if random.random() > 0.5 else None
        
        # Random alert type
        alert_type = random.choice(['MISSED_JOB', 'LONG_RUNNING'])
        
        # Message based on alert type
        if alert_type == 'MISSED_JOB':
            alert_message = f"Job {job_id} missed its scheduled run. Expected at {expected_start_time}, tolerance window ended at {detected_time}."
        else:
            alert_message = f"Job {job_id} has been running for longer than its maximum runtime."
        
        # Insert alert
        cursor.execute('''
        INSERT INTO job_alerts (
            job_id, alert_type, expected_start_time, actual_start_time,
            detected_time, alert_message, acknowledged
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            job_id, 
            alert_type, 
            expected_start_time.strftime('%Y-%m-%d %H:%M:%S'), 
            actual_start_time.strftime('%Y-%m-%d %H:%M:%S') if actual_start_time else None,
            detected_time.strftime('%Y-%m-%d %H:%M:%S'),
            alert_message,
            False
        ))

# Commit changes and close connection
conn.commit()
print(f"Generated alerts for {len(job_ids)} jobs")

# Print some sample alerts
print("\nSample of generated alerts:")
cursor.execute('''
SELECT j.name, a.alert_type, a.alert_message, a.detected_time 
FROM job_alerts a
JOIN jobs j ON a.job_id = j.id
ORDER BY a.detected_time DESC 
LIMIT 5
''')
for row in cursor.fetchall():
    print(f"{row[0]}: {row[1].upper()} - {row[2]} ({row[3]})")

conn.close()
