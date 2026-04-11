'use strict';
exports.readonly = false; // Inserting 100 rows in a single transaction

exports['better-sqlite3'] = (db, { table, columns }) => {
    const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(x => '@' + x).join(', ')})`);
    const row = db.prepare(`SELECT ${columns.join(', ')} FROM ${table} LIMIT 1`).get();
    const trx = db.transaction((row) => {
        for (let i = 0; i < 100; ++i) stmt.run(row);
    });
    return () => trx(row);
};

exports['@homeofthings/sqlite3'] = async (db, { table, columns }) => {
    const stmt = await db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(x => '@' + x).join(', ')})`);
    const row = Object.assign({}, ...Object.entries(await db.get(`SELECT ${columns.join(', ')} FROM ${table} LIMIT 1`))
        .filter(([k]) => columns.includes(k))
        .map(([k, v]) => ({ ['@' + k]: v })));
    return async () => {
        await db.run('BEGIN');
        try {
            for (let i = 0; i < 100; ++i) await stmt.run(row);
            await db.run('COMMIT');
        } catch (err) {
            await db.run('ROLLBACK');
            throw err;
        }
    };
};

exports['node:sqlite'] = (db, { table, columns }) => {
    const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(x => '@' + x).join(', ')})`);
    const row = db.prepare(`SELECT ${columns.join(', ')} FROM ${table} LIMIT 1`).get();
    return () => {
        db.exec('BEGIN');
        try {
            for (let i = 0; i < 100; ++i) stmt.run(row);
            db.exec('COMMIT');
        } catch (err) {
            db.isTransaction && db.exec('ROLLBACK');
            throw err;
        }
    };
};
