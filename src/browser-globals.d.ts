declare const window: any;
declare const document: any;
declare function requestAnimationFrame(callback: (...args: any[]) => void): number;
declare class PopStateEvent {
  constructor(type: string, eventInitDict?: any);
}

interface Window {
  darlingTables?: import('./tables/table-types').DarlingTableRuntime;
  darlingAccessibility?: any;
  darlingDataDiagnostics?: import('./data/load-league-assets').DataDiagnostics;
  darlingFeatureDiagnostics?: import('./app/app-types').AppDiagnostics;
  __darlingDataVersion?: string;
  __darlingRenderMetrics?: { filterRuns: number };
}
