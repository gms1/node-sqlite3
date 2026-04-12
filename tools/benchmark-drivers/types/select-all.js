'use strict';
exports.readonly = true; // Reading 100 rows into an array (`.all()`)

exports['better-sqlite3'] = (db, { table, columns, count }) => {
    const stmt = db.prepare(`SELECT ${columns.join(', ')} FROM ${table} WHERE rowid >= ? LIMIT 100`);
    let rowid = -100;
    return () => stmt.all((rowid += 100) % count + 1);
};

exports['@homeofthings/sqlite3'] = async (db, { table, columns, count }) => {
    const stmt = await db.prepare(`SELECT ${columns.join(', ')} FROM ${table} WHERE rowid >= ? LIMIT 100`);
    let rowid = -100;
    return async () => await stmt.all((rowid += 100) % count + 1);
};

exports['node:sqlite'] = (db, { table, columns, count }) => {
    const stmt = db.prepare(`SELECT ${columns.join(', ')} FROM ${table} WHERE rowid >= ? LIMIT 100`);
    let rowid = -100;
    return () => stmt.all((rowid += 100) % count + 1);
};
