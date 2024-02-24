const {describe, it} = require('node:test');
const assert = require('node:assert');
const Position = require('../../../classes/v3/Position');

describe('Position', () => {
    it('Creation Success', () => {
        const pos = new Position({
            x: 1,
            y: 2,
            z: 3
        });
        assert.strictEqual(pos.isValid(), true);
    });

    it('Creation Fail', () => {
        const pos = new Position({
            x: 1,
            y: 2
        });
        assert.strictEqual(pos.isValid(), false);
    });
});