"""Retired Python RQ entrypoint.

Test execution now runs in the Node worker at worker/src/index.ts.
"""
import sys

print("The Python RQ worker has been replaced by the Node worker in worker/src/index.ts.")
sys.exit(1)
