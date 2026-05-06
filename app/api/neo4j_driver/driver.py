# app/api/neo4j_driver/driver.py
from neo4j import GraphDatabase
import os

_driver = None

def init_neo4j(app):
    """
    Initialize the Neo4j driver and create constraints.
    Call this from app.create_app() after app.config is loaded.
    """
    global _driver
    uri = app.config.get("NEO4J_URI") or os.getenv("NEO4J_URI")
    user = app.config.get("NEO4J_USER") or os.getenv("NEO4J_USER")
    pwd = app.config.get("NEO4J_PASSWORD") or os.getenv("NEO4J_PASSWORD")
    if not uri or not user or not pwd:
        raise RuntimeError("NEO4J_URI, NEO4J_USER and NEO4J_PASSWORD must be set")
    _driver = GraphDatabase.driver(uri, auth=(user, pwd))
    # Create uniqueness constraints (if supported)
    with _driver.session() as session:
        try:
            # Neo4j 4.4+ supports IF NOT EXISTS syntax, but use try/except for compatibility
            session.run("CREATE CONSTRAINT policy_id_unique IF NOT EXISTS FOR (p:Policy) REQUIRE p.policy_id IS UNIQUE")
            session.run("CREATE CONSTRAINT claim_internal_id_unique IF NOT EXISTS FOR (c:Claim) REQUIRE c.claim_internal_id IS UNIQUE")
        except Exception:
            # Fallback: older servers; attempt to create constraints safely
            try:
                session.run("CREATE CONSTRAINT ON (p:Policy) ASSERT p.policy_id IS UNIQUE")
            except Exception:
                pass
            try:
                session.run("CREATE CONSTRAINT ON (c:Claim) ASSERT c.claim_internal_id IS UNIQUE")
            except Exception:
                pass

def get_driver():
    if _driver is None:
        raise RuntimeError("Neo4j driver not initialized. Call init_neo4j(app) in create_app().")
    return _driver

def close_neo4j(_=None):
    global _driver
    if _driver:
        _driver.close()
        _driver = None