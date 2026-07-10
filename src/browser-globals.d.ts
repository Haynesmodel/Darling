declare const window: any;
declare const document: any;
declare function requestAnimationFrame(callback: (...args: any[]) => void): number;
declare class PopStateEvent {
  constructor(type: string, eventInitDict?: any);
}

interface Window {
  darlingTables?: import('./tables/table-types').DarlingTableRuntime;
}
