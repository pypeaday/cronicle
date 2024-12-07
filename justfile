build:
    docker build -t cronicle .
serve:
    docker run -p 8000:8000 -v $(pwd):/app/ cronicle
