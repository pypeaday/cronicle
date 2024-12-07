build:
    docker build -t cronicle .

serve:
    docker run -p 8000:8000 -v $(pwd):/app cronicle

up:
    docker compose up --build

down:
    docker compose down
