const {describe, it} = require('node:test');
const assert = require('node:assert');
const CustomValues = require('../../../src/classes/v3/CustomValues');

describe('CustomValues', () => {
    it('Creation Success', () => {
        const custom = new CustomValues({
            abc: 1,
        });
        assert.strictEqual(custom.isValid(), true);
    });
});