// Every visual style the heatmap can render, and how the scene around it is set up.
//   theme:  built-in colors (null = the user's theme picker applies)
//   camera: default view direction and distance
//   bloom:  glow post-processing, for styles with lights in them
import { createCity } from './city.js';
import { createNightCity } from './nightcity.js';
import { createGalaxy } from './galaxy.js';
import { createForest, FOREST_PALETTES } from './forest.js';

export const STYLES = {
  city: {
    name: 'City',
    theme: null,
    create: (ctx) => createCity(ctx),
    camera: { dir: [-18, 32, 52], dist: 64, boardWidth: 53 }, // boardWidth: width of the grid, for the intro
    stl: true,
  },
  night: {
    name: 'Night City',
    theme: 'night',
    create: createNightCity,
    camera: { dir: [-42, 20, 40], dist: 50, halfWidth: 26, boardWidth: 69 }, // diagonal, down the avenues
    bloom: { strength: 0.85, radius: 0.45, threshold: 0.55 },
    shadows: false,
    lights: { hemi: ['#8aa0ff', '#070b1a', 0.7], sun: ['#9fb4ff', 0.9], rim: ['#5f7bff', 0.5] },
    stl: true,
  },
  galaxy: {
    name: 'Galaxy',
    theme: 'galaxy',
    create: createGalaxy,
    camera: { dir: [0, 34, 42], dist: 80, halfWidth: 44, boardWidth: 70 },
    bloom: { strength: 0.7, radius: 0.5, threshold: 0.55 },
    lights: { hemi: ['#ffffff', '#05030d', 0.5], sun: ['#ffd9a8', 1.1], rim: ['#b58cff', 0.5] },
    fog: false,
    shadows: false,
  },
  forest: {
    name: 'Forest',
    theme: 'grove',
    create: createForest,
    palettes: FOREST_PALETTES, // leaf colors, picked like themes
    camera: { dir: [-42, 22, 40], dist: 52, halfWidth: 26, boardWidth: 66 }, // diagonal, looking into the forest
    lights: { hemi: ['#ffffff', '#86b85a', 1.5], sun: ['#fff1d6', 2.2], rim: ['#ffd36b', 0.4] },
  },
};

export const DEFAULT_STYLE = 'city';

export function getStyle(id) {
  return STYLES[id] ? id : DEFAULT_STYLE;
}
