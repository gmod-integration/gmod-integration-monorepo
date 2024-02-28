const {describe, it} = require('node:test');
const assert = require('node:assert');
const Team = require('../../../src/classes/v3/Team');

describe('Team', () => {
    it('Creation Success', () => {
        const team = new Team({
            id: 'id',
            name: 'ok'
        });
        assert.strictEqual(team.isValid(), true);
    });

    it('Creation Fail', () => {
        const team = new Team({
            id: 'id'
        });
        assert.strictEqual(team.isValid(), false);
    });
});