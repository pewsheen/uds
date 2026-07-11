export type Clock = {
  start: (onTick: (t: number) => void) => void;
  stop: () => void;
};

export function createClock(getTime: () => number): Clock {
  let raf = 0;
  return {
    start(onTick) {
      const loop = () => {
        onTick(getTime());
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
