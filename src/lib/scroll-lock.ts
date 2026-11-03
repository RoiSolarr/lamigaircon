// Stops the page behind a pop up box from scrolling. Returns the undo function.
// The scrollbar's width is kept as padding so the page does not jump sideways.
export function lockScroll() {
  const html = document.documentElement;
  const gap = window.innerWidth - html.clientWidth;
  const before = { overflow: html.style.overflow, padding: document.body.style.paddingRight };
  html.style.overflow = "hidden";
  if (gap > 0) document.body.style.paddingRight = `${gap}px`;
  return () => {
    html.style.overflow = before.overflow;
    document.body.style.paddingRight = before.padding;
  };
}
