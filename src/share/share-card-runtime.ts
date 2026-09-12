import './share-card.entry.css';
import { renderShareCardSvg } from '../../js/share-card-svg.js';
import type { ShareCardSpec } from './share-card-types';

type Preview = {
  dialog: HTMLDialogElement;
  opener: HTMLElement;
  token: number;
  urls: string[];
};

let active: Preview | null = null;
let generation = 0;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  value.className = className;
  value.textContent = text;
  return value;
}

function button(label: string, className = 'btn'): HTMLButtonElement {
  const value = element('button', className, label);
  value.type = 'button';
  return value;
}

function cleanup(preview: Preview, restore: boolean): void {
  generation += 1;
  preview.urls.forEach(URL.revokeObjectURL);
  document.body.classList.remove('no-scroll');
  if (preview.dialog.open) preview.dialog.close();
  preview.dialog.remove();
  if (active === preview) active = null;
  if (restore && preview.opener.isConnected) preview.opener.focus();
}

export function closeShareCardPreview(opener?: HTMLElement): void {
  if (active && (!opener || active.opener === opener)) cleanup(active, false);
}

async function pngFromSvg(svgUrl: string): Promise<Blob> {
  const image = new Image();
  image.src = svgUrl;
  await image.decode();
  const canvas = element('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext('2d');
  if (!context) throw new Error();
  context.drawImage(image, 0, 0, 1200, 630);
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error()),
    'image/png',
  ));
}

export async function openShareCardPreview(spec: ShareCardSpec, opener: HTMLElement): Promise<void> {
  if (active) cleanup(active, false);
  const preview: Preview = {
    dialog: element('dialog', 'share-card-dialog'),
    opener,
    token: ++generation,
    urls: [],
  };
  active = preview;
  const { dialog } = preview;
  dialog.setAttribute('aria-labelledby', 'shareCardDialogTitle');
  dialog.setAttribute('aria-describedby', 'shareCardDialogDescription');
  dialog.setAttribute('aria-busy', 'true');
  const headingRow = element('div', 'share-card-dialog-heading');
  const heading = element('h2', '', 'Share card preview');
  heading.id = 'shareCardDialogTitle';
  heading.tabIndex = -1;
  const close = button('Close', 'share-card-close');
  close.setAttribute('aria-label', 'Close share card preview');
  headingRow.append(heading, close);
  const description = element('p', 'muted', spec.altText);
  description.id = 'shareCardDialogDescription';
  const image = element('img', 'share-card-preview');
  image.alt = spec.altText;
  const status = element('p', 'share-card-status', 'Generating card…');
  status.setAttribute('aria-live', 'polite');
  const url = element('input', 'share-card-url');
  url.type = 'url';
  url.readOnly = true;
  url.value = spec.canonicalUrl;
  url.setAttribute('aria-label', 'Canonical source link');
  const actions = element('div', 'share-card-dialog-actions');
  const copy = button('Copy link');
  const png = element('a', 'btn', 'Download PNG');
  png.download = spec.filename;
  png.hidden = true;
  const svg = element('a', 'btn', 'Download SVG');
  svg.download = spec.filename.replace(/\.png$/, '.svg');
  svg.hidden = true;
  actions.append(copy, png, svg);
  dialog.append(headingRow, description, image, status, url, actions);
  document.body.append(dialog);
  document.body.classList.add('no-scroll');
  dialog.showModal();
  requestAnimationFrame(() => heading.focus());

  const closeDialog = () => cleanup(preview, true);
  close.onclick = closeDialog;
  dialog.oncancel = event => {
    event.preventDefault();
    closeDialog();
  };
  dialog.onclick = event => {
    if (event.target === dialog) closeDialog();
  };
  dialog.onkeydown = event => {
    if (event.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]),a[href]:not([hidden]),input:not([disabled]):not([hidden])',
    )].filter(item => !item.hidden);
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  copy.onclick = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(spec.canonicalUrl);
      status.textContent = 'Link copied.';
    } catch {
      url.focus();
      url.select();
      status.textContent = 'Copy is unavailable; the link is selected.';
    }
  };

  const svgBlob = new Blob([renderShareCardSvg(spec)], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  preview.urls.push(svgUrl);
  image.src = svgUrl;
  svg.href = svgUrl;
  let file: File | null = null;
  try {
    const pngBlob = await pngFromSvg(svgUrl);
    if (active !== preview || generation !== preview.token) return;
    const pngUrl = URL.createObjectURL(pngBlob);
    preview.urls.push(pngUrl);
    png.href = pngUrl;
    png.hidden = false;
    status.textContent = 'Card ready.';
    try {
      file = new File([pngBlob], spec.filename, { type: 'image/png' });
    } catch {
      file = null;
    }
  } catch {
    if (active === preview && generation === preview.token) {
      svg.hidden = false;
      status.textContent = 'PNG creation failed; download the SVG card.';
    }
  }
  if (active !== preview || generation !== preview.token) return;
  let acceptsFile = false;
  try {
    acceptsFile = Boolean(file && navigator.canShare?.({ files: [file] }));
  } catch {
    acceptsFile = false;
  }
  const sharePayload = file && acceptsFile
    ? { files: [file], title: spec.title, text: spec.altText, url: spec.canonicalUrl }
    : { title: spec.title, text: spec.altText, url: spec.canonicalUrl };
  if (navigator.share) {
    const share = button(file && 'files' in sharePayload ? 'Share image' : 'Share link');
    share.onclick = async () => {
      try {
        await navigator.share(sharePayload);
        status.textContent = 'Shared.';
      } catch (error) {
        status.textContent = (error as DOMException).name === 'AbortError'
          ? 'Share canceled.'
          : 'Share failed; copy or download remains available.';
      }
    };
    actions.prepend(share);
  }
  dialog.removeAttribute('aria-busy');
}
