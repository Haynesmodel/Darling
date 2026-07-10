import type { DarlingTableRow } from '../../tables/table-types';

interface ExpandedRowProps {
  row: DarlingTableRow;
  colSpan: number;
  detailId: string;
}

export default function ExpandedRow({ row, colSpan, detailId }: ExpandedRowProps) {
  return (
    <tr class="table-expanded-row" id={detailId}>
      <td colSpan={colSpan}>
        <dl class="table-expanded-details">
          {(row.details || []).map(detail => (
            <div key={`${detail.label}:${detail.value}`}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
        {row.links?.length ? (
          <div class="table-expanded-links">
            {row.links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
          </div>
        ) : null}
      </td>
    </tr>
  );
}
