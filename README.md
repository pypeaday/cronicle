# Cronjob Monitor/Healthcheck Service

This is a modern Python application that serves as a cron job monitor and healthcheck service. It tracks the start time and duration of cron jobs using FastAPI.

## Features
- RESTful API endpoints for job monitoring
- Automatic API documentation (Swagger UI)
- Type-safe request/response validation
- Async support

## Requirements
- Python 3.7+
- FastAPI
- Uvicorn
- Pydantic

## Installation
1. Clone the repository
2. Navigate to the project directory
3. Install the required packages:
   ```bash
   pip install -r requirements.txt
   ```

## Running the Application
To run the application, execute:
```bash
python app.py
```
or directly with uvicorn:
```bash
uvicorn app:app --reload
```

The API will be available at `http://localhost:8000/`

### API Documentation
- Interactive API documentation (Swagger UI): `http://localhost:8000/docs`
- Alternative API documentation (ReDoc): `http://localhost:8000/redoc`

## API Endpoints
- `POST /start_job`: Starts a job and tracks its start time
  ```json
  {
    "job_id": "your-job-id"
  }
  ```
- `POST /end_job`: Ends a job and tracks its duration
  ```json
  {
    "job_id": "your-job-id"
  }
  ```
