'use strict';
exports.readonly = false; // Updating 100 rows in a single transaction

exports['better-sqlite3'] = (db, { table, columns, count }) => {
    const stmt = db.prepare(`UPDATE ${table} SET ${columns.map(c => `${c} = @${c}`).join(', ')} WHERE rowid = @rowid`);
    const row = db.prepare(`SELECT ${columns.join(', ')} FROM ${table} LIMIT 1`).get();
    const trx = db.transaction((row) => {
        for (let i = 0; i < 100; ++i) stmt.run({ ...row, rowid: (i % count) + 1 });
    });
    return () => trx(row);
};

exports['@homeofthings/sqlite3'] = async (db, { table, columns, count }) => {
    const stmt = await db.prepare(`UPDATE ${table} SET ${columns.map(c => `${c} = @${c}`).join(', ')} WHERE rowid = @rowid`);
    const row = Object.assign({}, ...Object.entries(await db.get(`SELECT ${columns.join(', ')} FROM ${table} LIMIT 1`))
        .filter(([k]) => columns.includes(k))
        .map(([k, v]) => ({ ['@' + k]: v })));
    return async () => {
        await db.run('BEGIN');
        try {
            for (let i = 0; i < 100; ++i) await stmt.run({ ...row, '@rowid': (i % count) + 1 });
            await db.run('COMMIT');
        } catch (err) {
            await db.run('ROLLBACK');
            throw err;
        }
    };
};

exports['node:sqlite'] = (db, { table, columns, count }) => {
    const stmt = db.prepare(`UPDATE ${table} SET ${columns.map(c => `${c} = @${c}`).join(', ')} WHERE rowid = @rowid`);
    const row = db.prepare(`SELECT ${columns.join(', ')} FROM ${table} LIMIT 1`).get();
    return () => {
        db.exec('BEGIN');
        try {
            for (let i = 0; i < 100; ++i) stmt.run({ ...row, rowid: (i % count) + 1 });
            db.exec('COMMIT');
        } catch (err) {
            db.isTransaction && db.exec('ROLLBACK');
            throw err;
        }
    };
};
