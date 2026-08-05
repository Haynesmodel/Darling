import type * as Plot from '@observablehq/plot';
import * as generated from '../../js/charting/vendor/charting-vendor.js';

const generatedAreaY = generated.areaY as unknown as typeof Plot.areaY;
const generatedBarX = generated.barX as unknown as typeof Plot.barX;
const generatedBarY = generated.barY as unknown as typeof Plot.barY;
const generatedDot = generated.dot as unknown as typeof Plot.dot;
const generatedLineY = generated.lineY as unknown as typeof Plot.lineY;
const generatedPlot = generated.plot as unknown as typeof Plot.plot;
const generatedRuleX = generated.ruleX as unknown as typeof Plot.ruleX;
const generatedRuleY = generated.ruleY as unknown as typeof Plot.ruleY;
const generatedText = generated.text as unknown as typeof Plot.text;

export const areaY = (...args: Parameters<typeof Plot.areaY>): ReturnType<typeof Plot.areaY> => generatedAreaY(...args);
export const barX = (...args: Parameters<typeof Plot.barX>): ReturnType<typeof Plot.barX> => generatedBarX(...args);
export const barY = (...args: Parameters<typeof Plot.barY>): ReturnType<typeof Plot.barY> => generatedBarY(...args);
export const dot = (...args: Parameters<typeof Plot.dot>): ReturnType<typeof Plot.dot> => generatedDot(...args);
export const lineY = (...args: Parameters<typeof Plot.lineY>): ReturnType<typeof Plot.lineY> => generatedLineY(...args);
export const plot = (...args: Parameters<typeof Plot.plot>): ReturnType<typeof Plot.plot> => generatedPlot(...args);
export const ruleX = (...args: Parameters<typeof Plot.ruleX>): ReturnType<typeof Plot.ruleX> => generatedRuleX(...args);
export const ruleY = (...args: Parameters<typeof Plot.ruleY>): ReturnType<typeof Plot.ruleY> => generatedRuleY(...args);
export const text = (...args: Parameters<typeof Plot.text>): ReturnType<typeof Plot.text> => generatedText(...args);
