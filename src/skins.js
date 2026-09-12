/**
 * Cosmetic-only skins. Prices are in Luna (1 NIM = 100,000 Luna).
 * Skins never affect gameplay — that is a hard rule of NimHouse.
 */

export const CHICK_SKINS = [
  {
    id: 'classic',
    name: 'Absurd Chick',
    price: 0,
    colors: { body: '#fff3d6', wing: '#ffd9a0', comb: '#e63946', beak: '#ff9f1c', mustache: '#5b3a1e' },
  },
  {
    id: 'nimiq',
    name: 'Nimiq Green',
    price: 1000,
    colors: { body: '#d9ffe8', wing: '#5fd48a', comb: '#e63946', beak: '#ff9f1c', mustache: '#20603f' },
  },
  {
    id: 'gold',
    name: 'Gold Fluff',
    price: 5000,
    accessory: 'crown',
    colors: { body: '#ffe9a3', wing: '#f5c542', comb: '#d1495b', beak: '#ffb703', mustache: '#8a6d1d' },
  },
  {
    id: 'space',
    name: 'Space Chick',
    price: 10000,
    accessory: 'helmet',
    colors: { body: '#e6ecff', wing: '#9db4ff', comb: '#e63946', beak: '#ff9f1c', mustache: '#33406e' },
  },
  {
    id: 'lava',
    name: 'Lava Chick',
    price: 10000,
    accessory: 'sunglasses',
    colors: { body: '#ffb08a', wing: '#ff5d3b', comb: '#ffd23f', beak: '#ffd23f', mustache: '#7a2d12' },
  },
]

export const DART_SKINS = [
  { id: 'classic', name: 'House Dart', price: 0, colors: { barrel: '#c0c6cf', flight: '#e63946' } },
  { id: 'nim', name: 'NIM Dart', price: 1000, colors: { barrel: '#5fd48a', flight: '#0e5c34' } },
  { id: 'fire', name: 'Inferno Dart', price: 5000, colors: { barrel: '#ffb703', flight: '#d1495b' } },
]

export const STACK_SKINS = [
  { id: 'mint', name: 'Mint Blocks', price: 0, hue: 158 },
  { id: 'sunset', name: 'Sunset Blocks', price: 1000, hue: 16 },
  { id: 'ocean', name: 'Ocean Blocks', price: 5000, hue: 205 },
]

export const SKIN_GROUPS = [
  { id: 'chick', label: 'NimChick outfits', skins: CHICK_SKINS },
  { id: 'dart', label: 'NimBullseye darts', skins: DART_SKINS },
  { id: 'stack', label: 'NimStack blocks', skins: STACK_SKINS },
]
