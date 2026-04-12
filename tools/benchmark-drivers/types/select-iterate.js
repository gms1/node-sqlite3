'use strict';
exports.readonly = true; // Iterating over 100 rows (`.iterate()`)

exports['better-sqlite3'] = (db, { table, columns, count }) => {
    const stmt = db.prepare(`SELECT ${columns.join(', ')} FROM ${table} WHERE rowid >= ? LIMIT 100`);
    let rowid = -100;
    return () => {
        for (const row of stmt.iterate((rowid += 100) % count + 1)) {
            // iterate over rows - row intentionally unused
        }
    };
};

exports['@homeofthings/sqlite3'] = async (db, { table, columns, count }) => {
    const stmt = await db.prepare(`SELECT ${columns.join(', ')} FROM ${table} WHERE rowid = ?`);
    let rowid = -100;
    return async () => {
        rowid += 100;
        for (let index = 0; index < 100; index++) {
            await stmt.get((rowid + index) % count + 1);
        }
    };
};

exports['node:sqlite'] = (db, { table, columns, count }) => {
    const stmt = db.prepare(`SELECT ${columns.join(', ')} FROM ${table} WHERE rowid >= ? LIMIT 100`);
    let rowid = -100;
    return () => {
        for (const row of stmt.iterate((rowid += 100) % count + 1)) {
            // iterate over rows - row intentionally unused
        }
    };
};
