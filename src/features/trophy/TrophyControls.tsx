export function TrophyControls({ owners, selectedOwner, onChange }: { owners: readonly string[]; selectedOwner: string; onChange: (owner: string) => void }) {
  return <label>Owner:
    <select id="trophyOwnerSelect" aria-label="Trophy case owner" value={selectedOwner} onChange={event => onChange((event.currentTarget as HTMLSelectElement).value)}>
      {owners.map(owner => <option value={owner} key={owner}>{owner}</option>)}
    </select>
  </label>;
}
