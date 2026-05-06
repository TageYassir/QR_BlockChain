from flask import Flask, jsonify, request
from web3 import Web3
import os
import json
from dotenv import load_dotenv
import importlib.util
load_dotenv()

# Load backend/config.py as a module to avoid package import issues when running
config_path = os.path.join(os.path.dirname(__file__), "config.py")
spec = importlib.util.spec_from_file_location("backend.config", config_path)
config_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config_mod)
Config = getattr(config_mod, "Config")

app = Flask(__name__)
app.config.from_object(Config)

# create web3 provider from config
RPC_URL = app.config.get('RPC_URL', 'http://127.0.0.1:8545')
CONTRACT_ADDRESS = app.config.get('CONTRACT_ADDRESS', '')
PRIVATE_KEY = app.config.get('PRIVATE_KEY', '')

w3 = Web3(Web3.HTTPProvider(RPC_URL))

with open(os.path.join(os.path.dirname(__file__), 'Greeter.json')) as f:
    abi = json.load(f)['abi']

# Initialize Neo4j driver and register API blueprints if available
try:
    from backend.api.neo4j_driver.driver import init_neo4j
    from backend.api.claim_api.route import claim_bp
    init_neo4j(app)
    app.register_blueprint(claim_bp)
except Exception:
    # If migration hasn't been applied or config missing, continue without API
    pass

def get_contract():
    if not CONTRACT_ADDRESS:
        return None
    return w3.eth.contract(address=Web3.to_checksum_address(CONTRACT_ADDRESS), abi=abi)

@app.route('/health')
def health():
    return jsonify({'ok': True, 'rpc': RPC_URL, 'connected': w3.is_connected()})

@app.route('/greet', methods=['GET'])
def greet():
    contract = get_contract()
    if not contract:
        return jsonify({'error': 'CONTRACT_ADDRESS not set'}), 400
    try:
        val = contract.functions.greet().call()
        return jsonify({'greeting': val})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/set_greeting', methods=['POST'])
def set_greeting():
    data = request.get_json() or {}
    new_greeting = data.get('greeting')
    if not new_greeting:
        return jsonify({'error': 'missing greeting'}), 400
    if not PRIVATE_KEY:
        return jsonify({'error': 'PRIVATE_KEY not set in env'}), 400
    contract = get_contract()
    if not contract:
        return jsonify({'error': 'CONTRACT_ADDRESS not set'}), 400

    acct = w3.eth.account.from_key(PRIVATE_KEY)
    nonce = w3.eth.get_transaction_count(acct.address)
    chain_id = w3.eth.chain_id
    tx = contract.functions.setGreeting(new_greeting).build_transaction({
        'from': acct.address,
        'nonce': nonce,
        'gas': 200000,
    })
    # Fill gas price/fees if required by network
    try:
        signed = acct.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        return jsonify({'tx_hash': tx_hash.hex()}), 202
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
