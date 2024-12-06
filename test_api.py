import requests
import time
from datetime import datetime
import pytz

BASE_URL = "http://localhost:8000"

def configure_job(job_id, schedule, tolerance_minutes=10):
    """Configure a job with schedule and tolerance window"""
    response = requests.post(
        f"{BASE_URL}/configure_job",
        json={
            "job_id": job_id,
            "schedule": schedule,
            "tolerance_minutes": tolerance_minutes
        }
    )
    print(f"\nConfiguring job: {job_id}")
    print(f"Schedule: {schedule}")
    print(f"Tolerance: {tolerance_minutes} minutes")
    print(f"Response: {response.status_code}")
    print(f"Data: {response.json()}")
    return response.json()

def start_job(job_id):
    """Start a job"""
    response = requests.post(
        f"{BASE_URL}/start_job",
        params={"job_id": job_id}
    )
    print(f"\nStarting job: {job_id}")
    print(f"Response: {response.status_code}")
    print(f"Data: {response.json()}")
    return response.json()

def end_job(job_id):
    """End a job"""
    response = requests.post(
        f"{BASE_URL}/end_job",
        params={"job_id": job_id}
    )
    print(f"\nEnding job: {job_id}")
    print(f"Response: {response.status_code}")
    print(f"Data: {response.json()}")
    return response.json()

def get_job_status(job_id):
    """Get the status of a job"""
    response = requests.get(f"{BASE_URL}/job_status/{job_id}")
    print(f"\nGetting status for job: {job_id}")
    print(f"Response: {response.status_code}")
    print(f"Data: {response.json()}")
    return response.json()

def run_tests():
    """Run a series of test scenarios"""
    
    print("Starting API tests...")
    
    # Test 1: Configure and run a job within its schedule window
    # Schedule for every minute (for testing purposes)
    print("\n=== Test 1: Job within schedule window ===")
    configure_job("daily-backup", "* * * * *", 1)  # Every minute with 1-minute tolerance
    start_job("daily-backup")
    time.sleep(2)
    end_job("daily-backup")
    get_job_status("daily-backup")
    
    # Test 2: Try to run an unconfigured job
    print("\n=== Test 2: Unconfigured job ===")
    try:
        start_job("unconfigured-job")
    except requests.exceptions.HTTPError as e:
        print(f"Expected error: {e}")
    
    # Test 3: Configure a job with noon schedule
    print("\n=== Test 3: Configuring noon job ===")
    configure_job("noon-job", "0 12 * * *", 10)  # Every day at noon, 10-minute tolerance
    get_job_status("noon-job")
    
    # Test 4: Run a job outside its schedule window
    print("\n=== Test 4: Job outside schedule window ===")
    configure_job("strict-job", "0 0 * * *", 5)  # Midnight with 5-minute tolerance
    start_job("strict-job")  # This should generate an alert since we're not running at midnight
    end_job("strict-job")
    get_job_status("strict-job")

if __name__ == "__main__":
    try:
        run_tests()
    except requests.exceptions.ConnectionError:
        print("\nError: Could not connect to the API server.")
        print("Make sure the API server is running (python app.py) before running tests.")
