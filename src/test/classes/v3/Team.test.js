const test = require('node:test');
const assert = require('node:assert');
const Team = require('../../../classes/v3/Team');

test('Team Creation Success', () => {
    const team = new Team({
        id: 'id',
        name: 'ok'
    });
    assert.strictEqual(team.isValid(), true);
});

test('Team Creation Fail', () => {
    const team = new Team({
        id: 'id'
    });
    assert.strictEqual(team.isValid(), false);
});