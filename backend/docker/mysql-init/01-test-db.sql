-- A separate database for the test suite.
CREATE DATABASE IF NOT EXISTS kaunter_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON kaunter_test.* TO 'kaunter'@'%';
