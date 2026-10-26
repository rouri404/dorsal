// The latest bar heights (0..6 per band), written by the music engine and read by the 3D preview
// each frame, outside React: they change 50 times a second.

let live: number[] | null = null;

export const setLiveBars = (heights: number[] | null) => {
  live = heights;
};

/** The heights now, or null when no sound is being heard. */
export const liveBars = (): number[] | null => live;
