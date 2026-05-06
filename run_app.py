"""Run the Flask `app` package for local testing.

This script loads environment from `backend/.env`, creates the app and runs it on port 5001.
"""
import os
from dotenv import load_dotenv

# Load backend .env if present
root = os.path.abspath(os.path.dirname(__file__))
env_path = os.path.join(root, "backend", ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

from app import create_app


def main():
    app = create_app()
    port = int(os.environ.get("FLASK_RUN_PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)


if __name__ == "__main__":
    main()
