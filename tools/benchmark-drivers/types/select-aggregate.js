'use strict';
exports.readonly = true; // Aggregate functions (COUNT, SUM, AVG, MIN, MAX) with WHERE clause

exports['better-sqlite3'] = (db, { table, columns }) => {
    const stmt = db.prepare(`
        SELECT COUNT(*), SUM(integer), AVG(real), MIN(text), MAX(text)
        FROM ${table}
        WHERE rowid >= ? AND rowid < ?
    `);
    let start = 0;
    return () => {
        const result = stmt.get(start, start + 1000);
        start = (start + 1) % 9000; // Cycle through 0-8999 to stay within 10000 rows
        return result;
    };
};

exports['@homeofthings/sqlite3'] = async (db, { table, columns }) => {
    const stmt = await db.prepare(`
        SELECT COUNT(*), SUM(integer), AVG(real), MIN(text), MAX(text)
        FROM ${table}
        WHERE rowid >= ? AND rowid < ?
    `);
    let start = 0;
    return async () => {
        const result = await stmt.get(start, start + 1000);
        start = (start + 1) % 9000; // Cycle through 0-8999 to stay within 10000 rows
        return result;
    };
};

exports['node:sqlite'] = (db, { table, columns }) => {
    const stmt = db.prepare(`
        SELECT COUNT(*), SUM(integer), AVG(real), MIN(text), MAX(text)
        FROM ${table}
        WHERE rowid >= ? AND rowid < ?
    `);
    let start = 0;
    return () => {
        const result = stmt.get(start, start + 1000);
        start = (start + 1) % 9000; // Cycle through 0-8999 to stay within 10000 rows
        return result;
    };
};
