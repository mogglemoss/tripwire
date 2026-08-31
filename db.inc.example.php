<?php

try {
    $mysql = new PDO(
        'mysql:host=localhost;dbname=tripwire_database;charset=utf8',
        'username',
        'password',
        Array(
            PDO::ATTR_PERSISTENT     => true,
            // Fail loudly. Without this a failed query returns false and the
            // app carries on with no data, which reads as "empty" rather than
            // "broken" -- a dead database looks like a quiet one.
            PDO::ATTR_ERRMODE        => PDO::ERRMODE_EXCEPTION,
            // Send real prepared statements to MySQL instead of interpolating
            // them client-side.
            PDO::ATTR_EMULATE_PREPARES => false
        )
    );
} catch (PDOException $error) {
    // Do not continue with an unset $mysql: every later query would fatal with
    // a confusing error a long way from the actual cause.
    error_log('Tripwire: database connection failed: ' . $error->getMessage());
    http_response_code(503);
    exit('Database unavailable');
}
