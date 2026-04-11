'use strict';

/*
	Every benchmark trial will be executed once for each SQLite driver listed
	below. Each driver has a function to open a new database connection on a
	given filename and a list of PRAGMA statements.

	When useLocal is true, @homeofthings/sqlite3 is loaded from the local
	development path (../../lib/sqlite3) instead of the npm package.
 */

module.exports = (useLocal = false) => new Map([
    ['better-sqlite3', async (filename, pragma) => {
        const db = require('better-sqlite3')(filename);
        for (const str of pragma) db.pragma(str);
        return db;
    }],
    ['@homeofthings/sqlite3', async (filename, pragma) => {
        // Use local development path when --use-local flag is set
        const modulePath = useLocal
            ? require.resolve('../../lib/sqlite3')
            : '@homeofthings/sqlite3';
        const { SqliteDatabase } = require(modulePath);
        const db = await SqliteDatabase.open(filename);
        for (const str of pragma) await db.run(`PRAGMA ${str}`);
        return db;
    }],
    ...!moduleExists('node:sqlite') ? [] : [
        ['node:sqlite', async (filename, pragma) => {
            const db = new (require('node:sqlite').DatabaseSync)(filename);
            for (const str of pragma) db.exec(`PRAGMA ${str}`);
            return db;
        }]
    ],
]);

function moduleExists(moduleName) {
    try {
        return !!(require.resolve(moduleName));
    } catch (_) {
        return false;
    }
};
