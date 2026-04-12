'use strict';
exports.readonly = false; // Updating rows individually (`.run()`)

exports['better-sqlite3'] = (db, { table, columns, count }) => {
    const stmt = db.prepare(`UPDATE ${table} SET ${columns.map(c => `${c} = @${c}`).join(', ')} WHERE rowid = @rowid`);
    const row = db.prepare(`SELECT ${columns.join(', ')} FROM ${table} LIMIT 1`).get();
    let rowid = -1;
    return () => stmt.run({ ...row, rowid: ++rowid % count + 1 });
};

exports['@homeofthings/sqlite3'] = async (db, { table, columns, count }) => {
    const stmt = await db.prepare(`UPDATE ${table} SET ${columns.map(c => `${c} = @${c}`).join(', ')} WHERE rowid = @rowid`);
    const row = Object.assign({}, ...Object.entries(await db.get(`SELECT ${columns.join(', ')} FROM ${table} LIMIT 1`))
        .filter(([k]) => columns.includes(k))
        .map(([k, v]) => ({ ['@' + k]: v })));
    let rowid = -1;
    return async () => await stmt.run({ ...row, '@rowid': ++rowid % count + 1 });
};

exports['node:sqlite'] = (db, { table, columns, count }) => {
    const stmt = db.prepare(`UPDATE ${table} SET ${columns.map(c => `${c} = @${c}`).join(', ')} WHERE rowid = @rowid`);
    const row = db.prepare(`SELECT ${columns.join(', ')} FROM ${table} LIMIT 1`).get();
    let rowid = -1;
    return () => stmt.run({ ...row, rowid: ++rowid % count + 1 });
};
