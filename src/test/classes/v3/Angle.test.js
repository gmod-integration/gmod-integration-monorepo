const test = require('node:test');
const assert = require('node:assert');
const Angle = require('../../../classes/v3/Angle');

test('Angle Creation Success', () => {
    const ang = new Angle({
        p: 1,
        y: 2,
        r: 3
    });
    assert.strictEqual(ang.isValid(), true);
});

test('Angle Creation Fail', () => {
    const ang = new Angle({
        p: 1,
        y: 2
    });
    assert.strictEqual(ang.isValid(), false);
});