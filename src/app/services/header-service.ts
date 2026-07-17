import { renderHeaderBanners, updateTeamHeader } from '../../../js/render-helpers.js';
import type { HeaderService, LeagueDataSnapshot } from '../app-types';

export function createHeaderService(doc: Document, data: LeagueDataSnapshot): HeaderService {
  return {
    team(owner) {
      updateTeamHeader(owner, data.seasonSummaries, doc);
    },
    feature(title, owner = null, documentTitle = title) {
      const heading = doc.querySelector('header h2');
      if (heading) heading.textContent = title;
      renderHeaderBanners(owner || '', data.seasonSummaries, doc);
      doc.title = documentTitle;
    },
  };
}
