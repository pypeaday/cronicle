FROM python:3.11-slim
ENV VIRTUAL_ENV /opt/app-env
ENV PATH "${VIRTUAL_ENV}/bin:$PATH"
ENV UV_VIRTUALENV ${VIRTUAL_ENV}
ENV CRONICLE_PORT 8000

WORKDIR /app

# Create non-root user with UID:GID 1000:1000
RUN groupadd -g 1000 appuser && \
    useradd -u 1000 -g appuser -s /bin/bash -m appuser

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Create virtualenv and set permissions
RUN mkdir -p ${VIRTUAL_ENV} && \
    uv venv ${VIRTUAL_ENV} && \
    chown -R appuser:appuser ${VIRTUAL_ENV}

# Install dependencies
COPY requirements.txt .
RUN uv pip install --no-cache -r requirements.txt

# Create data directory and set permissions
RUN mkdir -p /app/data && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
CMD ["python", "app.py"]
