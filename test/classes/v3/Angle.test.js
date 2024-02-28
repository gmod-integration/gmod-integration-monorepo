const {describe, it} = require('node:test');
const assert = require('node:assert');
const Angle = require('../../../src/classes/v3/Angle');

describe('Angle', () => {
    it('Creation Success', () => {
        const ang = new Angle({
            p: 1,
            y: 0,
            r: 3
        });
        assert.strictEqual(ang.isValid(), true);
    });

    it('Creation Fail', () => {
        const ang = new Angle({
            p: 1,
            y: 2
        });
        assert.strictEqual(ang.isValid(), false);
    });
});