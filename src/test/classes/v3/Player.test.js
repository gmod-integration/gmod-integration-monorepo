const {describe, it} = require('node:test');
const assert = require('node:assert');
const {Player} = require('../../../classes/v3/Player');

describe('Player', () => {
    it('Creation Success', () => {
        const ply = new Player({
            steamID: 'STEAM_0:0:11101',
            steamID64: '0123456789',
            connectTime: 1,
            kills: 1,
            customValues: {'key': 'value'},
            deaths: 1,
            team: {id: 'id', name: 'ok'},
            name: 'name',
            userGroup: 'userGroup',
            position: {x: 1, y: 2, z: 3},
            angle: {p: 1, y: 2, r: 3}
        });
        assert.strictEqual(ply.isValid(), true);
    });

    it('Creation Fail', () => {
        const ply = new Player({
            steamID: 'STEAM_0:0:11101',
            steamID64: '0123456789',
            connectTime: 1,
            kills: 1,
            customValues: {
                key: 'value'
            },
        });
        assert.strictEqual(ply.isValid(), false);
    });
});