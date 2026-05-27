FROM python:3.12-slim

WORKDIR /app

COPY apps/workers ./apps/workers

WORKDIR /app/apps/workers

CMD ["python", "-m", "src.main"]
