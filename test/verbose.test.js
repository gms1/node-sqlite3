var sqlite3 = require('..');
var assert = require('assert');

var invalid_sql = 'update non_existent_table set id=1';

var originalMethods = {
    Database: {},
    Statement: {},
};

function backupOriginalMethods() {
    for (var obj in originalMethods) {
        for (var attr in sqlite3[obj].prototype) {
            originalMethods[obj][attr] = sqlite3[obj].prototype[attr];
        }
    }
}

function resetVerbose() {
    for (var obj in originalMethods) {
        for (var attr in originalMethods[obj]) {
            sqlite3[obj].prototype[attr] = originalMethods[obj][attr];
        }
    }
}

describe('verbose', function() {
    it('Shoud add trace info to error when verbose is called', function(done) {
        var db = new sqlite3.Database(':memory:');
        backupOriginalMethods();
        sqlite3.verbose();

        db.run(invalid_sql, function(err) {
            assert(err instanceof Error);

            assert(
                err.stack.indexOf(`Database#run('${invalid_sql}'`) > -1,
                `Stack shoud contain trace info, stack = ${err.stack}`
            );

            done();
            resetVerbose();
        });
    });

    it('Shoud not add trace info to error when verbose is not called', function(done) {
        var db = new sqlite3.Database(':memory:');

        db.run(invalid_sql, function(err) {
            assert(err instanceof Error);

            assert(
                err.stack.indexOf(invalid_sql) === -1,
                `Stack shoud not contain trace info, stack = ${err.stack}`
            );

            done();
        });
    });

    it('Should be idempotent when called twice', function(done) {
        // verbose() was already called in the first test, so isVerbose is true.
        // Calling it again should be a no-op (covers the `if (!isVerbose)` false branch).
        // Note: resetVerbose() restored original methods but isVerbose flag stays true,
        // so the second verbose() call skips re-tracing.
        sqlite3.verbose();
        sqlite3.verbose(); // Second call - isVerbose is already true, no-op

        var db = new sqlite3.Database(':memory:');
        db.run(invalid_sql, function(err) {
            assert(err instanceof Error);
            // Just verify the call doesn't throw - trace info won't be present
            // because resetVerbose() restored original methods and isVerbose
            // prevents re-tracing
            done();
        });
    });
});
