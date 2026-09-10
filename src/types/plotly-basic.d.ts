declare module "plotly.js/dist/plotly-basic.min.js" {
  const plotly: {
    react: (element: HTMLElement, data: Record<string, unknown>[], layout: Record<string, unknown>, config: Record<string, unknown>) => Promise<unknown>;
    purge: (element: HTMLElement) => void;
    Plots: { resize: (element: HTMLElement) => void };
  };
  export default plotly;
}
