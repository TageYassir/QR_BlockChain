// Run once to create constraints
CREATE CONSTRAINT case_id IF NOT EXISTS FOR (c:Case) REQUIRE c.caseId IS UNIQUE;
CREATE CONSTRAINT photo_id IF NOT EXISTS FOR (p:Photo) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT user_address IF NOT EXISTS FOR (u:User) REQUIRE u.address IS UNIQUE;
CREATE CONSTRAINT identifier_value IF NOT EXISTS FOR (i:Identifier) REQUIRE i.value IS UNIQUE;
