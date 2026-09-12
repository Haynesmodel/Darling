import type * as Plot from '@observablehq/plot';
import * as generated from '../../js/charting/vendor/charting-vendor.js';

export function areaY(...args: Parameters<typeof Plot.areaY>) { return (generated.areaY as unknown as typeof Plot.areaY)(...args); }
export function barX(...args: Parameters<typeof Plot.barX>) { return (generated.barX as unknown as typeof Plot.barX)(...args); }
export function barY(...args: Parameters<typeof Plot.barY>) { return (generated.barY as unknown as typeof Plot.barY)(...args); }
export function dot(...args: Parameters<typeof Plot.dot>) { return (generated.dot as unknown as typeof Plot.dot)(...args); }
export function lineY(...args: Parameters<typeof Plot.lineY>) { return (generated.lineY as unknown as typeof Plot.lineY)(...args); }
export function plot(...args: Parameters<typeof Plot.plot>) { return (generated.plot as unknown as typeof Plot.plot)(...args); }
export function ruleX(...args: Parameters<typeof Plot.ruleX>) { return (generated.ruleX as unknown as typeof Plot.ruleX)(...args); }
export function ruleY(...args: Parameters<typeof Plot.ruleY>) { return (generated.ruleY as unknown as typeof Plot.ruleY)(...args); }
export function text(...args: Parameters<typeof Plot.text>) { return (generated.text as unknown as typeof Plot.text)(...args); }
