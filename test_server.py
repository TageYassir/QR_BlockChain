# test_neo4j.py
from neo4j import GraphDatabase

uri = "bolt://127.0.0.1:7687"   # or neo4j://127.0.0.1:7687 from your screenshot
user = "neo4j"
pwd = "12345678"       # put the password you set in Neo4j Desktop

d = GraphDatabase.driver(uri, auth=(user, pwd))
with d.session() as s:
    r = s.run("RETURN 1 AS ok").single()
    print("Neo4j test result:", r["ok"])
d.close()