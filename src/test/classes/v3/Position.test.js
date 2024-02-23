const test = require('node:test');
const assert = require('node:assert');
const Position = require('../../../classes/v3/Position');

test('Position Creation Success', () => {
    const pos = new Position({
        x: 1,
        y: 2,
        z: 3
    });
    assert.strictEqual(pos.isValid(), true);
});

test('Position Creation Fail', () => {
    const pos = new Position({
        x: 1,
        y: 2
    });
    assert.strictEqual(pos.isValid(), false);
});