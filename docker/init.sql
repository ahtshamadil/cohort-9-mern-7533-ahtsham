-- the mysql image only creates the one database named in MYSQL_DATABASE, so the
-- test database has to be made here. tests run against notes_test so a test run
-- never wipes development data.
CREATE DATABASE IF NOT EXISTS notes_test;
