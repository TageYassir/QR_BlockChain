import os
from dotenv import load_dotenv

# Load backend .env if present
root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
env_path = os.path.join(root, ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()


class Config:
    # Neo4j
    NEO4J_URI = os.getenv("NEO4J_URI")
    NEO4J_USER = os.getenv("NEO4J_USER")
    NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

    # Web3 / contract
    WEB3_PROVIDER = os.getenv("WEB3_PROVIDER")
    CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")
    CONTRACT_ABI_PATH = os.getenv("CONTRACT_ABI_PATH") or os.path.join(root, "Greeter.json")
    RELAYER_PRIVATE_KEY = os.getenv("RELAYER_PRIVATE_KEY")

    # Extra fields used by backend endpoints
    RPC_URL = os.getenv('RPC_URL', 'http://127.0.0.1:8545')
    PRIVATE_KEY = os.getenv('PRIVATE_KEY', '')

    # Optional
    WEB3_STORAGE_TOKEN = os.getenv("WEB3_STORAGE_TOKEN")
    SECRET_KEY = os.getenv("SECRET_KEY")
