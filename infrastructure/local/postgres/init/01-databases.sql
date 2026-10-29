SELECT 'CREATE DATABASE smart_oati_project'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'smart_oati_project')\gexec

SELECT 'CREATE DATABASE smart_oati_notification'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'smart_oati_notification')\gexec

SELECT 'CREATE DATABASE smart_oati_audit'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'smart_oati_audit')\gexec
