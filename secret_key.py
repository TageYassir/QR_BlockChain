#!/usr/bin/env python3
# secret_key.py
import secrets
from pathlib import Path

secret = secrets.token_hex(32)
env_line = f"SECRET_KEY={secret}\n"

env_path = Path("D:\\QR_BlockChain\\backend\\.env")
env_path.write_text(env_path.read_text() + env_line if env_path.exists() else env_line)
print("SECRET_KEY generated and appended to .env:")
print(secret)
