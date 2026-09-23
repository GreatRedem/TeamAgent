import assert from 'node:assert/strict';

import {
    emptyRoster,
    findMember,
    MEMBERS_MAX,
    parseRoster,
    ROSTER_CONTENT_MAX,
    ROSTER_INLINE_MAX,
    RosterError,
    removeMember,
    replaceMember,
    rosterPrompt,
    serializeRoster,
    upsertMember,
} from '../routes/team/team.roster.js';

const sample = serializeRoster({
    members: [
        {
            name: 'Alex',
            rank: 'founder',
            description: 'runs the place',
            social: { x: '@alex', github: 'alexk' },
        },
        { name: 'Sam', rank: 'engineer', description: 'ships the backend' },
    ],
});

const tests: Array<[string, () => void]> = [
    [
        'the form saves a whole member: emptied fields go, extra fields an agent kept stay',
        () => {
            const roster = parseRoster(sample);
            const withExtra = upsertMember(roster, { name: 'Alex', email: 'alex@example.com' });
            const saved = replaceMember(withExtra, 'Alex', {
                name: 'Alex',
                rank: 'founder',
                description: '',
                social: { telegram: '@alexk' },
                profile_id: 12,
            });
            const alex = findMember(saved, 'alex');

            assert.equal(alex?.description, undefined, 'a cleared field is removed');
            assert.deepEqual(
                alex?.social,
                { telegram: '@alexk' },
                'social is replaced, not merged',
            );
            assert.equal(alex?.['profile_id'], 12);
            assert.equal(
                alex?.['email'],
                'alex@example.com',
                'a field the form does not own is kept',
            );
        },
    ],

    [
        'a save can rename a member, but never onto someone else',
        () => {
            const roster = parseRoster(sample);
            const renamed = replaceMember(roster, 'Sam', { name: 'Samantha', rank: 'lead' });

            assert.equal(findMember(renamed, 'Sam'), undefined);
            assert.equal(findMember(renamed, 'Samantha')?.rank, 'lead');
            assert.equal(renamed.members.length, 2);
            assert.throws(() => replaceMember(roster, 'Sam', { name: 'alex' }), RosterError);
            assert.throws(() => replaceMember(roster, undefined, { name: 'ALEX' }), RosterError);
            assert.throws(() => replaceMember(roster, undefined, { rank: 'x' }), RosterError);

            const added = replaceMember(roster, undefined, { name: 'Kim', profile_id: -4 });

            assert.equal(added.members.length, 3);
            assert.equal(
                findMember(added, 'Kim')?.['profile_id'],
                undefined,
                'a bad profile id is dropped',
            );
        },
    ],

    [
        'team.json goes into the instructions whole, or as a pointer when it is too big',
        () => {
            assert.equal(rosterPrompt(''), '');
            assert.equal(rosterPrompt('{oops'), '');

            const small = rosterPrompt(sample);

            assert.ok(small.includes('"rank": "founder"'));
            assert.ok(small.includes('```json'));

            const big = serializeRoster({
                members: Array.from({ length: 60 }, (_, i) => ({
                    name: `Person ${i}`,
                    description: 'x'.repeat(200),
                })),
            });
            const pointer = rosterPrompt(big);

            assert.ok(big.length > ROSTER_INLINE_MAX);
            assert.ok(pointer.includes('roster_read'));
            assert.ok(pointer.includes('60 people'));
            assert.ok(!pointer.includes('```json'));
        },
    ],

    [
        'an empty file reads as a roster with nobody in it',
        () => {
            assert.deepEqual(parseRoster(''), emptyRoster());
            assert.deepEqual(parseRoster('   \n '), emptyRoster());
        },
    ],

    [
        'a damaged file is refused, not read as empty',
        () => {
            for (const bad of ['{oops', '[]', '"a string"', '42', 'null']) {
                assert.throws(() => parseRoster(bad), RosterError, `accepted ${bad}`);
            }

            assert.throws(
                () => parseRoster('{"members":{}}'),
                RosterError,
                'accepted a non-array members',
            );
        },
    ],

    [
        'a member with no usable name is dropped, not kept as a blank',
        () => {
            const roster = parseRoster(
                JSON.stringify({
                    members: [
                        { name: 'Real' },
                        { name: '   ' },
                        { rank: 'nameless' },
                        null,
                        'string',
                        [],
                    ],
                }),
            );

            assert.deepEqual(
                roster.members.map((member) => member.name),
                ['Real'],
            );
        },
    ],

    [
        'fields the roster does not know about survive a round trip',
        () => {
            const roster = parseRoster(
                JSON.stringify({
                    team: 'Acme',
                    members: [{ name: 'Alex', timezone: 'CET', pets: 2 }],
                }),
            );

            assert.equal(roster['team'], 'Acme');
            assert.equal(roster.members[0]['timezone'], 'CET');
            assert.equal(roster.members[0]['pets'], 2);
            assert.equal(parseRoster(serializeRoster(roster)).members[0]['timezone'], 'CET');
        },
    ],

    [
        'a member is found whatever the capitalisation',
        () => {
            const roster = parseRoster(sample);

            for (const spelling of ['Alex', 'alex', 'ALEX', '  alex  ']) {
                assert.ok(findMember(roster, spelling), `missed ${spelling}`);
            }

            assert.equal(findMember(roster, 'nobody'), undefined);
        },
    ],

    [
        'updating one field leaves the others alone',
        () => {
            const roster = upsertMember(parseRoster(sample), { name: 'alex', rank: 'CEO' });
            const alex = findMember(roster, 'Alex');

            assert.equal(alex?.rank, 'CEO');
            assert.equal(alex?.description, 'runs the place', 'the description was lost');
            assert.equal(alex?.name, 'Alex', 'the stored spelling was overwritten');
            assert.equal(roster.members.length, 2, 'a duplicate was added');
        },
    ],

    [
        'a new handle does not drop the handles already there',
        () => {
            const roster = upsertMember(parseRoster(sample), {
                name: 'Alex',
                social: { linkedin: 'alexk' },
            });

            assert.deepEqual(findMember(roster, 'Alex')?.social, {
                x: '@alex',
                github: 'alexk',
                linkedin: 'alexk',
            });
        },
    ],

    [
        'an unknown member is added rather than refused',
        () => {
            const roster = upsertMember(parseRoster(sample), { name: 'Jo', rank: 'design' });

            assert.equal(roster.members.length, 3);
            assert.equal(findMember(roster, 'jo')?.rank, 'design');
        },
    ],

    [
        'a member with no name cannot be written',
        () => {
            assert.throws(() => upsertMember(emptyRoster(), { name: '  ' }), RosterError);
        },
    ],

    [
        'removing reports whether there was anything to remove',
        () => {
            const roster = parseRoster(sample);

            assert.equal(removeMember(roster, 'ALEX').removed, true);
            assert.equal(removeMember(roster, 'ALEX').roster.members.length, 1);
            assert.equal(removeMember(roster, 'nobody').removed, false);
            assert.equal(roster.members.length, 2, 'the roster handed in was mutated');
        },
    ],

    [
        'a roster too large to store is refused rather than truncated',
        () => {
            const members = Array.from({ length: 200 }, (_, at) => ({
                name: `member-${at}`,
                description: 'x'.repeat(2000),
            }));

            assert.throws(() => serializeRoster({ members }), RosterError);
        },
    ],

    [
        'the member cap holds',
        () => {
            const members = Array.from({ length: MEMBERS_MAX }, (_, at) => ({
                name: `member-${at}`,
            }));

            assert.throws(() => upsertMember({ members }, { name: 'one-too-many' }), RosterError);

            assert.equal(
                upsertMember({ members }, { name: 'member-0', rank: 'lead' }).members.length,
                MEMBERS_MAX,
            );
        },
    ],

    [
        'stored text stays under the column ceiling and reparses',
        () => {
            const content = serializeRoster(parseRoster(sample));

            assert.ok(content.length <= ROSTER_CONTENT_MAX);
            assert.deepEqual(parseRoster(content).members, parseRoster(sample).members);
        },
    ],

    [
        'a handle that is not a string is dropped, not fatal',
        () => {
            const roster = parseRoster(
                JSON.stringify({ members: [{ name: 'Alex', social: { x: '@alex', broken: 42 } }] }),
            );

            assert.deepEqual(roster.members[0].social, { x: '@alex' });
        },
    ],
];

let failed = 0;

for (const [label, run] of tests) {
    try {
        run();

        console.log(`  ok    ${label}`);
    } catch (cause) {
        failed += 1;

        console.log(`  FAIL  ${label}`);
        console.log(`        ${cause instanceof Error ? cause.message : String(cause)}`);
    }
}

console.log(failed === 0 ? `\n${tests.length} passed` : `\n${failed} of ${tests.length} failed`);

process.exit(failed === 0 ? 0 : 1);
