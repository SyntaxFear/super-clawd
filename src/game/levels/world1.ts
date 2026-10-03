import type { LevelDef } from '../builder';

/** 1-1: the tutorial. Move, jump, prompt blocks, the first Bug, Opus, a permission prompt, the flag. */
const L11: LevelDef = {
  id: '1-1',
  name: 'Hello, World',
  theme: 'terminal',
  music: 'overworld',
  time: 300,
  width: 232,
  build(b) {
    b.area(0, 205).area(210, 231);
    b.start(4);
    b.ground(0, 53);
    b.sign(1, 11, ['hello, world!', '← → move', '↑ / A jump']);
    b.deco('duck', 9, 11);

    // A first taste of tokens and a prompt block.
    b.arc(9, 9, 4);
    b.prompt(15, 8, 'token');

    // First block cluster with the Opus upgrade, then the first Bug.
    b.brick(19, 8).prompt(20, 8, 'power').prompt(21, 8, 'token').brick(22, 8);
    b.brick(20, 4, 2);
    b.enemy('bug', 26);
    b.deco('keys', 24, 11, { text: ['Y', 'N'] });

    // Indentation terraces.
    b.block(29, 11, 8, 1).block(31, 10, 4, 1).block(32, 9, 2, 1);
    b.tokens(32, 8, 2);
    b.enemy('bug', 34, 10);

    // Unix pipes.
    b.pipe(41, 2);
    b.enemy('bug', 45);
    b.pipe(48, 3);
    b.deco('rack', 51, 11);

    // First pit.
    b.arc(53, 8, 5);
    b.ground(57, 101);
    b.brick(60, 8, 2).prompt(62, 8, 'token').brick(63, 8).prompt(64, 8, 'token');
    b.brick(61, 4, 3, undefined).prompt(62, 4, 'token');
    b.hidden(68, 8, 'oneup');
    b.enemy('bug', 67).enemy('bug', 69);

    b.checkpoint(73);
    b.deco('duck', 75, 11);

    // Infinite Loop lesson: curl it up, kick it into the Bug parade.
    b.enemy('loop', 80);
    b.enemy('bug', 87).enemy('bug', 89).enemy('bug', 91);
    b.tokens(84, 8, 3);

    // Permission prompt.
    b.sign(93, 11, ['permission', 'required']);
    b.gate(98, 'npm test', true);

    // Pits, the /.cache pipe and a second pit.
    b.ground(105, 112);
    b.arc(101, 8, 5);
    b.pipe(108, 3, { warp: 'cache' });
    b.ground(115, 179);
    b.arc(112, 9, 4);

    // Prompt-block constellation.
    b.prompt(119, 8, 'token').prompt(122, 8, 'token').prompt(125, 8, 'token');
    b.prompt(122, 4, 'power');
    b.enemy('bug', 124).enemy('bug', 126);
    b.enemy('loop', 133);
    b.pipe(136, 2, { exit: 'cache-out' });
    b.deco('keys', 139, 11, { text: ['⏎', '⇥', '/'] });

    // Bypass Permissions hidden in a brick row, then an enemy rush.
    b.brick(143, 8, 2).brick(145, 8, 1, 'bypass').brick(146, 8, 2);
    b.brick(147, 4, 1, 'multi');
    b.enemy('bug', 153).enemy('bug', 155).enemy('bug', 157).enemy('loop', 160);

    // Title-bar platforms over two pits.
    b.clear(164, 167, 12, 13);
    b.oneway(165, 9, 2);
    b.clear(171, 174, 12, 13);
    b.oneway(172, 8, 2);
    b.tokens(165, 8, 2).tokens(172, 7, 2);
    b.enemy('bug', 169);

    // Deploy ramp and the goal.
    b.ground(175, 205);
    b.stairs(180, 6, 'up');
    b.goal(192);

    // Bonus room: ~/.cache
    b.block(210, 0, 2, 14).block(230, 0, 2, 14);
    b.ground(212, 229);
    b.brick(214, 1, 16);
    b.dropExit('cache', 212, 0);
    for (let row = 5; row <= 9; row += 2) b.tokens(215, row, 9);
    b.oneway(215, 10, 9);
    b.sign(213, 11, ['~/.cache']);
    b.pipe(226, 2, { warp: 'cache-out' });
  },
};

export const WORLD1: LevelDef[] = [L11];
