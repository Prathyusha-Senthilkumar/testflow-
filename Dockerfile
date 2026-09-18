# Playwright Test Runner Image for TestFlow
FROM mcr.microsoft.com/playwright/python:v1.40.0-jammy

WORKDIR /app

# Install pytest and project dependencies
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt pytest-playwright

# Create non-root runner user for security
RUN useradd -m -u 1001 testrunner && \
    mkdir -p /app/artifacts && \
    chown -R testrunner:testrunner /app

USER testrunner

ENV PYTHONUNBUFFERED=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

CMD ["pytest", "/app/test.py", "-v", "-s", "--output", "/app/artifacts"]
