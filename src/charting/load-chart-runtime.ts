import type { ChartRuntimeModule } from './chart-types';

let runtimePromise: Promise<ChartRuntimeModule> | null = null;
type RuntimeImporter = () => Promise<ChartRuntimeModule>;
const defaultImporter: RuntimeImporter = () => import('./plot-charts.ts').then(module => ({
  renderChart: module.renderChart,
}));
let runtimeImporter = defaultImporter;

export function loadChartRuntime(): Promise<ChartRuntimeModule> {
  if (runtimePromise) return runtimePromise;
  runtimePromise = runtimeImporter().catch((error: unknown) => {
    runtimePromise = null;
    throw error;
  });
  return runtimePromise;
}

export function resetChartRuntimeForTests(): void {
  runtimePromise = null;
  runtimeImporter = defaultImporter;
}

export function setChartRuntimeImporterForTests(importer: RuntimeImporter): void {
  runtimePromise = null;
  runtimeImporter = importer;
}
