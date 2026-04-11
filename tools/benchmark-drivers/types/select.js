'use strict';
exports.readonly = true; // Reading rows individually (`.get()`)

exports['better-sqlite3'] = (db, { table, columns, count }) => {
    const stmt = db.prepare(`SELECT ${columns.join(', ')} FROM ${table} WHERE rowid = ?`);
    let rowid = -1;
    return () => stmt.get(++rowid % count + 1);
};

exports['@homeofthings/sqlite3'] = async (db, { table, columns, count }) => {
    const stmt = await db.prepare(`SELECT ${columns.join(', ')} FROM ${table} WHERE rowid = ?`);
    let rowid = -1;
    return async () => await stmt.get(++rowid % count + 1);
};

exports['node:sqlite'] = (db, { table, columns, count }) => {
    const stmt = db.prepare(`SELECT ${columns.join(', ')} FROM ${table} WHERE rowid = ?`);
    let rowid = -1;
    return () => stmt.get(++rowid % count + 1);
};
