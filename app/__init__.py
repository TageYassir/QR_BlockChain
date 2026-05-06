# app/__init__.py
from flask import Flask
from .config import Config
from app.api.neo4j_driver.driver import init_neo4j
from app.api.claim_api.route import claim_bp

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialize Neo4j driver
    init_neo4j(app)

    # Register blueprints
    app.register_blueprint(claim_bp)

    return app