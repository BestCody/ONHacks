import { useLayoutEffect } from 'react';

// The judging and organizer tools size everything in rem. While one of them is open, this
// makes the root font size grow with the screen (see `html.ui-scale` in index.css), so the
// whole layout scales together from phones up to large monitors.
export function useScreenScale() {
  // Runs before the browser paints, so large screens never flash the page at the small size.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('ui-scale');
    return () => root.classList.remove('ui-scale');
  }, []);
}
