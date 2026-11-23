// Les jeux au tour par tour : une table de règles utilisée par le navigateur et par le serveur.
import { c4 } from './c4.js';
import { dames } from './dames.js';
import { mastermind } from './mastermind.js';
import { memory } from './memory.js';
import { pendu } from './pendu.js';
export const RULES = { c4, dames, mastermind, memory, pendu };
